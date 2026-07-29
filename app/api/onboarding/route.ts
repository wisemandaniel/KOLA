import { env } from "cloudflare:workers";
import { getAuthenticatedUser } from "../../auth";
import {
  enforceRateLimit,
  rejectCrossSiteMutation,
  secureJson,
} from "../../security";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function reject(message: string, status = 400) {
  return secureJson({ error: message }, status);
}

export async function POST(request: Request) {
  try {
    const crossSite = rejectCrossSiteMutation(request);
    if (crossSite) return crossSite;

    const identity = await getAuthenticatedUser();
    if (!identity) return reject("Authentication required", 401);

    const limited = await enforceRateLimit({
      request,
      scope: "onboarding.complete.user",
      subject: identity.userId,
      limit: 10,
      windowSeconds: 60,
    });
    if (limited) return limited;

    let body: Row;
    try {
      body = await request.json() as Row;
    } catch {
      return reject("The registration request could not be read.");
    }

    const actor = await env.DB.prepare("SELECT * FROM users WHERE id=?")
      .bind(identity.userId)
      .first<Row>();
    if (!actor) return reject("Account not found", 404);

    const role = String(body.role ?? "customer");
    if (!["customer", "vendor", "rider"].includes(role)) {
      return reject("Choose a valid account type.");
    }

    const displayName = String(body.displayName ?? "").trim();
    const city = String(body.city ?? "").trim();
    const verifiedPhone = identity.provider === "whatsapp" && actor.phone
      ? String(actor.phone)
      : String(body.phone ?? "").replace(/\s/g, "");

    if (!displayName || !city || verifiedPhone.replace(/\D/g, "").length < 9) {
      return reject("Complete all required contact details.");
    }

    await ensureOnboardingTables();
    const now = Date.now();

    await env.DB.prepare(
      "UPDATE users SET display_name=?,active_role=?,phone=?,city=?,onboarding_complete=1 WHERE id=?",
    ).bind(displayName, role, verifiedPhone, city, identity.userId).run();

    if (role === "vendor") {
      const businessName = String(body.businessName ?? "").trim();
      const address = String(body.address ?? "").trim();
      const category = String(body.businessCategory ?? "Retail").trim() || "Retail";
      if (!businessName || !address) return reject("Enter your business name and pickup address.");

      const existing = await env.DB.prepare("SELECT id FROM vendors WHERE owner_id=? LIMIT 1")
        .bind(identity.userId)
        .first<Row>();
      if (existing) {
        await env.DB.prepare(
          "UPDATE vendors SET name=?,category=?,address=?,city=?,status='active' WHERE id=?",
        ).bind(businessName, category, address, city, existing.id).run();
      } else {
        const id = `vnd_${crypto.randomUUID()}`;
        const baseSlug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "store";
        await env.DB.prepare(
          `INSERT INTO vendors
            (id,owner_id,name,slug,category,address,city,status,rating,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        ).bind(id, identity.userId, businessName, `${baseSlug}-${id.slice(-6)}`, category, address, city, "active", 5, now).run();
      }
    }

    if (role === "rider") {
      const vehicleType = String(body.vehicleType ?? "motorcycle");
      await env.DB.prepare(
        `INSERT INTO courier_profiles
          (user_id,vehicle_type,status,verification_status,rating,completed_deliveries,created_at)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET vehicle_type=excluded.vehicle_type`,
      ).bind(identity.userId, vehicleType, "offline", "pending", 5, 0, now).run();
    }

    if (role === "customer") {
      const address = String(body.address ?? "").trim();
      if (!address) return reject("Enter your delivery address.");
      const existing = await env.DB.prepare("SELECT id FROM addresses WHERE user_id=? AND is_default=1 LIMIT 1")
        .bind(identity.userId)
        .first<Row>();
      if (existing) {
        await env.DB.prepare("UPDATE addresses SET address=?,city=? WHERE id=?")
          .bind(address, city, existing.id).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO addresses
            (id,user_id,label,address,city,instructions,is_default,created_at)
           VALUES (?,?,?,?,?,?,?,?)`,
        ).bind(crypto.randomUUID(), identity.userId, "Home", address, city, "", 1, now).run();
      }
    }

    return secureJson({ role, redirectTo: "/dashboard" });
  } catch (error) {
    console.error("Onboarding failed", error);
    return reject(error instanceof Error ? error.message : "Account setup failed.", 500);
  }
}

async function ensureOnboardingTables() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      rating REAL NOT NULL DEFAULT 5,
      created_at INTEGER NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_owner ON vendors(owner_id)`,
    `CREATE TABLE IF NOT EXISTS courier_profiles (
      user_id TEXT PRIMARY KEY,
      vehicle_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'offline',
      verification_status TEXT NOT NULL DEFAULT 'pending',
      rating REAL NOT NULL DEFAULT 5,
      completed_deliveries INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      label TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      instructions TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id)`,
  ];
  for (const sql of statements) await env.DB.prepare(sql).run();
}
