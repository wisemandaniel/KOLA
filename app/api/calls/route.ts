import { env } from "cloudflare:workers";
import { canAccessOrder, getRequestActor, type RequestActor } from "../../order-access";
import {
  enforceRateLimit,
  rejectCrossSiteMutation,
  secureJson,
} from "../../security";

export const dynamic = "force-dynamic";

const RING_TIMEOUT_MS = 90 * 1000;
const MAX_SDP_LENGTH = 100_000;
const MAX_CANDIDATE_LENGTH = 12_000;

type CallRow = {
  id: string;
  order_id: string;
  initiator_id: string;
  initiator_name: string;
  answered_by: string | null;
  status: string;
  offer_sdp: string;
  answer_sdp: string | null;
  created_at: number;
  answered_at: number | null;
  ended_at: number | null;
};

export async function GET(request: Request) {
  const actor = await getRequestActor();
  if (!actor) return reject("Authentication required", 401);

  const url = new URL(request.url);
  if (url.searchParams.get("inbox") === "1") {
    const incoming = await findIncomingCall(actor);
    return Response.json({ call: incoming });
  }

  const orderId = url.searchParams.get("orderId") ?? "";
  if (!orderId || !(await canAccessOrder(actor.id, actor.role, orderId))) {
    return reject("Order conversation not found", 404);
  }

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE voice_calls
     SET status = 'missed', ended_at = ?
     WHERE order_id = ? AND status = 'ringing' AND created_at < ?`,
  )
    .bind(now, orderId, now - RING_TIMEOUT_MS)
    .run();

  const call = await env.DB.prepare(
    `SELECT * FROM voice_calls
     WHERE order_id = ?
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(orderId)
    .first<CallRow>();

  if (!call) return Response.json({ call: null, candidates: [] });
  if (
    call.status === "active" &&
    actor.id !== call.initiator_id &&
    actor.id !== call.answered_by
  ) {
    return Response.json({
      call: { ...call, offer_sdp: "", answer_sdp: null },
      candidates: [],
    });
  }
  const candidates = await env.DB.prepare(
    `SELECT id, user_id, candidate, created_at
     FROM voice_call_candidates
     WHERE call_id = ?
     ORDER BY created_at ASC LIMIT 200`,
  )
    .bind(call.id)
    .all();

  return Response.json({ call, candidates: candidates.results });
}

