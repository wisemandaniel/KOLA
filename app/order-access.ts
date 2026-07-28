import { env } from "cloudflare:workers";
import { getAuthenticatedUser } from "./auth";

export type RequestActor = {
  id: string;
  displayName: string;
  role: string;
};

export async function getRequestActor(): Promise<RequestActor | null> {
  const identity = await getAuthenticatedUser();
  if (!identity) return null;

  const actor = await env.DB.prepare(
    "SELECT id, display_name, active_role FROM users WHERE id = ?",
  )
    .bind(identity.userId)
    .first<{ id: string; display_name: string; active_role: string }>();

  return actor
    ? {
        id: actor.id,
        displayName: actor.display_name,
        role: actor.active_role,
      }
    : null;
}

export async function canAccessOrder(
  userId: string,
  role: string,
  orderId: string,
): Promise<boolean> {
  if (role === "customer") {
    return Boolean(
      await env.DB.prepare(
        "SELECT id FROM orders WHERE id = ? AND customer_id = ?",
      )
        .bind(orderId, userId)
        .first(),
    );
  }
  if (role === "vendor") {
    return Boolean(
      await env.DB.prepare(
        `SELECT o.id
         FROM orders o
         JOIN vendors v ON o.vendor_id = v.id
         WHERE o.id = ? AND v.owner_id = ?`,
      )
        .bind(orderId, userId)
        .first(),
    );
  }
  if (role === "rider") {
    return Boolean(
      await env.DB.prepare(
        "SELECT order_id FROM deliveries WHERE order_id = ? AND courier_id = ?",
      )
        .bind(orderId, userId)
        .first(),
    );
  }
  if (role === "admin" || role === "superadmin") {
    return Boolean(
      await env.DB.prepare("SELECT id FROM orders WHERE id = ?")
        .bind(orderId)
        .first(),
    );
  }
  return false;
}
