import { env } from "cloudflare:workers";
import { isAdministrator } from "../../../admin";
import { getAuthenticatedUser } from "../../../auth";

export const dynamic = "force-dynamic";

type Admin = { id: string; is_admin: number; admin_level: string };
type Verification = { document_key: string; document_type: string };

export async function GET(
  _request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const identity = await getAuthenticatedUser();
  if (!identity) return reject("Authentication required", 401);
  const admin = await env.DB.prepare(
    "SELECT id,is_admin,admin_level FROM users WHERE id=?",
  )
    .bind(identity.userId)
    .first<Admin>();
  if (!admin || !isAdministrator(admin)) {
    return reject("Administrator access required", 403);
  }

  const { requestId } = await context.params;
  const item = await env.DB.prepare(
    "SELECT document_key,document_type FROM courier_verification_requests WHERE id=?",
  )
    .bind(requestId)
    .first<Verification>();
  if (!item) return reject("Verification request not found", 404);

  const bucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA;
  if (!bucket) return reject("Secure document storage is unavailable", 503);
  const object = await bucket.get(item.document_key);
  if (!object) return reject("Verification document not found", 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "private, no-store");
  headers.set("content-disposition", `inline; filename="${item.document_type}"`);
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

function reject(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
