import { env } from "cloudflare:workers";
import { hashValue, safeReturnPath, SESSION_COOKIE } from "../../../auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Cross-site sign-out rejected." }, { status: 403 });
  }
  const returnTo = safeReturnPath(
    new URL(request.url).searchParams.get("return_to"),
    "/",
  );
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (token) {
    await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
      .bind(await hashValue(token))
      .run();
  }

  return new Response(null, {
    status: 303,
    headers: {
      "cache-control": "no-store",
      location: new URL(returnTo, request.url).toString(),
      "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}

export const POST = GET;

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}
