import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

type D1Row = Record<string, unknown>;

const demoProducts = [
  ["prd_ndole", "vnd_mado", "Ndolé royal", "Traditional ndolé, plantain and beef", "Food", 3500, 24, "🍲"],
  ["prd_market", "vnd_mado", "Panier marché frais", "Seasonal produce basket", "Groceries", 8500, 12, "🥬"],
  ["prd_shoes", "vnd_mado", "Sneakers Noki", "Everyday lightweight trainers", "Fashion", 22000, 8, "👟"],
  ["prd_dg", "vnd_mado", "Poulet DG", "Chicken, plantain and vegetables", "Food", 5000, 18, "🍛"],
];

async function actor() {
  const signedIn = await getChatGPTUser();
  return signedIn ?? { email: "demo@kola.cm", displayName: "Mireille N.", fullName: "Mireille N." };
}

async function seed(email: string, displayName: string) {
  const db = env.DB;
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id,email,display_name,phone,active_role,language,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind("usr_demo", email, displayName, "+237 6 99 00 00 00", "customer", "en", now),
    db.prepare("INSERT OR IGNORE INTO users (id,email,display_name,phone,active_role,language,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind("usr_brice", "brice@kola.cm", "Brice N.", "+237 6 70 00 00 00", "rider", "fr", now),
    db.prepare("INSERT OR IGNORE INTO vendors (id,owner_id,name,slug,category,address,city,latitude,longitude,status,rating,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind("vnd_mado", "usr_demo", "Chez Mado", "chez-mado", "Restaurant", "Rue Njo-Njo, Bonapriso", "Douala", 4.031, 9.687, "active", 4.9, now),
  ]);
  for (const p of demoProducts) {
    await db.prepare("INSERT OR IGNORE INTO products (id,vendor_id,name,description,category,price,stock,emoji,active,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(...p, 1, now).run();
  }
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO orders (id,customer_id,vendor_id,status,subtotal,delivery_fee,total,payment_method,payment_status,delivery_address,delivery_lat,delivery_lng,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind("KL-2084", "usr_demo", "vnd_mado", "on_the_way", 17000, 1500, 18500, "mobile_money", "paid", "Bonapriso, Rue 1.204, blue gate", 4.023, 9.693, "Call at the gate", now - 1200000, now),
    db.prepare("INSERT OR IGNORE INTO deliveries (id,order_id,courier_id,status,pickup_address,dropoff_address,distance_km,courier_fee,pickup_code,delivery_code,estimated_arrival,accepted_at,picked_up_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind("del_2084", "KL-2084", "usr_brice", "picked_up", "Chez Mado, Rue Njo-Njo", "Bonapriso, Rue 1.204", 2.4, 1500, "2841", "7195", now + 480000, now - 900000, now - 240000),
    db.prepare("INSERT OR IGNORE INTO messages (id,order_id,sender_id,sender_name,sender_role,body,message_type,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind("msg_vendor", "KL-2084", "usr_demo", "Chez Mado", "vendor", "Your order is packed and ready.", "text", now - 300000),
    db.prepare("INSERT OR IGNORE INTO messages (id,order_id,sender_id,sender_name,sender_role,body,message_type,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind("msg_rider", "KL-2084", "usr_brice", "Brice · Rider", "rider", "I’ve picked it up. I’ll call when I reach the gate.", "text", now - 180000),
  ]);
}

export async function GET() {
  const user = await actor();
  await seed(user.email, user.displayName);
  const db = env.DB;
  const [products, orders, deliveries, messages, vendors] = await db.batch([
    db.prepare("SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC"),
    db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 50"),
    db.prepare("SELECT * FROM deliveries ORDER BY rowid DESC LIMIT 50"),
    db.prepare("SELECT * FROM messages ORDER BY created_at ASC LIMIT 200"),
    db.prepare("SELECT * FROM vendors WHERE status = 'active'"),
  ]);
  return Response.json({
    actor: { email: user.email, displayName: user.displayName },
    products: products.results,
    orders: orders.results,
    deliveries: deliveries.results,
    messages: messages.results,
    vendors: vendors.results,
  });
}

export async function POST(request: Request) {
  const user = await actor();
  const db = env.DB;
  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action ?? "");
  const now = Date.now();

  if (action === "send_message") {
    const text = String(body.body ?? "").trim();
    if (!text || text.length > 2000) return Response.json({ error: "Invalid message" }, { status: 400 });
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO messages (id,order_id,sender_id,sender_name,sender_role,body,message_type,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(id, String(body.orderId ?? "KL-2084"), user.email, user.displayName, String(body.role ?? "customer"), text, "text", now).run();
    return Response.json({ id, createdAt: now });
  }

  if (action === "update_delivery") {
    const allowed = ["assigned", "accepted", "arrived_pickup", "picked_up", "arrived_dropoff", "delivered", "failed"];
    const status = String(body.status ?? "");
    if (!allowed.includes(status)) return Response.json({ error: "Invalid status" }, { status: 400 });
    await db.prepare("UPDATE deliveries SET status = ? WHERE id = ?").bind(status, String(body.deliveryId ?? "del_2084")).run();
    await db.prepare("INSERT INTO tracking_events (id,delivery_id,event_type,label,created_at) VALUES (?,?,?,?,?)")
      .bind(crypto.randomUUID(), String(body.deliveryId ?? "del_2084"), status, status.replaceAll("_", " "), now).run();
    return Response.json({ status });
  }

  if (action === "accept_delivery") {
    await db.prepare("UPDATE deliveries SET courier_id = ?, status = 'accepted', accepted_at = ? WHERE id = ?")
      .bind(user.email, now, String(body.deliveryId ?? "del_2084")).run();
    return Response.json({ status: "accepted" });
  }

  if (action === "create_product") {
    const name = String(body.name ?? "").trim();
    const price = Number(body.price ?? 0);
    if (!name || price < 0) return Response.json({ error: "Invalid product" }, { status: 400 });
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO products (id,vendor_id,name,description,category,price,stock,emoji,active,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(id, "vnd_mado", name, String(body.description ?? ""), String(body.category ?? "Other"), price, Number(body.stock ?? 0), String(body.emoji ?? "📦"), 1, now).run();
    return Response.json({ id });
  }

  if (action === "create_order") {
    const items = Array.isArray(body.items) ? body.items as D1Row[] : [];
    if (!items.length) return Response.json({ error: "Cart is empty" }, { status: 400 });
    const id = `KL-${Math.floor(1000 + Math.random() * 9000)}`;
    const subtotal = items.reduce((sum, item) => sum + Number(item.price ?? 0) * Number(item.quantity ?? 1), 0);
    const deliveryFee = 1500;
    await db.prepare("INSERT INTO orders (id,customer_id,vendor_id,status,subtotal,delivery_fee,total,payment_method,payment_status,delivery_address,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, user.email, "vnd_mado", "pending", subtotal, deliveryFee, subtotal + deliveryFee, String(body.paymentMethod ?? "cash"), "pending", String(body.address ?? "Bonapriso, Douala"), String(body.notes ?? ""), now, now).run();
    for (const item of items) {
      await db.prepare("INSERT INTO order_items (id,order_id,product_id,name,quantity,unit_price) VALUES (?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), id, String(item.id), String(item.name), Number(item.quantity ?? 1), Number(item.price ?? 0)).run();
    }
    await db.prepare("INSERT INTO deliveries (id,order_id,status,pickup_address,dropoff_address,distance_km,courier_fee,pickup_code,delivery_code) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), id, "unassigned", "Chez Mado, Bonapriso", String(body.address ?? "Bonapriso, Douala"), 0, deliveryFee, String(Math.floor(1000 + Math.random() * 9000)), String(Math.floor(1000 + Math.random() * 9000))).run();
    return Response.json({ id, total: subtotal + deliveryFee });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
