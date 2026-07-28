import { env } from "cloudflare:workers";
import { getAuthenticatedUser } from "../../auth";
import {
  enforceRateLimit,
  rejectCrossSiteMutation,
  secureJson,
} from "../../security";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

async function requireActor() {
  const identity = await getAuthenticatedUser();
  if (!identity) return null;
  const actor = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(identity.userId).first<Row>();
  return actor ? { ...actor, _auth_provider: identity.provider } : null;
}

function reject(message: string, status = 400) {
  return secureJson({ error: message }, status);
}

async function ownedVendor(userId: string) {
  return env.DB.prepare("SELECT * FROM vendors WHERE owner_id = ? AND status = 'active'").bind(userId).first<Row>();
}

async function canAccessOrder(userId: string, role: string, orderId: string) {
  if (role === "customer") return !!await env.DB.prepare("SELECT id FROM orders WHERE id = ? AND customer_id = ?").bind(orderId, userId).first();
  if (role === "vendor") return !!await env.DB.prepare("SELECT o.id FROM orders o JOIN vendors v ON o.vendor_id=v.id WHERE o.id=? AND v.owner_id=?").bind(orderId, userId).first();
  if (role === "rider") return !!await env.DB.prepare("SELECT order_id FROM deliveries WHERE order_id=? AND courier_id=?").bind(orderId, userId).first();
  return false;
}

