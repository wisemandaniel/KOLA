import { env } from "cloudflare:workers";
import { hashValue, readRuntimeAuthConfig } from "../../../../auth";
import {
  enforceRateLimit,
  recordSecurityEvent,
  rejectCrossSiteMutation,
  secureJson,
} from "../../../../security";

export const dynamic = "force-dynamic";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;

type RequestBody = { phone?: unknown };

export async function POST(request: Request) {
  try {
    const crossSite = rejectCrossSiteMutation(request);
    if (crossSite) return crossSite;

    const limited = await enforceRateLimit({
      request,
      scope: "auth.whatsapp.request.ip",
      limit: 8,
      windowSeconds: 60 * 60,
    });
    if (limited) return limited;

    let body: RequestBody;
    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return reject("Enter a valid Cameroon mobile number.");
    }

    const phone = normalizeCameroonPhone(body.phone);
    if (!phone) return reject("Enter a valid Cameroon mobile number.");

    const config = readRuntimeAuthConfig();
    if (!config.sessionSecret || !config.waSenderApiKey) {
      return reject(
        "WhatsApp verification is not fully configured yet.",
        503,
      );
    }

    await ensureChallengeTable();

    const now = Date.now();
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM auth_challenges WHERE phone = ? AND created_at > ?",
    )
      .bind(phone, now - RATE_LIMIT_WINDOW_MS)
      .first<{ total: number }>();

    if (Number(recent?.total ?? 0) >= MAX_REQUESTS_PER_WINDOW) {
      return reject(
        "Too many verification codes were requested. Please wait 15 minutes and try again.",
        429,
      );
    }

    const challengeId = crypto.randomUUID();
    const code = createVerificationCode();
    const codeHash = await hashValue(
      `${config.sessionSecret}:${challengeId}:${phone}:${code}`,
    );

    await env.DB.prepare(
      `INSERT INTO auth_challenges
        (id, phone, code_hash, expires_at, attempts, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
    )
      .bind(challengeId, phone, codeHash, now + CHALLENGE_TTL_MS, now)
      .run();

    const sendResult = await sendWhatsAppCode({
      apiKey: config.waSenderApiKey,
      phone,
      code,
    });

    if (!sendResult.ok) {
      await env.DB.prepare("DELETE FROM auth_challenges WHERE id = ?")
        .bind(challengeId)
        .run();
      console.error("WhatsApp verification send failed", sendResult.error);
      try {
        await recordSecurityEvent(request, {
          eventType: "auth.whatsapp.delivery_failed",
          severity: "warning",
          metadata: { provider: "wasender" },
        });
      } catch (error) {
        console.warn("Could not record WhatsApp delivery failure", error);
      }
      return reject(
        "We could not send a WhatsApp code right now. Please try again shortly.",
        502,
      );
    }

    return secureJson({
      challengeId,
      expiresIn: CHALLENGE_TTL_MS / 1000,
      maskedPhone: maskPhone(phone),
    });
  } catch (error) {
    console.error("WhatsApp verification request failed", error);
    return reject(
      error instanceof Error ? error.message : "WhatsApp sign-in request failed.",
      500,
    );
  }
}

async function ensureChallengeTable() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_challenges (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed_at INTEGER,
    created_at INTEGER NOT NULL
  )`).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_auth_challenges_phone_created ON auth_challenges(phone, created_at)",
  ).run();
}

function normalizeCameroonPhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00237")) digits = digits.slice(2);
  if (digits.length === 9) digits = `237${digits}`;
  if (!/^2376\d{8}$/.test(digits)) return null;
  return `+${digits}`;
}

function createVerificationCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + (bytes[0] % 900000));
}

function maskPhone(phone: string): string {
  return `${phone.slice(0, 7)}•••${phone.slice(-3)}`;
}

async function sendWhatsAppCode(input: {
  apiKey: string;
  phone: string;
  code: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch("https://www.wasenderapi.com/api/send-message", {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        to: input.phone,
        text: `Your Kola verification code is ${input.code}.\n\nIt expires in 10 minutes. Do not share this code with anyone.`,
      }),
    });

    const responseText = await response.text();
    if (!response.ok) return { ok: false, error: responseText || `HTTP ${response.status}` };

    try {
      const result = JSON.parse(responseText) as { success?: boolean };
      return result.success
        ? { ok: true }
        : { ok: false, error: responseText || "WaSender rejected the request." };
    } catch {
      return { ok: false, error: "WaSender API returned an invalid response." };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not reach WaSender API.",
    };
  }
}

function reject(message: string, status = 400) {
  return secureJson({ error: message }, status);
}
