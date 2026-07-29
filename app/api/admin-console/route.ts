import { env } from "cloudflare:workers";
import { getAuthenticatedUser } from "../../auth";
import { adminLevel, isAdministrator, isSuperadmin } from "../../admin";
import { enforceRateLimit, rejectCrossSiteMutation, secureJson } from "../../security";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Actor = Row & { id: string; active_role: string; is_admin: number; admin_level: string; account_status: string };

async function actor(): Promise<Actor | null> {
  const identity = await getAuthenticatedUser();
  if (!identity) return null;
  return env.DB.prepare("SELECT * FROM users WHERE id=?").bind(identity.userId).first<Actor>();
}

function reject(message: string, status = 400) {
  return secureJson({ error: message }, status);
}

async function safeAll(sql: string, values: unknown[] = []) {
  try {
    let statement = env.DB.prepare(sql);
    if (values.length) statement = statement.bind(...values);
    const result = await statement.all<Row>();
    return result.results;
  } catch (error) {
    console.warn("admin-console query skipped", sql, error);
    return [];
  }
}

async function safeFirst(sql: string, values: unknown[] = []) {
  try {
    let statement = env.DB.prepare(sql);
    if (values.length) statement = statement.bind(...values);
    return await statement.first<Row>();
  } catch (error) {
    console.warn("admin-console metric skipped", sql, error);
    return null;
  }
}

export async function GET(request: Request) {
  const current = await actor();
  if (!current) return reject("Authentication required", 401);
  if (!isAdministrator(current)) return reject("Administrator access required", 403);

  const section = new URL(request.url).searchParams.get("section") ?? "overview";
  if (section === "users") {
    const rows = await safeAll(`SELECT id,display_name,email,phone,active_role,is_admin,admin_level,
      account_status,city,onboarding_complete,created_at FROM users ORDER BY created_at DESC LIMIT 250`);
    return secureJson({ section, rows, actorId: current.id, actorLevel: adminLevel(current) });
  }
  if (section === "vendors") {
    const rows = await safeAll(`SELECT v.id,v.name,v.slug,v.category,v.address,v.city,v.status,v.rating,
      v.owner_id,v.created_at,u.display_name AS owner_name,u.email AS owner_email,
      (SELECT COUNT(*) FROM products p WHERE p.vendor_id=v.id) AS products,
      (SELECT COUNT(*) FROM orders o WHERE o.vendor_id=v.id) AS orders
      FROM vendors v LEFT JOIN users u ON u.id=v.owner_id ORDER BY v.created_at DESC LIMIT 250`);
    return secureJson({ section, rows });
  }
  if (section === "products") {
    const rows = await safeAll(`SELECT p.id,p.name,p.description,p.category,p.price,p.stock,p.active,p.image_key,
      p.created_at,p.updated_at,v.id AS vendor_id,v.name AS vendor_name,v.status AS vendor_status
      FROM products p LEFT JOIN vendors v ON v.id=p.vendor_id ORDER BY p.created_at DESC LIMIT 500`);
    return secureJson({ section, rows });
  }

  const [users, vendors, products, orders, revenue] = await Promise.all([
    safeFirst("SELECT COUNT(*) AS total FROM users"),
    safeFirst("SELECT COUNT(*) AS total FROM vendors"),
    safeFirst("SELECT COUNT(*) AS total FROM products"),
    safeFirst("SELECT COUNT(*) AS total FROM orders"),
    safeFirst("SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status='paid'"),
  ]);
  const recentUsers = await safeAll(`SELECT id,display_name,email,active_role,admin_level,account_status,created_at
    FROM users ORDER BY created_at DESC LIMIT 8`);
  return secureJson({
    section: "overview",
    metrics: {
      users: Number(users?.total ?? 0), vendors: Number(vendors?.total ?? 0),
      products: Number(products?.total ?? 0), orders: Number(orders?.total ?? 0),
      revenue: Number(revenue?.total ?? 0),
    },
    recentUsers,
  });
}

export async function POST(request: Request) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const current = await actor();
  if (!current) return reject("Authentication required", 401);
  if (!isAdministrator(current)) return reject("Administrator access required", 403);
  const limited = await enforceRateLimit({ request, scope: "admin.console.action", subject: current.id, limit: 80, windowSeconds: 60 });
  if (limited) return limited;

  let body: Row;
  try { body = await request.json() as Row; } catch { return reject("Invalid request body"); }
  const action = String(body.action ?? "");
  const id = String(body.id ?? "");

  if (action === "user_status") {
    const status = String(body.status ?? "");
    if (!id || !["active", "suspended"].includes(status)) return reject("Invalid account status");
    if (id === current.id && status === "suspended") return reject("You cannot suspend your own account", 409);
    const target = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first<Row>();
    if (!target) return reject("User not found", 404);
    if (isSuperadmin(target) && !isSuperadmin(current)) return reject("Only a superadmin can manage this account", 403);
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET account_status=? WHERE id=?").bind(status, id),
      ...(status === "suspended" ? [env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(id)] : []),
    ]);
    return secureJson({ ok: true });
  }

  if (action === "user_role") {
    if (!isSuperadmin(current)) return reject("Superadmin access required", 403);
    const level = String(body.level ?? "");
    if (!id || !["none", "admin", "superadmin"].includes(level)) return reject("Invalid administrator level");
    if (id === current.id && level !== "superadmin") return reject("You cannot remove your own superadmin access", 409);
    const target = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first<Row>();
    if (!target) return reject("User not found", 404);
    if (isSuperadmin(target) && level !== "superadmin") {
      const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE admin_level='superadmin' AND account_status='active'").first<Row>();
      if (Number(count?.total ?? 0) <= 1) return reject("Kola must keep at least one active superadmin", 409);
    }
    const currentRole = String(target.active_role ?? "customer");
    const role = level === "none" ? (["admin", "superadmin"].includes(currentRole) ? "customer" : currentRole) : level;
    await env.DB.prepare("UPDATE users SET admin_level=?,is_admin=?,active_role=? WHERE id=?")
      .bind(level, Number(level !== "none"), role, id).run();
    return secureJson({ ok: true });
  }

  if (action === "vendor_status") {
    const status = String(body.status ?? "");
    if (!id || !["active", "suspended", "pending", "rejected"].includes(status)) return reject("Invalid vendor status");
    const result = await env.DB.prepare("UPDATE vendors SET status=? WHERE id=?").bind(status, id).run();
    if (!result.meta.changes) return reject("Vendor not found", 404);
    return secureJson({ ok: true });
  }

  if (action === "product_status") {
    const active = Number(Boolean(body.active));
    if (!id) return reject("Product id is required");
    const result = await env.DB.prepare("UPDATE products SET active=?,updated_at=? WHERE id=?").bind(active, Date.now(), id).run();
    if (!result.meta.changes) return reject("Product not found", 404);
    return secureJson({ ok: true });
  }

  return reject("Unknown admin action", 404);
}