function notificationStatement(
  userId: unknown,
  type: string,
  title: string,
  body: string,
  href: string | null,
  now: number,
) {
  return env.DB.prepare(
    `INSERT INTO notifications
      (id,user_id,type,title,body,href,created_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).bind(
    crypto.randomUUID(),
    String(userId),
    type,
    title,
    body,
    href,
    now,
  );
}

export async function GET() {
  const actor = await requireActor();
  if (!actor) return reject("Authentication required", 401);
  const db = env.DB;
  const role = String(actor.active_role);
  const actorId = String(actor.id);
  let orders; let deliveries; let vendor: Row | null = null;
  if (role === "vendor") {
    vendor = await ownedVendor(String(actor.id));
    orders = vendor ? await db.prepare("SELECT * FROM orders WHERE vendor_id=? ORDER BY created_at DESC LIMIT 100").bind(vendor.id).all() : { results: [] };
    deliveries = vendor ? await db.prepare("SELECT d.* FROM deliveries d JOIN orders o ON d.order_id=o.id WHERE o.vendor_id=? ORDER BY o.created_at DESC").bind(vendor.id).all() : { results: [] };
  } else if (role === "rider") {
    orders = await db.prepare("SELECT o.* FROM orders o JOIN deliveries d ON o.id=d.order_id WHERE d.courier_id=? OR d.status='unassigned' ORDER BY o.created_at DESC LIMIT 100").bind(actor.id).all();
    deliveries = await db.prepare("SELECT * FROM deliveries WHERE courier_id=? OR status='unassigned' ORDER BY rowid DESC LIMIT 100").bind(actor.id).all();
  } else {
    orders = await db.prepare("SELECT * FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 100").bind(actor.id).all();
    deliveries = await db.prepare("SELECT d.* FROM deliveries d JOIN orders o ON d.order_id=o.id WHERE o.customer_id=? ORDER BY o.created_at DESC").bind(actor.id).all();
  }
  const productStatement =
    role === "vendor" && vendor
      ? db.prepare(`SELECT p.*,v.name AS vendor_name,v.slug AS vendor_slug
          FROM products p JOIN vendors v ON p.vendor_id=v.id
          WHERE p.vendor_id=? ORDER BY p.created_at DESC`).bind(vendor.id)
      : db.prepare(`SELECT p.*,v.name AS vendor_name,v.slug AS vendor_slug
          FROM products p JOIN vendors v ON p.vendor_id=v.id
          WHERE p.active=1 AND v.status='active' ORDER BY p.created_at DESC`);
  const [products, vendors, addresses, messages] = await db.batch([
    productStatement,
    db.prepare("SELECT id,name,slug,category,address,city,rating FROM vendors WHERE status='active'"),
    db.prepare("SELECT * FROM addresses WHERE user_id=? ORDER BY is_default DESC,created_at DESC").bind(actor.id),
    db.prepare(`SELECT m.* FROM messages m WHERE m.order_id IN (
      SELECT id FROM orders WHERE customer_id=?
      UNION SELECT o.id FROM orders o JOIN vendors v ON o.vendor_id=v.id WHERE v.owner_id=?
      UNION SELECT order_id FROM deliveries WHERE courier_id=?
    ) ORDER BY m.created_at ASC LIMIT 500`).bind(actor.id, actor.id, actor.id),
  ]);
  await db.prepare(`INSERT OR IGNORE INTO message_receipts
    (id, message_id, user_id, delivered_at, read_at)
    SELECT lower(hex(randomblob(16))), m.id, ?, ?, NULL
    FROM messages m
    WHERE m.sender_id != ? AND m.order_id IN (
      SELECT id FROM orders WHERE customer_id=?
      UNION SELECT o.id FROM orders o JOIN vendors v ON o.vendor_id=v.id WHERE v.owner_id=?
      UNION SELECT order_id FROM deliveries WHERE courier_id=?
    )`).bind(actorId, Date.now(), actorId, actorId, actorId, actorId).run();
  return Response.json({
    actor: { id: actor.id, email: actor.email, phone: actor.phone, displayName: actor.display_name, activeRole: role, language: actor.language, city: actor.city, onboardingComplete: !!actor.onboarding_complete, authProvider: actor._auth_provider, vendorId: vendor?.id, vendorSlug: vendor?.slug, isAdmin: !!actor.is_admin },
    products: products.results, vendors: vendors.results, orders: orders.results, deliveries: deliveries.results, messages: messages.results, addresses: addresses.results,
  });
}

export async function POST(request: Request) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const actor = await requireActor();
  if (!actor) return reject("Authentication required", 401);
  const limited = await enforceRateLimit({
    request,
    scope: "workspace.action.user",
    subject: String(actor.id),
    limit: 120,
    windowSeconds: 60,
  });
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return reject("The request could not be read.");
  }
  const action = String(body.action ?? ""); const role = String(actor.active_role); const userId = String(actor.id); const now = Date.now(); const db = env.DB;

  if (action === "complete_onboarding") {
    const selectedRole = String(body.role ?? "customer");
    const submittedPhone = String(body.phone ?? "").replace(/\s/g, "");
    const phone = actor._auth_provider === "whatsapp" && actor.phone
      ? String(actor.phone)
      : submittedPhone;
    const displayName = String(body.displayName ?? actor.display_name).trim();
    const city = String(body.city ?? "").trim();
    if (!["customer","vendor","rider"].includes(selectedRole) || !displayName || phone.length < 8 || !city) return reject("Complete all required fields");
    await db.prepare("UPDATE users SET display_name=?,active_role=?,phone=?,city=?,onboarding_complete=1 WHERE id=?").bind(displayName, selectedRole, phone, city, userId).run();
    if (selectedRole === "vendor") {
      const businessName = String(body.businessName ?? `${actor.display_name}'s store`).trim();
      const id = `vnd_${crypto.randomUUID()}`;
      await db.prepare("INSERT OR IGNORE INTO vendors (id,owner_id,name,slug,category,address,city,status,rating,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .bind(id, userId, businessName, `${businessName.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}-${id.slice(-5)}`, String(body.businessCategory ?? "Retail"), String(body.address ?? city), city, "active", 5, now).run();
    }
    if (selectedRole === "rider") {
      await db.prepare("INSERT OR IGNORE INTO courier_profiles (user_id,vehicle_type,status,verification_status,rating,completed_deliveries,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(userId, String(body.vehicleType ?? "motorcycle"), "offline", "pending", 5, 0, now).run();
    }
    if (selectedRole === "customer" && body.address) {
      await db.prepare("INSERT INTO addresses (id,user_id,label,address,city,instructions,is_default,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), userId, "Home", String(body.address), city, String(body.instructions ?? ""), 1, now).run();
    }
    return Response.json({ role: selectedRole });
  }

  if (!actor.onboarding_complete) return reject("Complete registration first", 403);

  if (action === "create_product") {
    if (role !== "vendor") return reject("Vendor account required", 403);
    const vendor = await ownedVendor(userId); if (!vendor) return reject("Vendor profile not found", 404);
    const name = String(body.name ?? "").trim(); const price = Math.round(Number(body.price)); const stock = Math.max(0, Math.round(Number(body.stock ?? 0)));
    if (!name || !Number.isFinite(price) || price < 50) return reject("Enter a valid product name and price");
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO products (id,vendor_id,name,description,category,price,stock,emoji,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, vendor.id, name, String(body.description ?? "").trim().slice(0,1000), String(body.category ?? "Other"), price, stock, "", 1, now, now).run();
    return Response.json({ id });
  }

  if (action === "update_product") {
    if (role !== "vendor") return reject("Vendor account required", 403);
    const vendor = await ownedVendor(userId);
    const id = String(body.id ?? "");
    const name = String(body.name ?? "").trim();
    const price = Math.round(Number(body.price));
    const stock = Math.max(0, Math.round(Number(body.stock ?? 0)));
    if (!vendor || !id || !name || !Number.isFinite(price) || price < 50) {
      return reject("Enter valid product details.");
    }
    const result = await db.prepare(
      `UPDATE products SET name=?,description=?,category=?,price=?,stock=?,updated_at=?
       WHERE id=? AND vendor_id=?`,
    )
      .bind(
        name,
        String(body.description ?? "").trim().slice(0, 1000),
        String(body.category ?? "Other"),
        price,
        stock,
        now,
        id,
        vendor.id,
      )
      .run();
    if (!result.meta.changes) return reject("Product not found.", 404);
    return Response.json({ id });
  }

  if (action === "toggle_product") {
    if (role !== "vendor") return reject("Vendor account required", 403);
    const vendor = await ownedVendor(userId);
    const result = await db.prepare(
      `UPDATE products SET active=CASE active WHEN 1 THEN 0 ELSE 1 END,updated_at=?
       WHERE id=? AND vendor_id=?`,
    )
      .bind(now, String(body.id ?? ""), vendor?.id ?? "")
      .run();
    if (!result.meta.changes) return reject("Product not found.", 404);
    return Response.json({ ok: true });
  }

  if (action === "create_order") {
    if (role !== "customer") return reject("Customer account required", 403);
    const orderLimited = await enforceRateLimit({
      request,
      scope: "order.create.user",
      subject: userId,
      limit: 10,
      windowSeconds: 60,
    });
    if (orderLimited) return orderLimited;
    const requested = Array.isArray(body.items) ? body.items as Row[] : [];
    if (!requested.length) return reject("Your cart is empty");
    const verified: { id:string;name:string;price:number;quantity:number;vendorId:string }[] = [];
    for (const item of requested.slice(0,50)) {
      const product = await db.prepare("SELECT id,name,price,stock,vendor_id FROM products WHERE id=? AND active=1").bind(String(item.id)).first<Row>();
      const quantity = Math.max(1,Math.min(20,Math.round(Number(item.quantity ?? 1))));
      if (!product || Number(product.stock) < quantity) return reject(`${String(product?.name ?? "A product")} is unavailable`);
      verified.push({ id:String(product.id),name:String(product.name),price:Number(product.price),quantity,vendorId:String(product.vendor_id) });
    }
    const address = String(body.address ?? "").trim();
    if (address.length < 5) return reject("Enter a delivery address");
    const deliveryLat = body.latitude == null ? null : Number(body.latitude);
    const deliveryLng = body.longitude == null ? null : Number(body.longitude);
    const promotionCode = String(body.promotionCode ?? "").trim().toUpperCase();
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)) {
      return reject("A valid checkout request key is required.");
    }
    const previous = await db.prepare(
      `SELECT status,response_json FROM idempotency_records
       WHERE user_id=? AND scope='order.create' AND request_key=? LIMIT 1`,
    ).bind(userId,idempotencyKey).first<Row>();
    if (previous?.status === "completed" && previous.response_json) {
      return secureJson(JSON.parse(String(previous.response_json)));
    }
    if (previous) {
      return reject("This checkout is already being processed.", 409);
    }
    const idempotencyId = crypto.randomUUID();
    const idempotencyInsert = await db.prepare(
      `INSERT OR IGNORE INTO idempotency_records
        (id,user_id,scope,request_key,status,expires_at,created_at,updated_at)
       VALUES (?,?, 'order.create',?,'processing',?,?,?)`,
    ).bind(idempotencyId,userId,idempotencyKey,now+24*60*60*1000,now,now).run();
    if (!idempotencyInsert.meta.changes) {
      const concurrent = await db.prepare(
        `SELECT status,response_json FROM idempotency_records
         WHERE user_id=? AND scope='order.create' AND request_key=? LIMIT 1`,
      ).bind(userId,idempotencyKey).first<Row>();
      if (concurrent?.status === "completed" && concurrent.response_json) {
        return secureJson(JSON.parse(String(concurrent.response_json)));
      }
      return reject("This checkout is already being processed.",409);
    }

    const reserved: typeof verified = [];
    for (const item of verified) {
      const reservation = await db.prepare(
        "UPDATE products SET stock=stock-?,updated_at=? WHERE id=? AND stock>=?",
      ).bind(item.quantity,now,item.id,item.quantity).run();
      if (!reservation.meta.changes) {
        if (reserved.length) {
          await db.batch(reserved.map((held) => db.prepare(
            "UPDATE products SET stock=stock+?,updated_at=? WHERE id=?",
          ).bind(held.quantity,Date.now(),held.id)));
        }
        await db.prepare("DELETE FROM idempotency_records WHERE id=?")
          .bind(idempotencyId).run();
        return reject(`${item.name} just sold out. Review your cart and try again.`,409);
      }
      reserved.push(item);
    }
    const groups = new Map<string, typeof verified>();
    for (const item of verified) {
      groups.set(item.vendorId, [...(groups.get(item.vendorId) ?? []), item]);
    }

    const statements = [];
    const created: { id:string;total:number;trackingToken:string;vendorId:string }[] = [];
    for (const [vendorId, items] of groups) {
      const vendor = await db.prepare(
        "SELECT id,owner_id,address,city FROM vendors WHERE id=? AND status='active'",
      ).bind(vendorId).first<Row>();
      if (!vendor) {
        await db.batch(reserved.map((held) => db.prepare(
          "UPDATE products SET stock=stock+?,updated_at=? WHERE id=?",
        ).bind(held.quantity,Date.now(),held.id)));
        await db.prepare("DELETE FROM idempotency_records WHERE id=?")
          .bind(idempotencyId).run();
        return reject("A selected store is unavailable.");
      }
      const subtotal = items.reduce((sum,item)=>sum+item.price*item.quantity,0);
      let discount = 0;
      let appliedCode: string | null = null;
      let promotionId: string | null = null;
      if (promotionCode) {
        const promotion = await db.prepare(
          `SELECT * FROM promotions WHERE vendor_id=? AND code=? AND active=1
           AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)
           AND (usage_limit IS NULL OR usage_count<usage_limit)`,
        ).bind(vendorId,promotionCode,now,now).first<Row>();
        if (promotion && subtotal >= Number(promotion.minimum_order ?? 0)) {
          discount = String(promotion.discount_type) === "fixed"
            ? Number(promotion.discount_value)
            : Math.round(subtotal * Number(promotion.discount_value) / 100);
          discount = Math.max(0,Math.min(discount,subtotal-50));
          appliedCode = promotionCode;
          promotionId = String(promotion.id);
        }
      }
      const deliveryFee = 1500;
      const total = subtotal - discount + deliveryFee;
      const id = `KL-${Date.now().toString().slice(-4)}${crypto.randomUUID().slice(0,2).toUpperCase()}`;
      const trackingToken = crypto.randomUUID().replaceAll("-","");
      const pickupRandom = crypto.getRandomValues(new Uint32Array(1))[0];
      const deliveryRandom = crypto.getRandomValues(new Uint32Array(1))[0];
      statements.push(
        db.prepare(`INSERT INTO orders
          (id,customer_id,vendor_id,status,subtotal,discount,promotion_code,delivery_fee,total,
           payment_method,payment_status,delivery_address,delivery_lat,delivery_lng,notes,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(id,userId,vendorId,"pending",subtotal,discount,appliedCode,deliveryFee,total,
            "cash","pending",address,deliveryLat,deliveryLng,String(body.notes??""),now,now),
        db.prepare(`INSERT INTO deliveries
          (id,order_id,tracking_token,status,pickup_address,dropoff_address,distance_km,courier_fee,pickup_code,delivery_code)
          VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .bind(crypto.randomUUID(),id,trackingToken,"unassigned",
            String(vendor.address??vendor.city??"Vendor"),address,0,deliveryFee,
            String(1000+(pickupRandom%9000)),String(1000+(deliveryRandom%9000))),
        db.prepare("INSERT INTO payments (id,order_id,provider,amount,status,created_at) VALUES (?,?,?,?,?,?)")
          .bind(crypto.randomUUID(),id,"cash",total,"pending",now),
        notificationStatement(vendor.owner_id,"order","New order received",
          `Order ${id} is ready for review.`,"/dashboard",now),
      );
      for (const item of items) {
        statements.push(
          db.prepare("INSERT INTO order_items (id,order_id,product_id,name,quantity,unit_price) VALUES (?,?,?,?,?,?)")
            .bind(crypto.randomUUID(),id,item.id,item.name,item.quantity,item.price),
        );
      }
      if (promotionId) {
        statements.push(db.prepare(
          "UPDATE promotions SET usage_count=usage_count+1 WHERE id=?",
        ).bind(promotionId));
      }
      created.push({id,total,trackingToken,vendorId});
    }
    try {
      await db.batch(statements);
    } catch (error) {
      await db.batch(reserved.map((held) => db.prepare(
        "UPDATE products SET stock=stock+?,updated_at=? WHERE id=?",
      ).bind(held.quantity,Date.now(),held.id)));
      await db.prepare("DELETE FROM idempotency_records WHERE id=?")
        .bind(idempotencyId).run();
      throw error;
    }
    const responseBody = {
      id:created[0].id,
      ids:created.map(order=>order.id),
      total:created.reduce((sum,order)=>sum+order.total,0),
      orders:created,
      split:created.length>1,
    };
    await db.prepare(
      `UPDATE idempotency_records SET status='completed',response_json=?,updated_at=?
       WHERE id=?`,
    ).bind(JSON.stringify(responseBody),Date.now(),idempotencyId).run();
    return secureJson(responseBody);
  }

  if (action === "update_order") {
    if (role !== "vendor") return reject("Vendor account required",403);
    const vendor=await ownedVendor(userId); const orderId=String(body.orderId??""); const status=String(body.status??"");
    if (!vendor || !["accepted","preparing","ready","rejected"].includes(status)) return reject("Invalid order update");
    const result=await db.prepare("UPDATE orders SET status=?,updated_at=? WHERE id=? AND vendor_id=?").bind(status,now,orderId,vendor.id).run();
    if (!result.meta.changes) return reject("Order not found",404);
    const order = await db.prepare("SELECT customer_id FROM orders WHERE id=?").bind(orderId).first<Row>();
    if (order?.customer_id) {
      await notificationStatement(order.customer_id,"order","Order updated",
        `Order ${orderId} is now ${status.replaceAll("_"," ")}.`,"/dashboard",now).run();
    }
    return Response.json({status});
  }

  if (action === "cancel_order") {
    if (role !== "customer") return reject("Customer account required", 403);
    const orderId = String(body.orderId ?? "");
    const reason = String(body.reason ?? "Customer cancelled").trim().slice(0, 300);
    const order = await db.prepare(
      "SELECT id,vendor_id FROM orders WHERE id=? AND customer_id=? AND status='pending'",
    ).bind(orderId,userId).first<Row>();
    if (!order) return reject("Only pending orders can be cancelled.", 409);
    const items = await db.prepare(
      "SELECT product_id,quantity FROM order_items WHERE order_id=?",
    ).bind(orderId).all<Row>();
    const vendor = await db.prepare("SELECT owner_id FROM vendors WHERE id=?")
      .bind(order.vendor_id).first<Row>();
    const statements = [
      db.prepare("UPDATE orders SET status='cancelled',cancellation_reason=?,cancelled_at=?,updated_at=? WHERE id=?")
        .bind(reason,now,now,orderId),
      db.prepare("UPDATE deliveries SET status='cancelled' WHERE order_id=?").bind(orderId),
    ];
    for (const item of items.results) {
      statements.push(db.prepare(
        "UPDATE products SET stock=stock+?,updated_at=? WHERE id=?",
      ).bind(item.quantity,now,item.product_id));
    }
    if (vendor?.owner_id) {
      statements.push(notificationStatement(vendor.owner_id,"order","Order cancelled",
        `Order ${orderId} was cancelled by the customer.`,"/dashboard",now));
    }
    await db.batch(statements);
    return Response.json({status:"cancelled"});
  }

  if (action === "accept_delivery") {
    if (role !== "rider") return reject("Rider account required",403);
    const id=String(body.deliveryId??"");
    const result=await db.prepare("UPDATE deliveries SET courier_id=?,status='accepted',accepted_at=? WHERE id=? AND status='unassigned' AND courier_id IS NULL").bind(userId,now,id).run();
    if (!result.meta.changes) return reject("Delivery is no longer available",409);
    const order = await db.prepare(
      `SELECT o.id,o.customer_id,v.owner_id FROM orders o
       JOIN deliveries d ON d.order_id=o.id JOIN vendors v ON v.id=o.vendor_id
       WHERE d.id=?`,
    ).bind(id).first<Row>();
    if (order) {
      await db.batch([
        notificationStatement(order.customer_id,"delivery","Rider assigned",
          `A rider accepted delivery for order ${String(order.id)}.`,"/dashboard",now),
        notificationStatement(order.owner_id,"delivery","Rider assigned",
          `A rider accepted order ${String(order.id)}.`,"/dashboard",now),
      ]);
    }
    return Response.json({status:"accepted"});
  }

  if (action === "update_delivery" || action === "update_location") {
    if (role !== "rider") return reject("Rider account required",403);
    const id=String(body.deliveryId??""); const owned=await db.prepare("SELECT id FROM deliveries WHERE id=? AND courier_id=?").bind(id,userId).first();
    if (!owned) return reject("Delivery not assigned to you",403);
    if (action === "update_location") {
      const lat=Number(body.latitude),lng=Number(body.longitude); if (!Number.isFinite(lat)||!Number.isFinite(lng)) return reject("Invalid location");
      await db.prepare("UPDATE deliveries SET current_lat=?,current_lng=?,location_updated_at=? WHERE id=?").bind(lat,lng,now,id).run();
      return Response.json({updatedAt:now});
    }
    const status=String(body.status??""); if (!["arrived_pickup","picked_up","arrived_dropoff","delivered","failed"].includes(status)) return reject("Invalid delivery status");
    await db.prepare("UPDATE deliveries SET status=?,picked_up_at=CASE WHEN ?='picked_up' THEN ? ELSE picked_up_at END,delivered_at=CASE WHEN ?='delivered' THEN ? ELSE delivered_at END WHERE id=?").bind(status,status,now,status,now,id).run();
    await db.prepare("INSERT INTO tracking_events (id,delivery_id,event_type,label,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),id,status,status.replaceAll("_"," "),now).run();
    if(status==="delivered"){
      await db.prepare("UPDATE orders SET status='delivered',updated_at=? WHERE id=(SELECT order_id FROM deliveries WHERE id=?)").bind(now,id).run();
      await db.prepare("UPDATE courier_profiles SET completed_deliveries=completed_deliveries+1 WHERE user_id=?").bind(userId).run();
      const order = await db.prepare(
        `SELECT o.id,o.customer_id,v.owner_id FROM orders o JOIN vendors v ON v.id=o.vendor_id
         WHERE o.id=(SELECT order_id FROM deliveries WHERE id=?)`,
      ).bind(id).first<Row>();
      if (order) {
        await db.batch([
          notificationStatement(order.customer_id,"delivery","Order delivered",
            `Order ${String(order.id)} has been delivered.`,"/dashboard",now),
          notificationStatement(order.owner_id,"delivery","Delivery completed",
            `Order ${String(order.id)} was delivered successfully.`,"/dashboard",now),
        ]);
      }
    }
    return Response.json({status});
  }

  if (action === "send_message") {
    const orderId=String(body.orderId??""); if (!await canAccessOrder(userId,role,orderId)) return reject("You are not part of this order",403);
    const text=String(body.body??"").trim(); if (!text||text.length>2000) return reject("Message must be between 1 and 2000 characters");
    const id=crypto.randomUUID(); await db.prepare("INSERT INTO messages (id,order_id,sender_id,sender_name,sender_role,body,message_type,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(id,orderId,userId,String(actor.display_name),role,text,"text",now).run();
    return Response.json({id,createdAt:now});
  }
  return reject("Unknown action");
}
