import { env } from "cloudflare:workers";
import { getAuthenticatedUser } from "../../auth";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

async function requireActor() {
  const identity = await getAuthenticatedUser();
  if (!identity) return null;
  const actor = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(identity.userId).first<Row>();
  return actor ? { ...actor, _auth_provider: identity.provider } : null;
}

function reject(message: string, status = 400) {
  return Response.json({ error: message }, { status });
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

export async function GET() {
  const actor = await requireActor();
  if (!actor) return reject("Authentication required", 401);
  const db = env.DB;
  const role = String(actor.active_role);
  const actorId = String(actor.id);
  let orders; let deliveries;
  if (role === "vendor") {
    const vendor = await ownedVendor(String(actor.id));
    orders = vendor ? await db.prepare("SELECT * FROM orders WHERE vendor_id=? ORDER BY created_at DESC LIMIT 100").bind(vendor.id).all() : { results: [] };
    deliveries = vendor ? await db.prepare("SELECT d.* FROM deliveries d JOIN orders o ON d.order_id=o.id WHERE o.vendor_id=? ORDER BY o.created_at DESC").bind(vendor.id).all() : { results: [] };
  } else if (role === "rider") {
    orders = await db.prepare("SELECT o.* FROM orders o JOIN deliveries d ON o.id=d.order_id WHERE d.courier_id=? OR d.status='unassigned' ORDER BY o.created_at DESC LIMIT 100").bind(actor.id).all();
    deliveries = await db.prepare("SELECT * FROM deliveries WHERE courier_id=? OR status='unassigned' ORDER BY rowid DESC LIMIT 100").bind(actor.id).all();
  } else {
    orders = await db.prepare("SELECT * FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 100").bind(actor.id).all();
    deliveries = await db.prepare("SELECT d.* FROM deliveries d JOIN orders o ON d.order_id=o.id WHERE o.customer_id=? ORDER BY o.created_at DESC").bind(actor.id).all();
  }
  const [products, vendors, addresses, messages] = await db.batch([
    db.prepare("SELECT p.*,v.name AS vendor_name FROM products p JOIN vendors v ON p.vendor_id=v.id WHERE p.active=1 AND v.status='active' ORDER BY p.created_at DESC"),
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
    actor: { id: actor.id, email: actor.email, displayName: actor.display_name, activeRole: role, language: actor.language, city: actor.city, onboardingComplete: !!actor.onboarding_complete, authProvider: actor._auth_provider },
    products: products.results, vendors: vendors.results, orders: orders.results, deliveries: deliveries.results, messages: messages.results, addresses: addresses.results,
  });
}

export async function POST(request: Request) {
  const actor = await requireActor();
  if (!actor) return reject("Authentication required", 401);
  const body = await request.json() as Record<string, unknown>;
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
    await db.prepare("INSERT INTO products (id,vendor_id,name,description,category,price,stock,emoji,active,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(id, vendor.id, name, String(body.description ?? ""), String(body.category ?? "Other"), price, stock, "", 1, now).run();
    return Response.json({ id });
  }

  if (action === "create_order") {
    if (role !== "customer") return reject("Customer account required", 403);
    const requested = Array.isArray(body.items) ? body.items as Row[] : []; if (!requested.length) return reject("Your cart is empty");
    const verified: { id:string;name:string;price:number;quantity:number;vendorId:string }[] = [];
    for (const item of requested.slice(0,50)) {
      const product = await db.prepare("SELECT id,name,price,stock,vendor_id FROM products WHERE id=? AND active=1").bind(String(item.id)).first<Row>();
      const quantity = Math.max(1,Math.min(20,Math.round(Number(item.quantity ?? 1))));
      if (!product || Number(product.stock) < quantity) return reject(`${String(product?.name ?? "A product")} is unavailable`);
      verified.push({ id:String(product.id),name:String(product.name),price:Number(product.price),quantity,vendorId:String(product.vendor_id) });
    }
    if (new Set(verified.map(i=>i.vendorId)).size !== 1) return reject("MVP checkout supports one vendor per order");
    const address = String(body.address ?? "").trim(); if (address.length < 5) return reject("Enter a delivery address");
    const subtotal = verified.reduce((sum,i)=>sum+i.price*i.quantity,0); const deliveryFee=1500; const id=`KL-${Date.now().toString().slice(-6)}`;
    await db.prepare("INSERT INTO orders (id,customer_id,vendor_id,status,subtotal,delivery_fee,total,payment_method,payment_status,delivery_address,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,userId,verified[0].vendorId,"pending",subtotal,deliveryFee,subtotal+deliveryFee,"cash","pending",address,String(body.notes??""),now,now).run();
    for (const item of verified) {
      await db.prepare("INSERT INTO order_items (id,order_id,product_id,name,quantity,unit_price) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),id,item.id,item.name,item.quantity,item.price).run();
      await db.prepare("UPDATE products SET stock=stock-? WHERE id=? AND stock>=?").bind(item.quantity,item.id,item.quantity).run();
    }
    const vendor=await db.prepare("SELECT address,city FROM vendors WHERE id=?").bind(verified[0].vendorId).first<Row>();
    const trackingToken=crypto.randomUUID().replaceAll("-","");
    await db.prepare("INSERT INTO deliveries (id,order_id,tracking_token,status,pickup_address,dropoff_address,distance_km,courier_fee,pickup_code,delivery_code) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),id,trackingToken,"unassigned",String(vendor?.address??vendor?.city??"Vendor"),address,0,deliveryFee,String(Math.floor(1000+Math.random()*9000)),String(Math.floor(1000+Math.random()*9000))).run();
    await db.prepare("INSERT INTO payments (id,order_id,provider,amount,status,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),id,"cash",subtotal+deliveryFee,"pending",now).run();
    return Response.json({ id,total:subtotal+deliveryFee,trackingToken });
  }

  if (action === "update_order") {
    if (role !== "vendor") return reject("Vendor account required",403);
    const vendor=await ownedVendor(userId); const orderId=String(body.orderId??""); const status=String(body.status??"");
    if (!vendor || !["accepted","preparing","ready","rejected"].includes(status)) return reject("Invalid order update");
    const result=await db.prepare("UPDATE orders SET status=?,updated_at=? WHERE id=? AND vendor_id=?").bind(status,now,orderId,vendor.id).run();
    if (!result.meta.changes) return reject("Order not found",404);
    return Response.json({status});
  }

  if (action === "accept_delivery") {
    if (role !== "rider") return reject("Rider account required",403);
    const id=String(body.deliveryId??"");
    const result=await db.prepare("UPDATE deliveries SET courier_id=?,status='accepted',accepted_at=? WHERE id=? AND status='unassigned' AND courier_id IS NULL").bind(userId,now,id).run();
    if (!result.meta.changes) return reject("Delivery is no longer available",409);
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
    if(status==="delivered"){await db.prepare("UPDATE orders SET status='delivered',updated_at=? WHERE id=(SELECT order_id FROM deliveries WHERE id=?)").bind(now,id).run();await db.prepare("UPDATE courier_profiles SET completed_deliveries=completed_deliveries+1 WHERE user_id=?").bind(userId).run();}
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
