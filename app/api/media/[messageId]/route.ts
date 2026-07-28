import { env } from "cloudflare:workers";
import { canAccessOrder, getRequestActor } from "../../../order-access";

export const dynamic = "force-dynamic";

type MediaRow = {
  order_id: string;
  media_key: string | null;
  media_type: string | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const actor = await getRequestActor();
  if (!actor) return new Response("Authentication required", { status: 401 });

  const { messageId } = await params;
  const media = await env.DB.prepare(
    `SELECT order_id, media_key, media_type
     FROM messages WHERE id = ? AND media_key IS NOT NULL LIMIT 1`,
  )
    .bind(messageId)
    .first<MediaRow>();

  if (!media?.media_key) return new Response("Media not found", { status: 404 });
  if (!(await canAccessOrder(actor.id, actor.role, media.order_id))) {
    return new Response("Forbidden", { status: 403 });
  }

  const mediaBucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA;
  if (!mediaBucket) return new Response("Media unavailable", { status: 503 });
  const object = await mediaBucket.get(media.media_key);
  if (!object) return new Response("Media not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", media.media_type ?? "application/octet-stream");
  headers.set("cache-control", "private, max-age=3600");
  headers.set("content-disposition", "inline");
  headers.set("x-content-type-options", "nosniff");
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}
