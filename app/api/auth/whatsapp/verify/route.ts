import { env } from "cloudflare:workers";
import {
  createSession,
  hashValue,
  readRuntimeAuthConfig,
  safeReturnPath,
} from "../../../../auth";
import {
  enforceRateLimit,
  recordSecurityEvent,
  rejectCrossSiteMutation,
  secureJson,
} from "../../../../security";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;

type ChallengeRow = {
  id: string;
  phone: string;
  code_hash: string;
  expires_at: number;
  attempts: number;
  consumed_at: number | null;
};

type IdentityRow = {
  user_id: string;
  onboarding_complete: number;
  account_status: string;
};

export async function POST(request: Request) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const limited = await enforceRateLimit({
    request,
    scope: "auth.whatsapp.verify.ip",
    limit: 20,
    windowSeconds: 15 * 60,
  });
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return reject("Enter the 6-digit code sent to WhatsApp.");
  }

  const challengeId = String(body.challengeId ?? "");
  const code = String(body.code ?? "").replace(/\D/g, "");
  const returnTo = safeReturnPath(String(body.returnTo ?? ""), "/dashboard");
  if (!challengeId || !/^\d{6}$/.test(code)) {
    return reject("Enter the 6-digit code sent to WhatsApp.");
  }

  const config = readRuntimeAuthConfig();
  if (!config.sessionSecret) {
    return reject("WhatsApp verification is not configured yet.", 503);
  }

  const challenge = await env.DB.prepare(
    `SELECT id, phone, code_hash, expires_at, attempts, consumed_at
     FROM auth_challenges WHERE id = ? LIMIT 1`,
  )
    .bind(challengeId)
    .first<ChallengeRow>();

  const now = Date.now();
  if (!challenge || challenge.consumed_at) {
    return reject("This verification code is no longer valid. Request a new one.", 410);
  }
  if (challenge.expires_at <= now) {
    return reject("This verification code has expired. Request a new one.", 410);
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    return reject("Too many attempts. Request a new verification code.", 429);
  }

  const submittedHash = await hashValue(
    `${config.sessionSecret}:${challenge.id}:${challenge.phone}:${code}`,
  );
  if (!constantTimeEqual(challenge.code_hash, submittedHash)) {
    await env.DB.prepare(
      "UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ?",
    )
      .bind(challenge.id)
      .run();
    await recordSecurityEvent(request, {
      eventType: "auth.whatsapp.invalid_code",
      severity: "warning",
      metadata: { challengeId: challenge.id },
    });
    const remaining = Math.max(0, MAX_ATTEMPTS - challenge.attempts - 1);
    return reject(
      remaining
        ? `That code is incorrect. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
        : "Too many attempts. Request a new verification code.",
      remaining ? 400 : 429,
    );
  }

  let identity = await env.DB.prepare(
    `SELECT ai.user_id, u.onboarding_complete, u.account_status
     FROM auth_identities ai
     JOIN users u ON u.id = ai.user_id
     WHERE ai.provider = 'whatsapp' AND ai.provider_user_id = ?
     LIMIT 1`,
  )
    .bind(challenge.phone)
    .first<IdentityRow>();
  if (identity?.account_status !== undefined && identity.account_status !== "active") {
    return reject("This Kola account is suspended. Contact support.", 403);
  }

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      "UPDATE auth_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL",
    ).bind(now, challenge.id),
  ];
  const bootstrapSuperadmin =
    Boolean(config.superadminPhone) &&
    config.superadminPhone?.replace(/[^\d+]/g, "") ===
      challenge.phone.replace(/[^\d+]/g, "");

  if (!identity) {
    const userId = `usr_${crypto.randomUUID()}`;
    const digits = challenge.phone.replace(/\D/g, "");
    const email = `wa_${digits}@phone.kola.local`;
    statements.push(
      env.DB.prepare(
        `INSERT INTO users
          (id,email,display_name,phone,active_role,language,is_admin,admin_level,
           account_status,onboarding_complete,created_at)
         VALUES (?,?,?, ?,?,'en',?,?,'active',?,?)`,
      ).bind(
        userId,
        email,
        challenge.phone,
        challenge.phone,
        bootstrapSuperadmin ? "superadmin" : "customer",
        Number(bootstrapSuperadmin),
        bootstrapSuperadmin ? "superadmin" : "none",
        Number(bootstrapSuperadmin),
        now,
      ),
      env.DB.prepare(
        `INSERT INTO auth_identities
          (id, user_id, provider, provider_user_id, created_at)
         VALUES (?, ?, 'whatsapp', ?, ?)`,
      ).bind(crypto.randomUUID(), userId, challenge.phone, now),
    );
    identity = {
      user_id: userId,
      onboarding_complete: Number(bootstrapSuperadmin),
      account_status: "active",
    };
  } else if (bootstrapSuperadmin) {
    statements.push(
      env.DB.prepare(
        `UPDATE users
         SET active_role='superadmin',is_admin=1,admin_level='superadmin',
             account_status='active',onboarding_complete=1
         WHERE id=?`,
      ).bind(identity.user_id),
    );
    identity.onboarding_complete = 1;
  }

  await env.DB.batch(statements);
  const session = await createSession(identity.user_id);
  await recordSecurityEvent(request, {
    eventType: "auth.login.success",
    userId: identity.user_id,
    metadata: { provider: "whatsapp" },
  });

  const redirectTo = identity.onboarding_complete
    ? returnTo
    : "/onboarding";
  const response = secureJson({ redirectTo });
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
