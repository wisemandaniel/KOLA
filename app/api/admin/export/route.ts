import { env } from "cloudflare:workers";
import { getRequestActor } from "../../../order-access";
import { secureJson } from "../../../security";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getRequestActor();
  if (!actor) return secureJson({ error: "Authentication required." }, 401);
  const administrator = await env.DB.prepare(
    "SELECT is_admin FROM users WHERE id=? LIMIT 1",
  ).bind(actor.id).first<{ is_admin: number }>();
  if (!administrator?.is_admin) {
    return secureJson({ error: "Administrator access required." }, 403);
  }

  const [
    users,
    vendors,
    products,
    orders,
    orderItems,
    deliveries,
    payments,
    paymentAttempts,
    supportTickets,
    courierVerifications,
  ] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id,email,display_name,phone,active_role,language,city,is_admin,
              onboarding_complete,created_at FROM users ORDER BY created_at`,
    ),
    env.DB.prepare("SELECT * FROM vendors ORDER BY created_at"),
    env.DB.prepare(
      `SELECT id,vendor_id,name,description,category,price,stock,active,created_at,updated_at
       FROM products ORDER BY created_at`,
    ),
    env.DB.prepare("SELECT * FROM orders ORDER BY created_at"),
    env.DB.prepare("SELECT * FROM order_items ORDER BY order_id"),
    env.DB.prepare(
      `SELECT id,order_id,courier_id,status,pickup_address,dropoff_address,
              distance_km,courier_fee,estimated_arrival,accepted_at,picked_up_at,
              delivered_at,location_updated_at FROM deliveries ORDER BY rowid`,
    ),
    env.DB.prepare("SELECT * FROM payments ORDER BY created_at"),
    env.DB.prepare("SELECT * FROM payment_attempts ORDER BY created_at"),
    env.DB.prepare("SELECT * FROM support_tickets ORDER BY created_at"),
    env.DB.prepare(
      `SELECT id,user_id,document_type,status,review_note,created_at,reviewed_at
       FROM courier_verification_requests ORDER BY created_at`,
    ),
  ]);

  const stamp = new Date().toISOString().replaceAll(":", "-");
  return secureJson(
    {
      exportedAt: new Date().toISOString(),
      exportedBy: actor.id,
      formatVersion: 1,
      data: {
        users: users.results,
        vendors: vendors.results,
        products: products.results,
        orders: orders.results,
        orderItems: orderItems.results,
        deliveries: deliveries.results,
        payments: payments.results,
        paymentAttempts: paymentAttempts.results,
        supportTickets: supportTickets.results,
        courierVerifications: courierVerifications.results,
      },
    },
    200,
    {
      "content-disposition": `attachment; filename="kola-export-${stamp}.json"`,
    },
  );
}
