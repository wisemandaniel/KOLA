import { env } from "cloudflare:workers";
import {
  createSession,
  hashValue,
  readRuntimeAuthConfig,
  safeReturnPath,
} from "../../../auth";
import {
  enforceRateLimit,
  recordSecurityEvent,
  rejectCrossSiteMutation,
  secureJson,
} from "../../../security";

export const dynamic = "force-dynamic";

type ExistingUser = { id: string };

export async function POST(request: Request) {
  let stage = "start";
  try {
    const crossSite = rejectCrossSiteMutation(request);
    if (crossSite) return crossSite;

    stage = "ensure-schema";
    await ensureBootstrapAuthSchema();

    stage = "rate-limit";
    const limited = await enforceRateLimit({
      request,
      scope: "auth.bootstrap-admin.ip",
      limit: 8,
      windowSeconds: 15 * 60,
    });
    if (limited) return limited;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return reject("Enter your administrator email and password.");
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const returnTo = safeReturnPath(String(body.returnTo ?? ""), "/dashboard");
    const config = readRuntimeAuthConfig();

    if (
      !config.sessionSecret ||
      !config.bootstrapAdminEmail ||
      !config.bootstrapAdminPassword
    ) {
      return reject("Bootstrap administrator login is not configured.", 503);
    }

    const expectedEmailHash = await hashValue(
      `${config.sessionSecret}:bootstrap-email:${config.bootstrapAdminEmail}`,
    );
    const submittedEmailHash = await hashValue(
      `${config.sessionSecret}:bootstrap-email:${email}`,
    );
    const expectedPasswordHash = await hashValue(
      `${config.sessionSecret}:bootstrap-password:${config.bootstrapAdminPassword}`,
    );
    const submittedPasswordHash = await hashValue(
      `${config.sessionSecret}:bootstrap-password:${password}`,
    );

    if (
      !constantTimeEqual(expectedEmailHash, submittedEmailHash) ||
      !constantTimeEqual(expectedPasswordHash, submittedPasswordHash)
    ) {
      await recordSecurityEvent(request, {
        eventType: "auth.bootstrap_admin.invalid_credentials",
        severity: "warning",
        metadata: { email },
      });
      return reject("Invalid administrator credentials.", 401);
    }

    const normalizedEmail = config.bootstrapAdminEmail.toLowerCase();
    const now = Date.now();

    stage = "find-user";
    let user = await env.DB.prepare("SELECT id FROM users WHERE lower(email)=? LIMIT 1")
      .bind(normalizedEmail)
      .first<ExistingUser>();

    if (!user) {
      stage = "create-user";
      const userId = `usr_${crypto.randomUUID()}`;
      await env.DB.prepare(
        `INSERT INTO users
          (id,email,display_name,phone,active_role,language,is_admin,admin_level,
           account_status,onboarding_complete,created_at)
         VALUES (?,?,?,NULL,'superadmin','en',1,'superadmin','active',1,?)`,
      )
        .bind(userId, normalizedEmail, "Kola Administrator", now)
        .run();
      user = { id: userId };
    } else {
      stage = "promote-user";
      await env.DB.prepare(
        `UPDATE users
         SET display_name='Kola Administrator', active_role='superadmin', is_admin=1,
             admin_level='superadmin', account_status='active', onboarding_complete=1
         WHERE id=?`,
      )
        .bind(user.id)
        .run();
    }

    stage = "create-session";
    const session = await createSession(user.id);

    stage = "security-event";
    await recordSecurityEvent(request, {
      eventType: "auth.login.success",
      userId: user.id,
      metadata: { provider: "bootstrap-admin" },
    });

    const response = secureJson({ redirectTo: returnTo });
    response.headers.append("set-cookie", session.cookie);
    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`bootstrap-admin login failed at ${stage}: ${detail}`, error);
    return reject("Administrator login could not be completed. Please try again.", 500);
  }
}

async function ensureBootstrapAuthSchema() {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      phone TEXT,
      active_role TEXT NOT NULL DEFAULT 'customer',
      language TEXT NOT NULL DEFAULT 'en',
      is_admin INTEGER NOT NULL DEFAULT 0,
      admin_level TEXT NOT NULL DEFAULT 'none',
      account_status TEXT NOT NULL DEFAULT 'active',
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
  ).run();

  await ensureColumn("users", "display_name", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("users", "phone", "TEXT");
  await ensureColumn("users", "active_role", "TEXT NOT NULL DEFAULT 'customer'");
  await ensureColumn("users", "language", "TEXT NOT NULL DEFAULT 'en'");
  await ensureColumn("users", "is_admin", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("users", "admin_level", "TEXT NOT NULL DEFAULT 'none'");
  await ensureColumn("users", "account_status", "TEXT NOT NULL DEFAULT 'active'");
  await ensureColumn("users", "onboarding_complete", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("users", "created_at", "INTEGER NOT NULL DEFAULT 0");

  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS rate_limits (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        subject_hash TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        window_start INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`,
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS security_events (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        ip_hash TEXT,
        user_agent TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      )`,
    ),
  ]);
}

async function ensureColumn(table: string, column: string, definition: string) {
  const columns = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  if (columns.results.some((entry) => entry.name === column)) return;
  await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
}

function constantTimeEqual(first: string, second: string): boolean {
  if (first.length !== second.length) return false;
  let result = 0;
  for (let index = 0; index < first.length; index += 1) {
    result |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return result === 0;
}

function reject(message: string, status = 400) {
  return secureJson({ error: message }, status);
}
