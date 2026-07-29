import { env } from "cloudflare:workers";
import { getAuthenticatedUser } from "../../auth";
import { adminLevel, isAdministrator, isSuperadmin } from "../../admin";
import { integrationReadiness } from "../../integrations";
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

async function audit(actorId: string, action: string, entityType: string, entityId: string, metadata: Row = {}) {
  try {
    await env.DB.prepare(`INSERT INTO audit_logs
      (id,actor_id,action,entity_type,entity_id,metadata,created_at)
      VALUES (?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), actorId, action, entityType, entityId, JSON.stringify(metadata), Date.now())
      .run();
  } catch (error) {
    console.warn("admin-console audit skipped", error);
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
  if (section === "orders") {
    const rows = await safeAll(`SELECT o.id,o.status,o.total,o.payment_status,o.delivery_address,o.created_at,o.updated_at,
      customer.display_name AS customer_name,v.name AS vendor_name,d.status AS delivery_status,d.tracking_token
      FROM orders o LEFT JOIN users customer ON customer.id=o.customer_id
      LEFT JOIN vendors v ON v.id=o.vendor_id LEFT JOIN deliveries d ON d.order_id=o.id
      ORDER BY o.created_at DESC LIMIT 300`);
    return secureJson({ section, rows });
  }
  if (section === "deliveries") {
    const rows = await safeAll(`SELECT d.id,d.order_id,d.courier_id,d.status,d.pickup_address,d.dropoff_address,
      d.distance_km,d.courier_fee,d.estimated_arrival,d.location_updated_at,u.display_name AS courier_name
      FROM deliveries d LEFT JOIN users u ON u.id=d.courier_id ORDER BY d.rowid DESC LIMIT 300`);
    return secureJson({ section, rows });
  }
  if (section === "payments") {
    const rows = await safeAll(`SELECT pa.id,pa.order_id,pa.user_id,pa.provider,pa.amount,pa.status,
      pa.provider_reference,pa.failure_reason,pa.created_at,pa.updated_at,u.display_name AS user_name
      FROM payment_attempts pa LEFT JOIN users u ON u.id=pa.user_id ORDER BY pa.created_at DESC LIMIT 300`);
    return secureJson({ section, rows });
  }
  if (section === "support") {
    const rows = await safeAll(`SELECT st.id,st.user_id,st.order_id,st.category,st.subject,st.description,
      st.priority,st.status,st.created_at,st.updated_at,u.display_name AS user_name,u.email AS user_email
      FROM support_tickets st LEFT JOIN users u ON u.id=st.user_id ORDER BY st.updated_at DESC LIMIT 250`);
    return secureJson({ section, rows });
  }
  if (section === "audit") {
    const rows = await safeAll(`SELECT al.id,al.action,al.entity_type,al.entity_id,al.metadata,al.created_at,
      u.display_name AS actor_name FROM audit_logs al LEFT JOIN users u ON u.id=al.actor_id
      ORDER BY al.created_at DESC LIMIT 400`);
    return secureJson({ section, rows });
  }
  if (section === "settings") {
    return secureJson({ section, integrations: integrationReadiness(), actorLevel: adminLevel(current) });
  }

  const [users, vendors, products, orders, revenue, openTickets, activeDeliveries] = await Promise.all([
    safeFirst("SELECT COUNT(*) AS total FROM users"),
    safeFirst("SELECT COUNT(*) AS total FROM vendors"),
    safeFirst("SELECT COUNT(*) AS total FROM products"),
    safeFirst("SELECT COUNT(*) AS total FROM orders"),
    safeFirst("SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status='paid'"),
    safeFirst("SELECT COUNT(*) AS total FROM support_tickets WHERE status!='closed'"),
    safeFirst("SELECT COUNT(*) AS total FROM deliveries WHERE status NOT IN ('delivered','cancelled')"),
  ]);
  const recentUsers = await safeAll(`SELECT id,display_name,email,active_role,admin_level,account_status,created_at
    FROM users ORDER BY created_at DESC LIMIT 8`);
  return secureJson({
    section: "overview",
    metrics: {
      users: Number(users?.total ?? 0), vendors: Number(vendors?.total ?? 0),
      products: Number(products?.total ?? 0), orders: Number(orders?.total ?? 0),
      revenue: Number(revenue?.total ?? 0), openTickets: Number(openTickets?.total ?? 0),
      activeDeliveries: Number(activeDeliveries?.total ?? 0),
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

  try {
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
      await audit(current.id, "user.status_changed", "user", id, { status });
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
      await audit(current.id, "user.admin_role_changed", "user", id, { level });
      return secureJson({ ok: true });
    }

    if (action === "vendor_status") {
      const status = String(body.status ?? "");
      if (!id || !["active", "suspended", "pending", "rejected"].includes(status)) return reject("Invalid vendor status");
      const result = await env.DB.prepare("UPDATE vendors SET status=? WHERE id=?").bind(status, id).run();
      if (!result.meta.changes) return reject("Vendor not found", 404);
      await audit(current.id, "vendor.status_changed", "vendor", id, { status });
      return secureJson({ ok: true });
    }

    if (action === "product_status") {
      const active = Number(Boolean(body.active));
      if (!id) return reject("Product id is required");
      const result = await env.DB.prepare("UPDATE products SET active=?,updated_at=? WHERE id=?").bind(active, Date.now(), id).run();
      if (!result.meta.changes) return reject("Product not found", 404);
      await audit(current.id, "product.status_changed", "product", id, { active: Boolean(active) });
      return secureJson({ ok: true });
    }

    if (action === "order_status") {
      const status = String(body.status ?? "");
      const allowed = ["pending","accepted","preparing","ready","picked_up","delivered","cancelled","rejected"];
      if (!id || !allowed.includes(status)) return reject("Invalid order status");
      const result = await env.DB.prepare("UPDATE orders SET status=?,updated_at=? WHERE id=?").bind(status, Date.now(), id).run();
      if (!result.meta.changes) return reject("Order not found", 404);
      await audit(current.id, "order.status_changed", "order", id, { status });
      return secureJson({ ok: true });
    }

    if (action === "delivery_status") {
      const status = String(body.status ?? "");
      if (!id || !["unassigned","accepted","picked_up","delivered","cancelled"].includes(status)) return reject("Invalid delivery status");
      const result = await env.DB.prepare("UPDATE deliveries SET status=? WHERE id=?").bind(status, id).run();
      if (!result.meta.changes) return reject("Delivery not found", 404);
      await audit(current.id, "delivery.status_changed", "delivery", id, { status });
      return secureJson({ ok: true });
    }

    if (action === "payment_status") {
      const status = String(body.status ?? "");
      if (!id || !["pending_provider","initiating","paid","failed","configuration_required"].includes(status)) return reject("Invalid payment status");
      const result = await env.DB.prepare("UPDATE payment_attempts SET status=?,updated_at=? WHERE id=?").bind(status, Date.now(), id).run();
      if (!result.meta.changes) return reject("Payment attempt not found", 404);
      await audit(current.id, "payment.status_changed", "payment_attempt", id, { status });
      return secureJson({ ok: true });
    }

    if (action === "ticket_status") {
      const status = String(body.status ?? "");
      const priority = String(body.priority ?? "");
      if (!id || !["open","in_progress","resolved","closed"].includes(status)) return reject("Invalid ticket status");
      if (priority && !["low","normal","high","urgent"].includes(priority)) return reject("Invalid ticket priority");
      const result = priority
        ? await env.DB.prepare("UPDATE support_tickets SET status=?,priority=?,updated_at=? WHERE id=?").bind(status, priority, Date.now(), id).run()
        : await env.DB.prepare("UPDATE support_tickets SET status=?,updated_at=? WHERE id=?").bind(status, Date.now(), id).run();
      if (!result.meta.changes) return reject("Support ticket not found", 404);
      await audit(current.id, "support.status_changed", "support_ticket", id, { status, priority });
      return secureJson({ ok: true });
    }
  } catch (error) {
    console.error("admin-console action failed", action, error);
    return reject(error instanceof Error ? error.message : "Admin action failed", 500);
  }

  return reject("Unknown admin action", 404);
}
