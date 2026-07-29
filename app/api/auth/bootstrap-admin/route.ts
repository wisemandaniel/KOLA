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
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;

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

  const now = Date.now();
  let user = await env.DB.prepare("SELECT id FROM users WHERE lower(email)=? LIMIT 1")
    .bind(config.bootstrapAdminEmail)
    .first<ExistingUser>();

  if (!user) {
    const userId = `usr_${crypto.randomUUID()}`;
    await env.DB.prepare(
      `INSERT INTO users
        (id,email,display_name,phone,active_role,language,is_admin,admin_level,
         account_status,onboarding_complete,created_at)
       VALUES (?,?,?,NULL,'superadmin','en',1,'superadmin','active',1,?)`,
    )
      .bind(userId, config.bootstrapAdminEmail, "Kola Administrator", now)
      .run();
    user = { id: userId };
  } else {
    await env.DB.prepare(
      `UPDATE users
       SET display_name='Kola Administrator', active_role='superadmin', is_admin=1,
           admin_level='superadmin', account_status='active', onboarding_complete=1
       WHERE id=?`,
    )
      .bind(user.id)
      .run();
  }

  const session = await createSession(user.id);
  await recordSecurityEvent(request, {
    eventType: "auth.login.success",
    userId: user.id,
    metadata: { provider: "bootstrap-admin" },
  });

  const response = secureJson({ redirectTo: returnTo });
  response.headers.append("set-cookie", session.cookie);
  return response;
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
