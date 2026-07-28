import { env } from "cloudflare:workers";
import { canAccessOrder, getRequestActor } from "../../../order-access";

export const dynamic = "force-dynamic";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  const actor = await getRequestActor();
  if (!actor) return reject("Authentication required", 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reject("The attachment could not be read.");
  }

  const orderId = String(form.get("orderId") ?? "");
  const file = form.get("file");
  if (!orderId || !(file instanceof File)) {
    return reject("Choose an image or record a voice note.");
  }
  if (!(await canAccessOrder(actor.id, actor.role, orderId))) {
    return reject("You are not part of this order.", 403);
  }

  const baseContentType = file.type.split(";")[0].trim().toLowerCase();
  const isImage = IMAGE_TYPES.has(baseContentType);
  const isAudio = AUDIO_TYPES.has(baseContentType);
  if (!isImage && !isAudio) {
    return reject("Use a JPG, PNG, WebP, GIF, or supported audio recording.");
  }
  const limit = isImage ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
  if (!file.size || file.size > limit) {
    return reject(
      isImage
        ? "Images must be smaller than 8 MB."
        : "Voice notes must be smaller than 12 MB.",
      413,
    );
  }

  const mediaBucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA;
  if (!mediaBucket) return reject("Media storage is temporarily unavailable.", 503);

  const requestedId = String(form.get("clientMessageId") ?? "").trim();
  const messageId = /^[a-zA-Z0-9_-]{8,100}$/.test(requestedId)
    ? requestedId
    : crypto.randomUUID();
  const existing = await env.DB.prepare(
    "SELECT id, order_id, sender_id, message_type, created_at FROM messages WHERE id = ? LIMIT 1",
  )
    .bind(messageId)
    .first<Record<string, unknown>>();
  if (existing) {
    if (
      String(existing.order_id) !== orderId ||
      String(existing.sender_id) !== actor.id
    ) {
      return reject("Message identifier conflict.", 409);
    }
    return Response.json({
      id: existing.id,
      messageType: existing.message_type,
      createdAt: existing.created_at,
    });
  }
  const mediaKey = `order-media/${orderId}/${messageId}`;
  const durationMs = isAudio
    ? Math.max(0, Math.min(5 * 60 * 1000, Number(form.get("durationMs") ?? 0)))
    : null;
  const now = Date.now();
  const messageType = isImage ? "image" : "audio";
  const caption = String(form.get("caption") ?? "").trim().slice(0, 2000);
  const body = caption || (isImage ? "Photo" : "Voice note");

  await mediaBucket.put(mediaKey, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      orderId,
      messageId,
      uploadedBy: actor.id,
    },
  });

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO messages
          (id, order_id, sender_id, sender_name, sender_role, body, message_type,
           media_key, media_type, media_size, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        messageId,
        orderId,
        actor.id,
        actor.displayName,
        actor.role,
        body,
        messageType,
        mediaKey,
        file.type,
        file.size,
        durationMs,
        now,
      ),
      env.DB.prepare(
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
        `${actor.displayName} sent ${isImage ? "a photo" : "a voice note"}`,
        caption || (isImage ? "Photo" : "Voice note"),
        now,
        orderId,
        orderId,
        orderId,
        actor.id,
      ),
    ]);
  } catch (error) {
    await mediaBucket.delete(mediaKey);
    throw error;
  }

  return Response.json({
    id: messageId,
    messageType,
    createdAt: now,
  });
}

function reject(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
