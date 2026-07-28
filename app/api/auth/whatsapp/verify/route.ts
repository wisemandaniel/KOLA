import { env } from "cloudflare:workers";
import {
  hashValue,
  readRuntimeAuthConfig,
  safeReturnPath,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "../../../../auth";

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
};

export async function POST(request: Request) {
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
    const remaining = Math.max(0, MAX_ATTEMPTS - challenge.attempts - 1);
    return reject(
      remaining
        ? `That code is incorrect. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
        : "Too many attempts. Request a new verification code.",
      remaining ? 400 : 429,
    );
  }

  let identity = await env.DB.prepare(
    `SELECT ai.user_id, u.onboarding_complete
     FROM auth_identities ai
     JOIN users u ON u.id = ai.user_id
     WHERE ai.provider = 'whatsapp' AND ai.provider_user_id = ?
     LIMIT 1`,
  )
    .bind(challenge.phone)
    .first<IdentityRow>();

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      "UPDATE auth_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL",
    ).bind(now, challenge.id),
  ];

  if (!identity) {
    const userId = `usr_${crypto.randomUUID()}`;
    const digits = challenge.phone.replace(/\D/g, "");
    const email = `wa_${digits}@phone.kola.local`;
    statements.push(
      env.DB.prepare(
        `INSERT INTO users
          (id, email, display_name, phone, active_role, language, onboarding_complete, created_at)
         VALUES (?, ?, ?, ?, 'customer', 'en', 0, ?)`,
      ).bind(userId, email, challenge.phone, challenge.phone, now),
      env.DB.prepare(
        `INSERT INTO auth_identities
          (id, user_id, provider, provider_user_id, created_at)
         VALUES (?, ?, 'whatsapp', ?, ?)`,
      ).bind(crypto.randomUUID(), userId, challenge.phone, now),
    );
    identity = { user_id: userId, onboarding_complete: 0 };
  }

  const rawToken = createSessionToken();
  statements.push(
    env.DB.prepare(
      `INSERT INTO auth_sessions
        (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      identity.user_id,
      await hashValue(rawToken),
      now + SESSION_MAX_AGE_SECONDS * 1000,
      now,
    ),
    env.DB.prepare(
      "DELETE FROM auth_sessions WHERE expires_at <= ?",
    ).bind(now),
  );

  await env.DB.batch(statements);

  const redirectTo = identity.onboarding_complete
    ? returnTo
    : "/onboarding";
  const response = Response.json({ redirectTo });
  response.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${rawToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  );
  return response;
}

function createSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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
  return Response.json({ error: message }, { status });
}
