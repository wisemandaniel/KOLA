import { env } from "cloudflare:workers";
import { canAccessOrder, getRequestActor } from "../../order-access";

export const dynamic = "force-dynamic";

type MessageRow = Record<string, unknown>;

const messageQuery = `
  SELECT m.*,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM message_receipts r
        WHERE r.message_id = m.id AND r.read_at IS NOT NULL
      ) THEN 'read'
      WHEN EXISTS (
        SELECT 1 FROM message_receipts r
        WHERE r.message_id = m.id AND r.delivered_at IS NOT NULL
      ) THEN 'delivered'
      ELSE 'sent'
    END AS delivery_status
  FROM messages m
  WHERE m.order_id = ?
  ORDER BY m.created_at ASC
  LIMIT 500
`;

export async function GET(request: Request) {
  const actor = await getRequestActor();
  if (!actor) return reject("Authentication required", 401);

  const orderId = new URL(request.url).searchParams.get("orderId")?.trim() ?? "";
  if (!orderId) return reject("Order is required.");
  if (!(await canAccessOrder(actor.id, actor.role, orderId))) {
    return reject("You are not part of this order.", 403);
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO message_receipts (id, message_id, user_id, delivered_at, read_at)
     SELECT lower(hex(randomblob(16))), m.id, ?, ?, ?
     FROM messages m
     WHERE m.order_id = ? AND m.sender_id != ?
     ON CONFLICT(message_id, user_id) DO UPDATE SET
       delivered_at = COALESCE(message_receipts.delivered_at, excluded.delivered_at),
       read_at = excluded.read_at`,
  )
    .bind(actor.id, now, now, orderId, actor.id)
    .run();

  const [result, typing] = await env.DB.batch([
    env.DB.prepare(messageQuery).bind(orderId),
    env.DB.prepare(
      `SELECT u.display_name
       FROM chat_presence cp JOIN users u ON u.id=cp.user_id
       WHERE cp.order_id=? AND cp.user_id!=? AND cp.last_typed_at>?`,
    ).bind(orderId, actor.id, now - 4500),
  ]);
  return Response.json(
    { messages: result.results, typing: typing.results },
    {
      headers: {
        "cache-control": "private, no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  const actor = await getRequestActor();
  if (!actor) return reject("Authentication required", 401);

  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return reject("The message could not be read.");
  }

  const orderId = String(input.orderId ?? "").trim();
  if (!orderId) return reject("Order is required.");
  if (!(await canAccessOrder(actor.id, actor.role, orderId))) {
    return reject("You are not part of this order.", 403);
  }

  if (input.action === "typing") {
    const active = Boolean(input.active);
    await env.DB.prepare(
      `INSERT INTO chat_presence (id,order_id,user_id,last_typed_at)
       VALUES (?,?,?,?)
       ON CONFLICT(order_id,user_id) DO UPDATE SET last_typed_at=excluded.last_typed_at`,
    )
      .bind(`${orderId}:${actor.id}`, orderId, actor.id, active ? Date.now() : 0)
      .run();
    return Response.json({ ok: true });
  }

  const body = String(input.body ?? "").trim();
  const requestedId = String(input.clientMessageId ?? "").trim();
  if (!body || body.length > 2000) {
    return reject("Message must be between 1 and 2000 characters.");
  }

  const id = /^[a-zA-Z0-9_-]{8,100}$/.test(requestedId)
    ? requestedId
    : crypto.randomUUID();
  const existing = await env.DB.prepare(
    "SELECT * FROM messages WHERE id = ? LIMIT 1",
  )
    .bind(id)
    .first<MessageRow>();
  if (existing) {
    if (
      String(existing.order_id) !== orderId ||
      String(existing.sender_id) !== actor.id
    ) {
      return reject("Message identifier conflict.", 409);
    }
    return Response.json({ message: { ...existing, delivery_status: "sent" } });
  }

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO messages
        (id, order_id, sender_id, sender_name, sender_role, body, message_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'text', ?)`,
    ).bind(
      id,
      orderId,
      actor.id,
      actor.displayName,
      actor.role,
      body,
      now,
    ),
    messageNotification(orderId, actor.id, actor.displayName, body, now),
  ]);

  return Response.json({
    message: {
      id,
      order_id: orderId,
      sender_id: actor.id,
      sender_name: actor.displayName,
      sender_role: actor.role,
      body,
      message_type: "text",
      created_at: now,
      delivery_status: "sent",
    },
  });
}

function messageNotification(
  orderId: string,
  senderId: string,
  senderName: string,
  body: string,
  createdAt: number,
) {
  return env.DB.prepare(
    `INSERT INTO notifications (id,user_id,type,title,body,link,created_at)
     SELECT lower(hex(randomblob(16))), participants.user_id, 'message', ?, ?, '/dashboard', ?
     FROM (
       SELECT o.customer_id AS user_id FROM orders o WHERE o.id=?
       UNION
       SELECT v.owner_id FROM orders o JOIN vendors v ON v.id=o.vendor_id WHERE o.id=?
       UNION
       SELECT d.courier_id FROM deliveries d WHERE d.order_id=? AND d.courier_id IS NOT NULL
     ) participants
     JOIN users u ON u.id=participants.user_id
     WHERE participants.user_id!=? AND u.notification_preferences='all'`,
  ).bind(
    `${senderName} sent a message`,
    body.slice(0, 180),
    createdAt,
    orderId,
    orderId,
    orderId,
    senderId,
  );
}

function reject(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
