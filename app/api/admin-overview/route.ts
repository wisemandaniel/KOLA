import { env } from "cloudflare:workers";
import { getAuthenticatedUser } from "../../auth";
import { secureJson } from "../../security";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

async function safeFirst(sql: string): Promise<Row> {
  try {
    return (await env.DB.prepare(sql).first<Row>()) ?? {};
  } catch (error) {
    console.warn("admin overview query skipped", sql, error);
    return {};
  }
}

async function safeAll(sql: string): Promise<Row[]> {
  try {
    const result = await env.DB.prepare(sql).all<Row>();
    return result.results ?? [];
  } catch (error) {
    console.warn("admin overview query skipped", sql, error);
    return [];
  }
}

export async function GET() {
  try {
    const identity = await getAuthenticatedUser();
    if (!identity) return secureJson({ error: "Authentication required" }, 401);

    const actor = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(identity.userId)
      .first<Row>();
    if (!actor) return secureJson({ error: "Account not found" }, 404);

    const role = String(actor.active_role ?? identity.activeRole ?? "customer");
    const level = String(actor.admin_level ?? identity.adminLevel ?? "none");
    const allowed = role === "admin" || role === "superadmin" || level === "admin" || level === "superadmin" || Boolean(actor.is_admin);
    if (!allowed) return secureJson({ error: "Administrator access required" }, 403);

    const [users, vendors, orders, revenue, recentUsers] = await Promise.all([
      safeFirst("SELECT COUNT(*) AS total FROM users"),
      safeFirst("SELECT COUNT(*) AS total FROM vendors"),
      safeFirst("SELECT COUNT(*) AS total FROM orders"),
      safeFirst("SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status='paid'"),
      safeAll("SELECT id,display_name,email,active_role,account_status,created_at FROM users ORDER BY created_at DESC LIMIT 12"),
    ]);

    return secureJson({
      metrics: {
        users: Number(users.total ?? 0),
        vendors: Number(vendors.total ?? 0),
        orders: Number(orders.total ?? 0),
        revenue: Number(revenue.total ?? 0),
      },
      recentUsers,
    });
  } catch (error) {
    console.error("admin overview failed", error);
    return secureJson({ error: "Platform overview is temporarily unavailable." }, 500);
  }
}
