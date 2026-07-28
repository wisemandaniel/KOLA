import { env } from "cloudflare:workers";
import { getRequestActor } from "../../../order-access";
import { matchesDeclaredFileType } from "../../../file-security";
import {
  enforceRateLimit,
  rejectCrossSiteMutation,
  secureJson,
} from "../../../security";

export const dynamic = "force-dynamic";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function POST(request: Request) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const actor = await getRequestActor();
  if (!actor) return reject("Authentication required", 401);
  if (actor.role !== "rider") return reject("Rider account required", 403);
  const limited = await enforceRateLimit({
    request,
    scope: "verification.upload.user",
    subject: actor.id,
    limit: 6,
    windowSeconds: 60 * 60,
  });
  if (limited) return limited;
  const form = await request.formData();
  const file = form.get("file");
  const documentType = String(form.get("documentType") ?? "identity");
  if (!(file instanceof File)) return reject("Choose a verification document.");
  if (!TYPES.has(file.type) || !file.size || file.size > 8 * 1024 * 1024) {
    return reject("Use a JPG, PNG, WebP, or PDF smaller than 8 MB.", 413);
  }
  if (!(await matchesDeclaredFileType(file, file.type))) {
    return reject("The document contents do not match its file type.", 415);
  }
  const bucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA;
  if (!bucket) return reject("Secure document storage is unavailable.", 503);
  const id = crypto.randomUUID();
  const key = `verification/${actor.id}/${id}`;
  await bucket.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { userId: actor.id, documentType },
  });
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO courier_verification_requests
        (id,user_id,document_type,document_key,status,created_at)
       VALUES (?,?,?,?,'submitted',?)`,
    ).bind(id, actor.id, documentType, key, now),
    env.DB.prepare(
      "UPDATE courier_profiles SET verification_status='submitted' WHERE user_id=?",
    ).bind(actor.id),
  ]);
  return Response.json({ id, status: "submitted" });
}

function reject(message: string, status = 400) {
  return secureJson({ error: message }, status);
}
