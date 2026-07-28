import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  const product = await env.DB.prepare(
    `SELECT p.image_key FROM products p JOIN vendors v ON v.id=p.vendor_id
     WHERE p.id=? AND p.active=1 AND v.status='active' AND p.image_key IS NOT NULL`,
  )
    .bind(productId)
    .first<{ image_key: string }>();
  if (!product?.image_key) return new Response("Image not found", { status: 404 });
  const bucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA;
  const object = bucket ? await bucket.get(product.image_key) : null;
  if (!object) return new Response("Image not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
  headers.set("etag", object.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
