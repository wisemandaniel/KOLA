import { env } from "cloudflare:workers";
import { hashValue, readRuntimeAuthConfig } from "../../../../auth";

export const dynamic = "force-dynamic";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;

type RequestBody = {
  phone?: unknown;
};

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return reject("Enter a valid Cameroon mobile number.");
  }

  const phone = normalizeCameroonPhone(body.phone);
  if (!phone) return reject("Enter a valid Cameroon mobile number.");

  const config = readRuntimeAuthConfig();
  if (!config.sessionSecret || !config.accessToken || !config.phoneNumberId) {
    return reject(
      "WhatsApp verification is being connected. Please use ChatGPT sign-in for now.",
      503,
    );
  }

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
    accessToken: config.accessToken,
    graphVersion: config.graphVersion,
    phoneNumberId: config.phoneNumberId,
    templateLanguage: config.templateLanguage,
    templateName: config.templateName,
    phone,
    code,
  });

  if (!sendResult.ok) {
    await env.DB.prepare("DELETE FROM auth_challenges WHERE id = ?")
      .bind(challengeId)
      .run();
    console.error("WhatsApp verification send failed", sendResult.error);
    return reject(
      "We could not send a WhatsApp code right now. Please try again shortly.",
      502,
    );
  }

  return Response.json({
    challengeId,
    expiresIn: CHALLENGE_TTL_MS / 1000,
    maskedPhone: maskPhone(phone),
  });
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
  accessToken: string;
  graphVersion: string;
  phoneNumberId: string;
  templateLanguage: string;
  templateName: string;
  phone: string;
  code: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(
    `https://graph.facebook.com/${input.graphVersion}/${input.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.phone.slice(1),
        type: "template",
        template: {
          name: input.templateName,
          language: { code: input.templateLanguage },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: input.code }],
            },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: input.code }],
            },
          ],
        },
      }),
    },
  );

  if (response.ok) return { ok: true };
  return { ok: false, error: await response.text() };
}

function reject(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
