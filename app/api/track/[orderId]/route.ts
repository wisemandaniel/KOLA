import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  if (orderId === "demo") {
    const now = Date.now();
    return Response.json({
      order: {
        id: "KL-2084",
        status: "on_the_way",
        delivery_address: "Bonapriso, Douala",
      },
      delivery: {
        status: "on_the_way",
        pickup_address: "Akwa, Douala",
        dropoff_address: "Bonapriso, Douala",
        distance_km: 2.4,
        estimated_arrival: now + 12 * 60 * 1000,
        location_updated_at: now,
      },
      events: [
        { event_type: "accepted", label: "Order accepted", created_at: now - 35 * 60 * 1000 },
        { event_type: "preparing", label: "Vendor prepared order", created_at: now - 24 * 60 * 1000 },
        { event_type: "picked_up", label: "Rider picked up order", created_at: now - 9 * 60 * 1000 },
        { event_type: "on_the_way", label: "Delivery is on the way", created_at: now - 8 * 60 * 1000 },
      ],
      vendor: { name: "Maison Kawa" },
      courier: { name: "Brice N.", rating: 4.9, vehicle: "Motorcycle" },
      demo: true,
    }, { headers: { "cache-control": "public, max-age=30" } });
  }
  const deliveryLookup = await env.DB.prepare(
    "SELECT * FROM deliveries WHERE tracking_token = ?",
  ).bind(orderId).first();
  if (!deliveryLookup) return Response.json({ error: "Order not found" }, { status: 404 });
  const order = await env.DB.prepare("SELECT id,status,total,delivery_address,delivery_lat,delivery_lng,created_at,updated_at FROM orders WHERE id = ?").bind(deliveryLookup.order_id).first();
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  const delivery = await env.DB.prepare("SELECT id,courier_id,status,pickup_address,dropoff_address,distance_km,estimated_arrival,picked_up_at,delivered_at,current_lat,current_lng,location_updated_at FROM deliveries WHERE order_id = ?").bind(order.id).first();
  const events = await env.DB.prepare("SELECT event_type,label,created_at FROM tracking_events WHERE delivery_id = ? ORDER BY created_at ASC").bind(delivery?.id ?? "").all();
  const vendor = await env.DB.prepare(
    `SELECT v.name,v.latitude,v.longitude FROM vendors v
     JOIN orders o ON o.vendor_id=v.id WHERE o.id=?`,
  ).bind(order.id).first();
  const courier = delivery?.courier_id
    ? await env.DB.prepare(
        `SELECT u.display_name AS name,cp.rating,cp.vehicle_type AS vehicle
         FROM users u JOIN courier_profiles cp ON cp.user_id=u.id WHERE u.id=?`,
      ).bind(delivery.courier_id).first()
    : null;
  return Response.json({ order, delivery, events: events.results, vendor, courier });
}
