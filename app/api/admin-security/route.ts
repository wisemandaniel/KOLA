import { env } from "cloudflare:workers";
import { getAuthenticatedUser } from "../../auth";
import { isSuperadmin } from "../../admin";
import { enforceRateLimit, rejectCrossSiteMutation, secureJson } from "../../security";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

async function currentActor() {
  const identity = await getAuthenticatedUser();
  if (!identity) return null;
  return env.DB.prepare("SELECT * FROM users WHERE id=?")
    .bind(identity.userId)
    .first<Row>();
}

function reject(message: string, status = 400) {
  return secureJson({ error: message }, status);
}

async function safeAll(sql: string, values: unknown[] = []) {
  try {
    let statement = env.DB.prepare(sql);
    if (values.length) statement = statement.bind(...values);
    return (await statement.all<Row>()).results;
  } catch (error) {
    console.warn("admin-security query skipped", error);
    return [];
  }
}

async function safeFirst(sql: string, values: unknown[] = []) {
  try {
    let statement = env.DB.prepare(sql);
    if (values.length) statement = statement.bind(...values);
    return await statement.first<Row>();
  } catch (error) {
    console.warn("admin-security metric skipped", error);
    return null;
  }
}

async function writeAudit(actorId: string, action: string, entityId: string, metadata: Row = {}) {
  try {
    await env.DB.prepare(`INSERT INTO audit_logs
      (id,actor_id,action,entity_type,entity_id,metadata,created_at)
      VALUES (?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), actorId, action, "security", entityId, JSON.stringify(metadata), Date.now())
      .run();
  } catch (error) {
    console.warn("admin-security audit skipped", error);
  }
}

export async function GET() {
  const actor = await currentActor();
  if (!actor) return reject("Authentication required", 401);
  if (!isSuperadmin(actor)) return reject("Superadmin access required", 403);

  const now = Date.now();
  const [activeSessions, expiredSessions, blockedWindows] = await Promise.all([
    safeFirst("SELECT COUNT(*) AS total FROM auth_sessions WHERE expires_at>?", [now]),
    safeFirst("SELECT COUNT(*) AS total FROM auth_sessions WHERE expires_at<=?", [now]),
    safeFirst("SELECT COUNT(*) AS total FROM rate_limits WHERE expires_at>? AND count>1", [now]),
  ]);

  const sessions = await safeAll(`SELECT s.id,s.user_id,s.expires_at,s.created_at,
    u.display_name,u.email,u.active_role,u.account_status
    FROM auth_sessions s LEFT JOIN users u ON u.id=s.user_id
    WHERE s.expires_at>? ORDER BY s.created_at DESC LIMIT 250`, [now]);

  const events = await safeAll(`SELECT se.id,se.user_id,se.event_type,se.severity,se.user_agent,
    se.metadata,se.created_at,u.display_name,u.email
    FROM security_events se LEFT JOIN users u ON u.id=se.user_id
    ORDER BY se.created_at DESC LIMIT 300`);

  return secureJson({
    metrics: {
      activeSessions: Number(activeSessions?.total ?? 0),
      expiredSessions: Number(expiredSessions?.total ?? 0),
      activeRateLimits: Number(blockedWindows?.total ?? 0),
    },
    sessions,
    events,
    actorId: String(actor.id),
  });
}

export async function POST(request: Request) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const actor = await currentActor();
  if (!actor) return reject("Authentication required", 401);
  if (!isSuperadmin(actor)) return reject("Superadmin access required", 403);

  const limited = await enforceRateLimit({
    request,
    scope: "admin.security.action",
    subject: String(actor.id),
    limit: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  let body: Row;
  try {
    body = await request.json() as Row;
  } catch {
    return reject("Invalid request body");
  }

  const action = String(body.action ?? "");
  const id = String(body.id ?? "");
  const now = Date.now();

  try {
    if (action === "revoke_session") {
      if (!id) return reject("Session id is required");
      const session = await env.DB.prepare("SELECT id,user_id FROM auth_sessions WHERE id=?")
        .bind(id).first<Row>();
      if (!session) return reject("Session not found", 404);
      await env.DB.prepare("DELETE FROM auth_sessions WHERE id=?").bind(id).run();
      await writeAudit(String(actor.id), "security.session_revoked", id, { userId: session.user_id });
      return secureJson({ ok: true });
    }

    if (action === "revoke_user_sessions") {
      if (!id) return reject("User id is required");
      if (id === String(actor.id)) return reject("Use sign out to end your own session", 409);
      const result = await env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(id).run();
      await writeAudit(String(actor.id), "security.user_sessions_revoked", id, { changes: result.meta.changes });
      return secureJson({ ok: true, revoked: result.meta.changes });
    }

    if (action === "cleanup_expired") {
      const results = await env.DB.batch([
        env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at<=?").bind(now),
        env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<=?").bind(now),
        env.DB.prepare("DELETE FROM auth_challenges WHERE expires_at<=? OR consumed_at IS NOT NULL").bind(now),
      ]);
      const removed = results.reduce((total, result) => total + Number(result.meta.changes ?? 0), 0);
      await writeAudit(String(actor.id), "security.expired_records_cleaned", "auth", { removed });
      return secureJson({ ok: true, removed });
    }

    return reject("Unknown security action", 404);
  } catch (error) {
    console.error("admin-security action failed", action, error);
    return reject(error instanceof Error ? error.message : "Security action failed", 500);
  }
}
