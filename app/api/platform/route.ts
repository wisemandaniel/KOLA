import { env } from "cloudflare:workers";
import { getAuthenticatedUser } from "../../auth";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Actor = Row & { id: string; active_role: string; is_admin: number };

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
  if (actor.active_role === "vendor" && vendor) {
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
  if (Number(actor.is_admin)) {
    const [users, vendors, orders, openTickets, pendingRiders, recentTickets, recentVerifications] =
      await env.DB.batch([
        env.DB.prepare("SELECT COUNT(*) AS total FROM users"),
        env.DB.prepare("SELECT COUNT(*) AS total FROM vendors WHERE status='active'"),
        env.DB.prepare("SELECT COUNT(*) AS total FROM orders"),
        env.DB.prepare("SELECT COUNT(*) AS total FROM support_tickets WHERE status!='closed'"),
        env.DB.prepare("SELECT COUNT(*) AS total FROM courier_verification_requests WHERE status='submitted'"),
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
      ]);
    admin = {
      users: Number((users.results[0] as Row | undefined)?.total ?? 0),
      vendors: Number((vendors.results[0] as Row | undefined)?.total ?? 0),
      orders: Number((orders.results[0] as Row | undefined)?.total ?? 0),
      openTickets: Number((openTickets.results[0] as Row | undefined)?.total ?? 0),
      pendingRiders: Number((pendingRiders.results[0] as Row | undefined)?.total ?? 0),
      tickets: recentTickets.results,
      verifications: recentVerifications.results,
    };
  }

  const runtime = env as unknown as Record<string, unknown>;
  return Response.json({
    profile: {
      displayName: actor.display_name,
      phone: actor.phone,
      city: actor.city,
      language: actor.language,
      notificationPreferences: actor.notification_preferences,
      isAdmin: Boolean(actor.is_admin),
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
    integrations: {
      cash: true,
      mtnMomo: Boolean(runtime.MTN_MOMO_SUBSCRIPTION_KEY),
      orangeMoney: Boolean(runtime.ORANGE_MONEY_CLIENT_ID),
      google: Boolean(runtime.GOOGLE_CLIENT_ID),
      facebook: Boolean(runtime.FACEBOOK_APP_ID),
      push: Boolean(runtime.WEB_PUSH_PUBLIC_KEY),
      maps: Boolean(runtime.MAPS_API_KEY),
    },
  });
}

export async function POST(request: Request) {
  const actor = await requireActor();
  if (!actor) return reject("Authentication required", 401);
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
      .bind(id, actor.id, Number(actor.is_admin))
      .first<Row>();
    if (!ticket) return reject("Support ticket not found.", 404);
    if (ticket.status === "closed") return reject("This support ticket is closed.", 409);
    const nextStatus = Number(actor.is_admin) ? "in_progress" : String(ticket.status);
    const statements = [
      env.DB.prepare(
        `INSERT INTO support_messages (id,ticket_id,sender_id,body,created_at)
         VALUES (?,?,?,?,?)`,
      ).bind(crypto.randomUUID(), id, actor.id, message, now),
      env.DB.prepare(
        "UPDATE support_tickets SET status=?,updated_at=? WHERE id=?",
      ).bind(nextStatus, now, id),
    ];
    if (Number(actor.is_admin) && String(ticket.user_id) !== actor.id) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO notifications (id,user_id,type,title,body,link,created_at)
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
    const provider = String(body.provider ?? "");
    if (!["mtn_momo", "orange_money"].includes(provider)) {
      return reject("Choose MTN MoMo or Orange Money.");
    }
    const order = await env.DB.prepare(
      "SELECT id,total,payment_status FROM orders WHERE id=? AND customer_id=?",
    )
      .bind(orderId, actor.id)
      .first<Row>();
    if (!order) return reject("Order not found.", 404);
    if (order.payment_status === "paid") return reject("This order is already paid.", 409);
    const runtime = env as unknown as Record<string, unknown>;
    const enabled =
      provider === "mtn_momo"
        ? Boolean(runtime.MTN_MOMO_SUBSCRIPTION_KEY)
        : Boolean(runtime.ORANGE_MONEY_CLIENT_ID);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO payment_attempts
        (id,order_id,user_id,provider,phone,amount,status,failure_reason,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?, ?,?,?)`,
    )
      .bind(
        id,
        orderId,
        actor.id,
        provider,
        String(body.phone ?? actor.phone ?? ""),
        order.total,
        enabled ? "awaiting_provider" : "configuration_required",
        enabled ? null : "Provider credentials are not configured.",
        now,
        now,
      )
      .run();
    return Response.json({
      id,
      status: enabled ? "awaiting_provider" : "configuration_required",
      activationRequired: !enabled,
    });
  }

  if (action === "admin_ticket_status") {
    if (!Number(actor.is_admin)) return reject("Administrator access required.", 403);
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
    if (!Number(actor.is_admin)) return reject("Administrator access required.", 403);
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
  return Response.json({ error: message }, { status });
}
