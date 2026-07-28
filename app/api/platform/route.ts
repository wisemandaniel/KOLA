import { env } from "cloudflare:workers";
import {
  adminLevel,
  isAdministrator,
  isSuperadmin,
} from "../../admin";
import { getAuthenticatedUser } from "../../auth";
import {
  fetchFapshiPaymentStatus,
  integrationReadiness,
  startPayment,
} from "../../integrations";
import {
  enforceRateLimit,
  rejectCrossSiteMutation,
  secureJson,
} from "../../security";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Actor = Row & {
  id: string;
  active_role: string;
  is_admin: number;
  admin_level: string;
  account_status: string;
};

async function requireActor(): Promise<Actor | null> {
  const identity = await getAuthenticatedUser();
  if (!identity) return null;
  return env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(identity.userId)
    .first<Actor>();
}

async function actorVendor(userId: string) {
  return env.DB.prepare(
    "SELECT * FROM vendors WHERE owner_id = ? LIMIT 1",
  )
    .bind(userId)
    .first<Row>();
}

async function writeAudit(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Row = {},
) {
  await env.DB.prepare(
    `INSERT INTO audit_logs
      (id, actor_id, action, entity_type, entity_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      actorId,
      action,
      entityType,
      entityId,
      JSON.stringify(metadata),
      Date.now(),
    )
    .run();
}

export async function GET() {
  const actor = await requireActor();
  if (!actor) return reject("Authentication required", 401);

  const vendor = await actorVendor(actor.id);
  const common = await env.DB.batch([
    env.DB.prepare(
      "SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC",
    ).bind(actor.id),
    env.DB.prepare(
      "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
    ).bind(actor.id),
    env.DB.prepare(
      "SELECT * FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50",
    ).bind(actor.id),
    env.DB.prepare(
      "SELECT * FROM reviews WHERE author_id = ? ORDER BY created_at DESC LIMIT 100",
    ).bind(actor.id),
    env.DB.prepare(
      "SELECT * FROM payment_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
    ).bind(actor.id),
    env.DB.prepare(
      "SELECT * FROM courier_verification_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
    ).bind(actor.id),
    env.DB.prepare(
      `SELECT sm.*,u.display_name AS sender_name
       FROM support_messages sm
       JOIN users u ON u.id=sm.sender_id
       JOIN support_tickets st ON st.id=sm.ticket_id
       WHERE st.user_id=?
       ORDER BY sm.created_at ASC LIMIT 500`,
    ).bind(actor.id),
  ]);

  const promotions = vendor
    ? await env.DB.prepare(
        "SELECT * FROM promotions WHERE vendor_id = ? ORDER BY created_at DESC",
      )
        .bind(vendor.id)
        .all()
    : { results: [] };

  let analytics: Row = {};
  if (isAdministrator(actor)) {
    const summary = await env.DB.prepare(
      `SELECT
        COUNT(*) AS orders,
        COALESCE(SUM(CASE WHEN payment_status='paid' THEN total ELSE 0 END),0) AS revenue,
        SUM(CASE WHEN status NOT IN ('delivered','cancelled','rejected') THEN 1 ELSE 0 END) AS active_orders,
        SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered
       FROM orders`,
    ).first<Row>();
    analytics = summary ?? {};
  } else if (actor.active_role === "vendor" && vendor) {
    const summary = await env.DB.prepare(
      `SELECT
        COUNT(*) AS orders,
        COALESCE(SUM(CASE WHEN payment_status='paid' THEN total ELSE 0 END), 0) AS revenue,
        COALESCE(AVG(total), 0) AS average_order,
        SUM(CASE WHEN status IN ('pending','accepted','preparing','ready') THEN 1 ELSE 0 END) AS active_orders
       FROM orders WHERE vendor_id = ?`,
    )
      .bind(vendor.id)
      .first<Row>();
    const topProducts = await env.DB.prepare(
      `SELECT oi.name, SUM(oi.quantity) AS quantity, SUM(oi.quantity * oi.unit_price) AS sales
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.vendor_id = ?
       GROUP BY oi.name ORDER BY quantity DESC LIMIT 5`,
    )
      .bind(vendor.id)
      .all();
    analytics = { ...summary, topProducts: topProducts.results };
  } else if (actor.active_role === "rider") {
    const summary = await env.DB.prepare(
      `SELECT
        COUNT(*) AS deliveries,
        SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS completed,
        COALESCE(SUM(CASE WHEN status='delivered' THEN courier_fee ELSE 0 END), 0) AS earnings,
        COALESCE(AVG(distance_km), 0) AS average_distance
       FROM deliveries WHERE courier_id = ?`,
    )
      .bind(actor.id)
      .first<Row>();
    analytics = summary ?? {};
  } else {
    const summary = await env.DB.prepare(
      `SELECT
        COUNT(*) AS orders,
        COALESCE(SUM(total), 0) AS spend,
        SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered
       FROM orders WHERE customer_id = ?`,
    )
      .bind(actor.id)
      .first<Row>();
    analytics = summary ?? {};
  }

  let admin: Row | null = null;
  if (isAdministrator(actor)) {
    const [
      users,
      vendors,
      orders,
      openTickets,
      pendingRiders,
      revenue,
      recentUsers,
      recentVendors,
      recentOrders,
      recentPayments,
      recentDeliveries,
      recentTickets,
      recentVerifications,
      recentAudit,
    ] =
      await env.DB.batch([
        env.DB.prepare("SELECT COUNT(*) AS total FROM users"),
        env.DB.prepare("SELECT COUNT(*) AS total FROM vendors WHERE status='active'"),
        env.DB.prepare("SELECT COUNT(*) AS total FROM orders"),
        env.DB.prepare("SELECT COUNT(*) AS total FROM support_tickets WHERE status!='closed'"),
        env.DB.prepare("SELECT COUNT(*) AS total FROM courier_verification_requests WHERE status='submitted'"),
        env.DB.prepare(
          "SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status='paid'",
        ),
        env.DB.prepare(
          `SELECT id,display_name,email,phone,active_role,admin_level,account_status,
                  city,created_at
           FROM users ORDER BY created_at DESC LIMIT 100`,
        ),
        env.DB.prepare(
          `SELECT v.id,v.name,v.slug,v.category,v.city,v.status,v.rating,v.owner_id,
                  v.created_at,u.display_name AS owner_name
           FROM vendors v JOIN users u ON u.id=v.owner_id
           ORDER BY v.created_at DESC LIMIT 100`,
        ),
        env.DB.prepare(
          `SELECT o.id,o.customer_id,o.vendor_id,o.status,o.total,o.payment_status,
                  o.delivery_address,o.created_at,o.updated_at,
                  customer.display_name AS customer_name,v.name AS vendor_name,
                  d.status AS delivery_status,d.tracking_token
           FROM orders o
           JOIN users customer ON customer.id=o.customer_id
           JOIN vendors v ON v.id=o.vendor_id
           LEFT JOIN deliveries d ON d.order_id=o.id
           ORDER BY o.created_at DESC LIMIT 150`,
        ),
        env.DB.prepare(
          `SELECT pa.id,pa.order_id,pa.user_id,pa.provider,pa.amount,pa.status,
                  pa.provider_reference,pa.failure_reason,pa.created_at,pa.updated_at,
                  u.display_name AS user_name
           FROM payment_attempts pa JOIN users u ON u.id=pa.user_id
           ORDER BY pa.created_at DESC LIMIT 100`,
        ),
        env.DB.prepare(
          `SELECT d.id,d.order_id,d.courier_id,d.status,d.pickup_address,
                  d.dropoff_address,d.distance_km,d.courier_fee,d.estimated_arrival,
                  d.location_updated_at,u.display_name AS courier_name
           FROM deliveries d
           LEFT JOIN users u ON u.id=d.courier_id
           ORDER BY d.rowid DESC LIMIT 100`,
        ),
        env.DB.prepare(
          `SELECT st.*, u.display_name AS user_name
           FROM support_tickets st JOIN users u ON u.id=st.user_id
           ORDER BY st.updated_at DESC LIMIT 20`,
        ),
        env.DB.prepare(
          `SELECT cvr.id,cvr.user_id,cvr.document_type,cvr.status,cvr.review_note,
                  cvr.created_at,cvr.reviewed_at,u.display_name AS user_name
           FROM courier_verification_requests cvr
           JOIN users u ON u.id=cvr.user_id
           ORDER BY CASE cvr.status WHEN 'submitted' THEN 0 ELSE 1 END,
                    cvr.created_at DESC LIMIT 30`,
        ),
        env.DB.prepare(
          `SELECT al.id,al.action,al.entity_type,al.entity_id,al.metadata,
                  al.created_at,u.display_name AS actor_name
           FROM audit_logs al JOIN users u ON u.id=al.actor_id
           ORDER BY al.created_at DESC LIMIT 100`,
        ),
      ]);
    admin = {
      level: adminLevel(actor),
      users: Number((users.results[0] as Row | undefined)?.total ?? 0),
      vendors: Number((vendors.results[0] as Row | undefined)?.total ?? 0),
      orders: Number((orders.results[0] as Row | undefined)?.total ?? 0),
      openTickets: Number((openTickets.results[0] as Row | undefined)?.total ?? 0),
      pendingRiders: Number((pendingRiders.results[0] as Row | undefined)?.total ?? 0),
      revenue: Number((revenue.results[0] as Row | undefined)?.total ?? 0),
      userRows: recentUsers.results,
      vendorRows: recentVendors.results,
      orderRows: recentOrders.results,
      paymentRows: recentPayments.results,
      deliveryRows: recentDeliveries.results,
      tickets: recentTickets.results,
      verifications: recentVerifications.results,
      auditRows: recentAudit.results,
    };
  }

  return Response.json({
    profile: {
      displayName: actor.display_name,
      phone: actor.phone,
      city: actor.city,
      language: actor.language,
      notificationPreferences: actor.notification_preferences,
      isAdmin: isAdministrator(actor),
      adminLevel: adminLevel(actor),
    },
    addresses: common[0].results,
    notifications: common[1].results,
    tickets: common[2].results,
    reviews: common[3].results,
    paymentAttempts: common[4].results,
    verificationRequests: common[5].results,
    supportMessages: common[6].results,
    promotions: promotions.results,
    analytics,
    admin,
    integrations: integrationReadiness(),
  });
}

export async function POST(request: Request) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const actor = await requireActor();
  if (!actor) return reject("Authentication required", 401);
  const limited = await enforceRateLimit({
    request,
    scope: "platform.action.user",
    subject: actor.id,
    limit: 80,
    windowSeconds: 60,
  });
  if (limited) return limited;
  let body: Row;
  try {
    body = (await request.json()) as Row;
  } catch {
    return reject("The request could not be read.");
  }

  const action = String(body.action ?? "");
  const now = Date.now();

  if (action === "update_profile") {
    const displayName = String(body.displayName ?? "").trim();
    const language = String(body.language ?? "en");
    const notificationPreferences = String(body.notificationPreferences ?? "all");
    if (displayName.length < 2 || displayName.length > 80) {
      return reject("Enter a valid display name.");
    }
    if (!["en", "fr"].includes(language)) return reject("Choose a supported language.");
    if (!["all", "orders", "none"].includes(notificationPreferences)) {
      return reject("Choose valid notification preferences.");
    }
    await env.DB.prepare(
      "UPDATE users SET display_name=?, language=?, notification_preferences=? WHERE id=?",
    )
      .bind(displayName, language, notificationPreferences, actor.id)
      .run();
    return Response.json({ ok: true });
  }

  if (action === "save_address") {
    const id = String(body.id ?? crypto.randomUUID());
    const label = String(body.label ?? "Home").trim().slice(0, 30);
    const address = String(body.address ?? "").trim();
    const city = String(body.city ?? actor.city ?? "Douala").trim();
    const instructions = String(body.instructions ?? "").trim().slice(0, 300);
    const latitude = body.latitude == null ? null : Number(body.latitude);
    const longitude = body.longitude == null ? null : Number(body.longitude);
    if (address.length < 5 || !city) return reject("Enter a complete address.");
    const existing = await env.DB.prepare(
      "SELECT id FROM addresses WHERE id=? AND user_id=?",
    )
      .bind(id, actor.id)
      .first();
    if (existing) {
      await env.DB.prepare(
        `UPDATE addresses SET label=?, address=?, city=?, instructions=?,
          latitude=?, longitude=? WHERE id=? AND user_id=?`,
      )
        .bind(label, address, city, instructions, latitude, longitude, id, actor.id)
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO addresses
          (id,user_id,label,address,city,instructions,latitude,longitude,is_default,created_at)
         VALUES (?,?,?,?,?,?,?,?,0,?)`,
      )
        .bind(id, actor.id, label, address, city, instructions, latitude, longitude, now)
        .run();
    }
    return Response.json({ id });
  }

  if (action === "delete_address") {
    const id = String(body.id ?? "");
    await env.DB.prepare(
      "DELETE FROM addresses WHERE id=? AND user_id=? AND is_default=0",
    )
      .bind(id, actor.id)
      .run();
    return Response.json({ ok: true });
  }

  if (action === "default_address") {
    const id = String(body.id ?? "");
    const owned = await env.DB.prepare(
      "SELECT id FROM addresses WHERE id=? AND user_id=?",
    )
      .bind(id, actor.id)
      .first();
    if (!owned) return reject("Address not found.", 404);
    await env.DB.batch([
      env.DB.prepare("UPDATE addresses SET is_default=0 WHERE user_id=?").bind(actor.id),
      env.DB.prepare("UPDATE addresses SET is_default=1 WHERE id=? AND user_id=?").bind(id, actor.id),
    ]);
    return Response.json({ ok: true });
  }

  if (action === "read_notifications") {
    await env.DB.prepare(
      "UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL",
    )
      .bind(now, actor.id)
      .run();
    return Response.json({ ok: true });
  }

  if (action === "create_ticket") {
    const subject = String(body.subject ?? "").trim();
    const description = String(body.description ?? "").trim();
    const category = String(body.category ?? "general");
    const orderId = String(body.orderId ?? "").trim() || null;
    if (subject.length < 4 || description.length < 10) {
      return reject("Describe the issue in a little more detail.");
    }
    if (orderId) {
      const related = await env.DB.prepare(
        `SELECT id FROM orders WHERE id=? AND (
          customer_id=? OR vendor_id IN (SELECT id FROM vendors WHERE owner_id=?)
          OR id IN (SELECT order_id FROM deliveries WHERE courier_id=?)
        )`,
      )
        .bind(orderId, actor.id, actor.id, actor.id)
        .first();
      if (!related) return reject("Order not found.", 404);
    }
    const id = `TKT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO support_tickets
          (id,user_id,order_id,category,subject,description,priority,status,created_at,updated_at)
         VALUES (?,?,?,?,?,?,'normal','open',?,?)`,
      ).bind(id, actor.id, orderId, category, subject, description, now, now),
      env.DB.prepare(
        `INSERT INTO support_messages (id,ticket_id,sender_id,body,created_at)
         VALUES (?,?,?,?,?)`,
      ).bind(crypto.randomUUID(), id, actor.id, description, now),
    ]);
    await writeAudit(actor.id, "ticket.created", "support_ticket", id);
    return Response.json({ id });
  }

  if (action === "support_reply") {
    const id = String(body.id ?? "");
    const message = String(body.message ?? "").trim();
    if (!message || message.length > 2000) {
      return reject("Reply must be between 1 and 2000 characters.");
    }
    const ticket = await env.DB.prepare(
      `SELECT id,user_id,status FROM support_tickets
       WHERE id=? AND (user_id=? OR ?=1)`,
    )
      .bind(id, actor.id, Number(isAdministrator(actor)))
      .first<Row>();
    if (!ticket) return reject("Support ticket not found.", 404);
    if (ticket.status === "closed") return reject("This support ticket is closed.", 409);
    const nextStatus = isAdministrator(actor) ? "in_progress" : String(ticket.status);
    const statements = [
      env.DB.prepare(
        `INSERT INTO support_messages (id,ticket_id,sender_id,body,created_at)
         VALUES (?,?,?,?,?)`,
      ).bind(crypto.randomUUID(), id, actor.id, message, now),
      env.DB.prepare(
        "UPDATE support_tickets SET status=?,updated_at=? WHERE id=?",
      ).bind(nextStatus, now, id),
    ];
    if (isAdministrator(actor) && String(ticket.user_id) !== actor.id) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO notifications (id,user_id,type,title,body,href,created_at)
           VALUES (?,?,?,?,?,?,?)`,
        ).bind(
          crypto.randomUUID(),
          ticket.user_id,
          "support",
          "Kola support replied",
          message.slice(0, 180),
          "/dashboard",
          now,
        ),
      );
    }
    await env.DB.batch(statements);
    await writeAudit(actor.id, "ticket.replied", "support_ticket", id);
    return Response.json({ ok: true });
  }

  if (action === "create_review") {
    const orderId = String(body.orderId ?? "");
    const rating = Math.max(1, Math.min(5, Math.round(Number(body.rating))));
    const comment = String(body.comment ?? "").trim().slice(0, 1000);
    const order = await env.DB.prepare(
      "SELECT vendor_id FROM orders WHERE id=? AND customer_id=? AND status='delivered'",
    )
      .bind(orderId, actor.id)
      .first<Row>();
    if (!order) return reject("Only delivered orders can be reviewed.", 403);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO reviews
        (id,order_id,author_id,subject_type,subject_id,rating,comment,created_at)
       VALUES (?,?,?,'vendor',?,?,?,?)
       ON CONFLICT(order_id,author_id,subject_type) DO UPDATE SET
         rating=excluded.rating, comment=excluded.comment, created_at=excluded.created_at`,
    )
      .bind(id, orderId, actor.id, order.vendor_id, rating, comment, now)
      .run();
    const average = await env.DB.prepare(
      "SELECT AVG(rating) AS rating FROM reviews WHERE subject_type='vendor' AND subject_id=?",
    )
      .bind(order.vendor_id)
      .first<Row>();
    await env.DB.prepare("UPDATE vendors SET rating=? WHERE id=?")
      .bind(Number(average?.rating ?? 5), order.vendor_id)
      .run();
    return Response.json({ id });
  }

  if (action === "create_promotion") {
    if (actor.active_role !== "vendor") return reject("Vendor account required.", 403);
    const vendor = await actorVendor(actor.id);
    if (!vendor) return reject("Vendor profile not found.", 404);
    const code = String(body.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
    const discountType = String(body.discountType ?? "percentage");
    const discountValue = Math.round(Number(body.discountValue));
    const minimumOrder = Math.max(0, Math.round(Number(body.minimumOrder ?? 0)));
    if (code.length < 3 || !["percentage", "fixed"].includes(discountType)) {
      return reject("Enter a valid promotion.");
    }
    if (discountValue <= 0 || (discountType === "percentage" && discountValue > 80)) {
      return reject("Enter a valid discount.");
    }
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare(
        `INSERT INTO promotions
          (id,vendor_id,code,discount_type,discount_value,minimum_order,active,starts_at,created_at)
         VALUES (?,?,?,?,?,?,1,?,?)`,
      )
        .bind(id, vendor.id, code, discountType, discountValue, minimumOrder, now, now)
        .run();
    } catch {
      return reject("That promotion code already exists.", 409);
    }
    return Response.json({ id, code });
  }

  if (action === "toggle_promotion") {
    if (actor.active_role !== "vendor") return reject("Vendor account required.", 403);
    const vendor = await actorVendor(actor.id);
    await env.DB.prepare(
      "UPDATE promotions SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=? AND vendor_id=?",
    )
      .bind(String(body.id ?? ""), vendor?.id ?? "")
      .run();
    return Response.json({ ok: true });
  }

  if (action === "payment_attempt") {
    if (actor.active_role !== "customer") return reject("Customer account required.", 403);
    const orderId = String(body.orderId ?? "");
    const provider = "fapshi";
    const order = await env.DB.prepare(
      "SELECT id,total,payment_status FROM orders WHERE id=? AND customer_id=?",
    )
      .bind(orderId, actor.id)
      .first<Row>();
    if (!order) return reject("Order not found.", 404);
    if (order.payment_status === "paid") return reject("This order is already paid.", 409);
    const readiness = integrationReadiness();
    const enabled = readiness.fapshi;
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO payment_attempts
        (id,order_id,user_id,provider,phone,amount,status,failure_reason,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        id,
        orderId,
        actor.id,
        provider,
        actor.phone ?? null,
        order.total,
        enabled ? "initiating" : "configuration_required",
        enabled ? null : "Fapshi credentials are not configured.",
        now,
        now,
      )
      .run();
    if (!enabled) {
      return secureJson({
        id,
        status: "configuration_required",
        activationRequired: true,
      });
    }
    try {
      const payment = await startPayment({
        orderId,
        amount: Number(order.total),
        userId: String(actor.id),
        email: actor.email ? String(actor.email) : undefined,
        origin: new URL(request.url).origin,
      });
      await env.DB.prepare(
        `UPDATE payment_attempts
         SET status=?,provider_reference=?,failure_reason=NULL,updated_at=? WHERE id=?`,
      )
        .bind(payment.status, payment.providerReference, Date.now(), id)
        .run();
      await writeAudit(actor.id, "payment.requested", "order", orderId, {
        provider,
        attemptId: id,
      });
      return secureJson({
        id,
        status: payment.status,
        checkoutUrl: payment.checkoutUrl,
        activationRequired: false,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Payment provider request failed.";
      await env.DB.prepare(
        "UPDATE payment_attempts SET status='failed',failure_reason=?,updated_at=? WHERE id=?",
      )
        .bind(message.slice(0, 500), Date.now(), id)
        .run();
      return reject(message, 502);
    }
  }

  if (action === "payment_status") {
    const attemptId = String(body.id ?? "");
    const attempt = await env.DB.prepare(
      `SELECT pa.*,o.customer_id FROM payment_attempts pa
       JOIN orders o ON o.id=pa.order_id
       WHERE pa.id=? AND (pa.user_id=? OR ?=1) LIMIT 1`,
    )
      .bind(attemptId, actor.id, Number(isAdministrator(actor)))
      .first<Row>();
    if (!attempt) return reject("Payment attempt not found.", 404);
    if (attempt.provider !== "fapshi" || !attempt.provider_reference) {
      return secureJson({ status: attempt.status });
    }
    try {
      const providerStatus = await fetchFapshiPaymentStatus(
        String(attempt.provider_reference),
      );
      if (
        providerStatus.externalId &&
        providerStatus.externalId !== String(attempt.order_id)
      ) {
        return reject("Fapshi returned a mismatched order reference.", 409);
      }
      if (
        providerStatus.amount != null &&
        providerStatus.amount !== Number(attempt.amount)
      ) {
        return reject("Fapshi returned a mismatched payment amount.", 409);
      }
      await env.DB.prepare(
        "UPDATE payment_attempts SET status=?,failure_reason=?,updated_at=? WHERE id=?",
      )
        .bind(
          providerStatus.status,
          providerStatus.reason ?? null,
          Date.now(),
          attemptId,
        )
        .run();
      if (providerStatus.status === "paid") {
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE orders SET payment_status='paid',updated_at=? WHERE id=?",
          ).bind(Date.now(), attempt.order_id),
          env.DB.prepare(
            `INSERT INTO payments
              (id,order_id,provider,amount,status,provider_reference,created_at)
             SELECT ?,?,?,?,?,?,?
             WHERE NOT EXISTS (
               SELECT 1 FROM payments WHERE order_id=? AND provider_reference=?
             )`,
          ).bind(
            crypto.randomUUID(),
            attempt.order_id,
            "fapshi",
            attempt.amount,
            "paid",
            attempt.provider_reference,
            Date.now(),
            attempt.order_id,
            attempt.provider_reference,
          ),
        ]);
      }
      return secureJson({ status: providerStatus.status });
    } catch (error) {
      return reject(
        error instanceof Error ? error.message : "Status check failed.",
        502,
      );
    }
  }

  if (action === "admin_user_role") {
    if (!isSuperadmin(actor)) return reject("Superadmin access required.", 403);
    const id = String(body.id ?? "");
    const level = String(body.level ?? "");
    if (!["none", "admin", "superadmin"].includes(level)) {
      return reject("Choose a valid administrator role.");
    }
    const target = await env.DB.prepare(
      "SELECT id,active_role,admin_level,is_admin FROM users WHERE id=? LIMIT 1",
    )
      .bind(id)
      .first<Row>();
    if (!target) return reject("User not found.", 404);
    if (id === actor.id && level !== "superadmin") {
      return reject("You cannot remove your own superadmin access.", 409);
    }
    const targetLevel = adminLevel(target);
    if (targetLevel === "superadmin" && level !== "superadmin") {
      const count = await env.DB.prepare(
        "SELECT COUNT(*) AS total FROM users WHERE admin_level='superadmin' AND account_status='active'",
      ).first<Row>();
      if (Number(count?.total ?? 0) <= 1) {
        return reject("Kola must retain at least one active superadmin.", 409);
      }
    }
    const currentRole = String(target.active_role ?? "customer");
    const activeRole =
      level === "none"
        ? ["admin", "superadmin"].includes(currentRole)
          ? "customer"
          : currentRole
        : level;
    await env.DB.prepare(
      "UPDATE users SET admin_level=?,is_admin=?,active_role=? WHERE id=?",
    )
      .bind(level, Number(level !== "none"), activeRole, id)
      .run();
    await writeAudit(actor.id, "user.admin_role_changed", "user", id, {
      previousLevel: targetLevel,
      level,
    });
    return Response.json({ ok: true });
  }

  if (action === "admin_user_status") {
    if (!isAdministrator(actor)) return reject("Administrator access required.", 403);
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!["active", "suspended"].includes(status)) {
      return reject("Choose a valid account status.");
    }
    if (id === actor.id && status === "suspended") {
      return reject("You cannot suspend your own account.", 409);
    }
    const target = await env.DB.prepare(
      "SELECT id,admin_level,is_admin,account_status FROM users WHERE id=? LIMIT 1",
    )
      .bind(id)
      .first<Row>();
    if (!target) return reject("User not found.", 404);
    if (isSuperadmin(target) && !isSuperadmin(actor)) {
      return reject("Only a superadmin can manage a superadmin account.", 403);
    }
    if (isSuperadmin(target) && status === "suspended") {
      const count = await env.DB.prepare(
        "SELECT COUNT(*) AS total FROM users WHERE admin_level='superadmin' AND account_status='active'",
      ).first<Row>();
      if (Number(count?.total ?? 0) <= 1) {
        return reject("Kola must retain at least one active superadmin.", 409);
      }
    }
    const statements = [
      env.DB.prepare("UPDATE users SET account_status=? WHERE id=?").bind(status, id),
    ];
    if (status === "suspended") {
      statements.push(
        env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(id),
      );
    }
    await env.DB.batch(statements);
    await writeAudit(actor.id, "user.account_status_changed", "user", id, {
      status,
    });
    return Response.json({ ok: true });
  }

  if (action === "admin_vendor_status") {
    if (!isAdministrator(actor)) return reject("Administrator access required.", 403);
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!["active", "suspended"].includes(status)) {
      return reject("Choose a valid vendor status.");
    }
    const vendor = await env.DB.prepare("SELECT id FROM vendors WHERE id=?")
      .bind(id)
      .first();
    if (!vendor) return reject("Vendor not found.", 404);
    await env.DB.prepare("UPDATE vendors SET status=? WHERE id=?")
      .bind(status, id)
      .run();
    await writeAudit(actor.id, "vendor.status_changed", "vendor", id, { status });
    return Response.json({ ok: true });
  }

  if (action === "admin_order_status") {
    if (!isAdministrator(actor)) return reject("Administrator access required.", 403);
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    const allowed = [
      "pending",
      "accepted",
      "preparing",
      "ready",
      "picked_up",
      "delivered",
      "cancelled",
      "rejected",
    ];
    if (!allowed.includes(status)) return reject("Choose a valid order status.");
    const order = await env.DB.prepare("SELECT id FROM orders WHERE id=?")
      .bind(id)
      .first();
    if (!order) return reject("Order not found.", 404);
    const statements = [
      env.DB.prepare("UPDATE orders SET status=?,updated_at=? WHERE id=?").bind(
        status,
        now,
        id,
      ),
    ];
    if (status === "picked_up") {
      statements.push(
        env.DB.prepare(
          "UPDATE deliveries SET status='picked_up',picked_up_at=COALESCE(picked_up_at,?) WHERE order_id=?",
        ).bind(now, id),
      );
    } else if (status === "delivered") {
      statements.push(
        env.DB.prepare(
          "UPDATE deliveries SET status='delivered',delivered_at=COALESCE(delivered_at,?) WHERE order_id=?",
        ).bind(now, id),
      );
    } else if (["cancelled", "rejected"].includes(status)) {
      statements.push(
        env.DB.prepare(
          "UPDATE deliveries SET status='cancelled' WHERE order_id=? AND status!='delivered'",
        ).bind(id),
      );
    }
    await env.DB.batch(statements);
    await writeAudit(actor.id, "order.status_changed", "order", id, { status });
    return Response.json({ ok: true });
  }

  if (action === "admin_delivery_status") {
    if (!isAdministrator(actor)) return reject("Administrator access required.", 403);
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!["unassigned", "accepted", "picked_up", "delivered", "cancelled"].includes(status)) {
      return reject("Choose a valid delivery status.");
    }
    const delivery = await env.DB.prepare(
      "SELECT id,order_id FROM deliveries WHERE id=?",
    )
      .bind(id)
      .first<Row>();
    if (!delivery) return reject("Delivery not found.", 404);
    await env.DB.prepare(
      `UPDATE deliveries SET status=?,
         picked_up_at=CASE WHEN ?='picked_up' THEN COALESCE(picked_up_at,?) ELSE picked_up_at END,
         delivered_at=CASE WHEN ?='delivered' THEN COALESCE(delivered_at,?) ELSE delivered_at END
       WHERE id=?`,
    )
      .bind(status, status, now, status, now, id)
      .run();
    if (status === "delivered") {
      await env.DB.prepare("UPDATE orders SET status='delivered',updated_at=? WHERE id=?")
        .bind(now, delivery.order_id)
        .run();
    }
    await writeAudit(actor.id, "delivery.status_changed", "delivery", id, { status });
    return Response.json({ ok: true });
  }

  if (action === "admin_payment_status") {
    if (!isSuperadmin(actor)) return reject("Superadmin access required.", 403);
    const orderId = String(body.orderId ?? "");
    const status = String(body.status ?? "");
    if (!["pending", "paid", "refunded"].includes(status)) {
      return reject("Choose a valid payment status.");
    }
    const order = await env.DB.prepare("SELECT id,total FROM orders WHERE id=?")
      .bind(orderId)
      .first<Row>();
    if (!order) return reject("Order not found.", 404);
    const statements = [
      env.DB.prepare("UPDATE orders SET payment_status=?,updated_at=? WHERE id=?").bind(
        status,
        now,
        orderId,
      ),
    ];
    if (status === "paid") {
      const reference = `admin:${orderId}`;
      statements.push(
        env.DB.prepare(
          `INSERT INTO payments
            (id,order_id,provider,amount,status,provider_reference,created_at)
           SELECT ?,?,'admin_override',?,'paid',?,?
           WHERE NOT EXISTS (
             SELECT 1 FROM payments WHERE order_id=? AND provider_reference=?
           )`,
        ).bind(
          crypto.randomUUID(),
          orderId,
          order.total,
          reference,
          now,
          orderId,
          reference,
        ),
      );
    } else if (status === "refunded") {
      statements.push(
        env.DB.prepare(
          "UPDATE payments SET status='refunded' WHERE order_id=? AND status='paid'",
        ).bind(orderId),
      );
    }
    await env.DB.batch(statements);
    await writeAudit(actor.id, "payment.status_overridden", "order", orderId, {
      status,
    });
    return Response.json({ ok: true });
  }

  if (action === "admin_ticket_status") {
    if (!isAdministrator(actor)) return reject("Administrator access required.", 403);
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!["open", "in_progress", "resolved", "closed"].includes(status)) {
      return reject("Invalid ticket status.");
    }
    await env.DB.prepare(
      "UPDATE support_tickets SET status=?,updated_at=? WHERE id=?",
    )
      .bind(status, now, id)
      .run();
    await writeAudit(actor.id, "ticket.status_changed", "support_ticket", id, { status });
    return Response.json({ ok: true });
  }

  if (action === "admin_verification") {
    if (!isAdministrator(actor)) return reject("Administrator access required.", 403);
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!["approved", "rejected"].includes(status)) return reject("Invalid decision.");
    const item = await env.DB.prepare(
      "SELECT user_id FROM courier_verification_requests WHERE id=?",
    )
      .bind(id)
      .first<Row>();
    if (!item) return reject("Verification request not found.", 404);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE courier_verification_requests SET status=?,review_note=?,reviewed_at=? WHERE id=?",
      ).bind(status, String(body.note ?? ""), now, id),
      env.DB.prepare(
        "UPDATE courier_profiles SET verification_status=? WHERE user_id=?",
      ).bind(status, item.user_id),
    ]);
    await writeAudit(actor.id, "courier.verification", "user", String(item.user_id), { status });
    return Response.json({ ok: true });
  }

  return reject("Unknown action.");
}

function reject(message: string, status = 400) {
  return secureJson({ error: message }, status);
}