export async function POST(request: Request) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const actor = await getRequestActor();
  if (!actor) return reject("Authentication required", 401);
  const limited = await enforceRateLimit({
    request,
    scope: "call.signal.user",
    subject: actor.id,
    limit: 120,
    windowSeconds: 10 * 60,
  });
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return reject("Invalid call request");
  }

  const action = String(body.action ?? "");
  if (action === "start") return startCall(actor, body);

  const callId = String(body.callId ?? "");
  const call = callId
    ? await env.DB.prepare("SELECT * FROM voice_calls WHERE id = ? LIMIT 1")
        .bind(callId)
        .first<CallRow>()
    : null;
  if (!call || !(await canAccessOrder(actor.id, actor.role, call.order_id))) {
    return reject("Call not found", 404);
  }

  if (action === "answer") {
    if (call.initiator_id === actor.id) return reject("The caller cannot answer this call.");
    const answer = validSignal(body.answer, MAX_SDP_LENGTH);
    if (!answer) return reject("Invalid call answer");
    const result = await env.DB.prepare(
      `UPDATE voice_calls
       SET status = 'active', answer_sdp = ?, answered_by = ?, answered_at = ?
       WHERE id = ? AND status = 'ringing' AND answered_by IS NULL`,
    )
      .bind(answer, actor.id, Date.now(), call.id)
      .run();
    if (!result.meta.changes) return reject("This call was answered or ended.", 409);
    return Response.json({ status: "active" });
  }

  if (action === "candidate") {
    const candidate = validSignal(body.candidate, MAX_CANDIDATE_LENGTH);
    if (!candidate || !["ringing", "active"].includes(call.status)) {
      return reject("The call is no longer active.", 409);
    }
    if (
      call.status === "active" &&
      actor.id !== call.initiator_id &&
      actor.id !== call.answered_by
    ) {
      return reject("This call was answered by another participant.", 409);
    }
    await env.DB.prepare(
      `INSERT INTO voice_call_candidates
        (id, call_id, user_id, candidate, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), call.id, actor.id, candidate, Date.now())
      .run();
    return Response.json({ accepted: true });
  }

  if (action === "decline") {
    if (call.initiator_id === actor.id) return reject("Use end call instead.");
    await env.DB.prepare(
      `UPDATE voice_calls SET status = 'declined', ended_at = ?
       WHERE id = ? AND status = 'ringing'`,
    )
      .bind(Date.now(), call.id)
      .run();
    return Response.json({ status: "declined" });
  }

  if (action === "end") {
    if (actor.id !== call.initiator_id && actor.id !== call.answered_by) {
      return reject("Only call participants can end this call.", 403);
    }
    await env.DB.prepare(
      `UPDATE voice_calls SET status = 'ended', ended_at = ?
       WHERE id = ? AND status IN ('ringing', 'active')`,
    )
      .bind(Date.now(), call.id)
      .run();
    return Response.json({ status: "ended" });
  }

  return reject("Unknown call action");
}

async function startCall(actor: RequestActor, body: Record<string, unknown>) {
  const orderId = String(body.orderId ?? "");
  const offer = validSignal(body.offer, MAX_SDP_LENGTH);
  if (!orderId || !offer) return reject("Invalid call request");
  if (!(await canAccessOrder(actor.id, actor.role, orderId))) {
    return reject("You are not part of this order.", 403);
  }

  const now = Date.now();
  const existing = await env.DB.prepare(
    `SELECT id FROM voice_calls
     WHERE order_id = ? AND status IN ('ringing', 'active') AND created_at > ?
     LIMIT 1`,
  )
    .bind(orderId, now - RING_TIMEOUT_MS)
    .first();
  if (existing) return reject("A call is already in progress for this order.", 409);

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO voice_calls
      (id, order_id, initiator_id, initiator_name, status, offer_sdp, created_at)
     VALUES (?, ?, ?, ?, 'ringing', ?, ?)`,
  )
    .bind(id, orderId, actor.id, actor.displayName, offer, now)
    .run();

  return Response.json({
    call: {
      id,
      order_id: orderId,
      initiator_id: actor.id,
      initiator_name: actor.displayName,
      answered_by: null,
      status: "ringing",
      offer_sdp: offer,
      answer_sdp: null,
      created_at: now,
    },
  });
}

async function findIncomingCall(actor: RequestActor): Promise<CallRow | null> {
  const now = Date.now();
  const common = `
    SELECT vc.* FROM voice_calls vc
    WHERE vc.status = 'ringing'
      AND vc.initiator_id != ?
      AND vc.created_at > ?
      AND vc.order_id IN (`;
  let query: string;

  if (actor.role === "customer") {
    query = `${common}SELECT id FROM orders WHERE customer_id = ?)
      ORDER BY vc.created_at DESC LIMIT 1`;
  } else if (actor.role === "vendor") {
    query = `${common}
      SELECT o.id FROM orders o
      JOIN vendors v ON o.vendor_id = v.id
      WHERE v.owner_id = ?)
      ORDER BY vc.created_at DESC LIMIT 1`;
  } else if (actor.role === "rider") {
    query = `${common}
      SELECT order_id FROM deliveries WHERE courier_id = ?)
      ORDER BY vc.created_at DESC LIMIT 1`;
  } else {
    return null;
  }

  return env.DB.prepare(query)
    .bind(actor.id, now - RING_TIMEOUT_MS, actor.id)
    .first<CallRow>();
}

function validSignal(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" || value.length < 2 || value.length > maxLength) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as { type?: unknown };
    return typeof parsed === "object" && parsed ? value : null;
  } catch {
    return null;
  }
}

function reject(message: string, status = 400) {
  return secureJson({ error: message }, status);
}
