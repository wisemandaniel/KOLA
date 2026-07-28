import { env } from "cloudflare:workers";
import { integrationReadiness } from "../../integrations";
import { secureJson } from "../../security";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let database = false;
  try {
    const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    database = result?.ok === 1;
  } catch {
    database = false;
  }
  const status = database ? "healthy" : "degraded";
  return secureJson(
    {
      status,
      release: "16-ready",
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      dependencies: {
        database,
        objectStorage: Boolean((env as unknown as { MEDIA?: R2Bucket }).MEDIA),
      },
      integrations: integrationReadiness(),
    },
    database ? 200 : 503,
  );
}
