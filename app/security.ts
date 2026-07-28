import { env } from "cloudflare:workers";
import { hashValue } from "./auth";

type Runtime = Record<string, string | D1Database | R2Bucket | undefined>;

export function rejectCrossSiteMutation(request: Request): Response | null {
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return null;

  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin && origin !== requestUrl.origin) {
    return secureJson({ error: "Cross-site request rejected." }, 403);
  }
  if (fetchSite === "cross-site") {
    return secureJson({ error: "Cross-site request rejected." }, 403);
  }
  return null;
}

export async function enforceRateLimit({
  request,
  scope,
  subject,
  limit,
  windowSeconds,
}: {
  request: Request;
  scope: string;
  subject?: string;
  limit: number;
  windowSeconds: number;
}): Promise<Response | null> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const subjectHash = await hashValue(
    `${runtimeSecret()}:${subject ?? clientAddress(request)}`,
  );
  const id = await hashValue(`${scope}:${subjectHash}:${windowStart}`);
  const result = await env.DB.prepare(
    `INSERT INTO rate_limits
      (id,scope,subject_hash,count,window_start,expires_at)
     VALUES (?,?,?,1,?,?)
     ON CONFLICT(id) DO UPDATE SET count=count+1
     RETURNING count`,
  )
    .bind(id, scope, subjectHash, windowStart, windowStart + windowMs)
    .first<{ count: number }>();

  if (Number(result?.count ?? 1) <= limit) return null;

  const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
  void recordSecurityEvent(request, {
    eventType: "rate_limit.exceeded",
    severity: "warning",
    metadata: { scope },
  });
  return secureJson(
    { error: "Too many requests. Please try again shortly.", retryAfter },
    429,
    { "retry-after": String(retryAfter) },
  );
}

export async function recordSecurityEvent(
  request: Request,
  {
    eventType,
    severity = "info",
    userId,
    metadata = {},
  }: {
    eventType: string;
    severity?: "info" | "warning" | "critical";
    userId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    await env.DB.prepare(
      `INSERT INTO security_events
        (id,user_id,event_type,severity,ip_hash,user_agent,metadata,created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
      .bind(
        crypto.randomUUID(),
        userId ?? null,
        eventType,
        severity,
        await hashValue(`${runtimeSecret()}:${clientAddress(request)}`),
        request.headers.get("user-agent")?.slice(0, 300) ?? null,
        JSON.stringify(metadata).slice(0, 4000),
        Date.now(),
      )
      .run();
  } catch {
    // Security logging must never take the primary application flow down.
  }
}

export function secureJson(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

export function runtimeString(name: string): string | undefined {
  const value = (env as unknown as Runtime)[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function hasAllRuntimeValues(...names: string[]) {
  return names.every((name) => Boolean(runtimeString(name)));
}

function clientAddress(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function runtimeSecret() {
  return runtimeString("AUTH_SESSION_SECRET") ?? "kola-unconfigured";
}
