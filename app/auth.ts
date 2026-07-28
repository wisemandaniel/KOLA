import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const SESSION_COOKIE = "kola_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type AuthenticatedUser = {
  userId: string;
  displayName: string;
  email: string;
  phone: string | null;
  provider: "whatsapp";
};

type SessionRow = {
  id: string;
  display_name: string;
  email: string;
  phone: string | null;
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await env.DB.prepare(
    `SELECT u.id, u.display_name, u.email, u.phone
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?
     LIMIT 1`,
  )
    .bind(await hashValue(token), Date.now())
    .first<SessionRow>();

  if (!row) return null;

  return {
    userId: row.id,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    provider: "whatsapp",
  };
}

export async function requireAuthenticatedUser(
  returnTo: string,
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (user) return user;

  redirect(`/login?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`);
}

export function safeReturnPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return fallback;
  }

  if (url.origin !== "https://app.local") return fallback;
  if (
    url.pathname === "/login" ||
    url.pathname.startsWith("/api/auth/")
  ) {
    return fallback;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export async function hashValue(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function readRuntimeAuthConfig() {
  const runtime = env as unknown as Record<string, string | D1Database | undefined>;
  return {
    sessionSecret: stringValue(runtime.AUTH_SESSION_SECRET),
    waSenderApiKey: stringValue(runtime.WASENDER_API_KEY),
  };
}

function stringValue(value: string | D1Database | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
