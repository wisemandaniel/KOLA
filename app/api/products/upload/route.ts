import { env } from "cloudflare:workers";
import { getRequestActor } from "../../../order-access";
import { matchesDeclaredFileType } from "../../../file-security";
import {
  enforceRateLimit,
  rejectCrossSiteMutation,
  secureJson,
} from "../../../security";

export const dynamic = "force-dynamic";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const actor = await getRequestActor();
  if (!actor) return reject("Authentication required", 401);
  if (actor.role !== "vendor") return reject("Vendor account required", 403);
  const limited = await enforceRateLimit({
    request,
    scope: "product.upload.user",
    subject: actor.id,
    limit: 20,
    windowSeconds: 10 * 60,
  });
  if (limited) return limited;

  const form = await request.formData();
  const productId = String(form.get("productId") ?? "");
  const file = form.get("file");
  if (!productId || !(file instanceof File)) return reject("Choose a product image.");
  const contentType = file.type.split(";")[0].toLowerCase();
  if (!IMAGE_TYPES.has(contentType) || !file.size || file.size > MAX_IMAGE_BYTES) {
    return reject("Use a JPG, PNG, or WebP image smaller than 8 MB.", 413);
  }
  if (!(await matchesDeclaredFileType(file, contentType))) {
    return reject("The image contents do not match its file type.", 415);
  }

  const product = await env.DB.prepare(
    `SELECT p.id,p.image_key FROM products p JOIN vendors v ON v.id=p.vendor_id
     WHERE p.id=? AND v.owner_id=?`,
  )
    .bind(productId, actor.id)
    .first<{ id: string; image_key: string | null }>();
  if (!product) return reject("Product not found.", 404);

  const bucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA;
  if (!bucket) return reject("Media storage is unavailable.", 503);
  const key = `product-media/${actor.id}/${productId}/${crypto.randomUUID()}`;
  await bucket.put(key, file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { productId, uploadedBy: actor.id },
  });
  await env.DB.prepare("UPDATE products SET image_key=?,updated_at=? WHERE id=?")
    .bind(key, Date.now(), productId)
    .run();
  if (product.image_key) await bucket.delete(product.image_key);
  return Response.json({ imageUrl: `/api/product-media/${productId}` });
}

function reject(message: string, status = 400) {
  return secureJson({ error: message }, status);
}
