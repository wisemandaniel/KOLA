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
  provider: "whatsapp" | "bootstrap-admin";
  activeRole: "customer" | "vendor" | "rider" | "admin" | "superadmin";
  isAdmin: boolean;
  adminLevel: "none" | "admin" | "superadmin";
};

type SessionRow = {
  id: string;
  display_name: string;
  email: string;
  phone: string | null;
  active_role: AuthenticatedUser["activeRole"];
  is_admin: number;
  admin_level: AuthenticatedUser["adminLevel"];
  provider: AuthenticatedUser["provider"];
  account_status: string;
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await env.DB.prepare(
    `SELECT u.id, u.display_name, u.email, u.phone, u.active_role, u.is_admin,
            u.admin_level, u.account_status,
            CASE WHEN u.admin_level IN ('admin','superadmin') THEN 'bootstrap-admin'
                 ELSE 'whatsapp' END AS provider
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.account_status='active'
     LIMIT 1`,
  )
    .bind(await hashValue(token), Date.now())
    .first<SessionRow>();

  if (!row) return null;

  return {
    userId: row.id,
    displayName: row.display_name || "Kola Administrator",
    email: row.email,
    phone: row.phone,
    provider: row.provider,
    activeRole: row.active_role || (row.is_admin ? "admin" : "customer"),
    isAdmin: Boolean(row.is_admin),
    adminLevel: row.admin_level || (row.is_admin ? "admin" : "none"),
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

export async function createSession(userId: string) {
  const rawToken = createSessionToken();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO auth_sessions
        (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      userId,
      await hashValue(rawToken),
      now + SESSION_MAX_AGE_SECONDS * 1000,
      now,
    ),
    env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now),
  ]);
  return {
    rawToken,
    cookie: `${SESSION_COOKIE}=${rawToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  };
}

export function readRuntimeAuthConfig() {
  const runtime = env as unknown as Record<string, string | D1Database | undefined>;
  return {
    sessionSecret: stringValue(runtime.AUTH_SESSION_SECRET),
    waSenderApiKey: stringValue(runtime.WASENDER_API_KEY),
    superadminPhone: stringValue(runtime.KOLA_SUPERADMIN_PHONE),
    bootstrapAdminEmail: stringValue(runtime.KOLA_BOOTSTRAP_ADMIN_EMAIL)?.toLowerCase(),
    bootstrapAdminPassword: stringValue(runtime.KOLA_BOOTSTRAP_ADMIN_PASSWORD),
  };
}

function stringValue(value: string | D1Database | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function createSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
