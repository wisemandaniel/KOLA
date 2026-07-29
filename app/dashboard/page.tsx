import { env } from "cloudflare:workers";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "../auth";
import DashboardClient from "./DashboardClient";
import SuperadminDashboard from "./SuperadminDashboard";

export const dynamic = "force-dynamic";

type Profile = {
  display_name: string;
  email: string;
  city: string | null;
  active_role: "customer" | "vendor" | "rider" | "admin" | "superadmin";
  is_admin: number;
  admin_level: "none" | "admin" | "superadmin";
  onboarding_complete: number;
};

export default async function DashboardPage() {
  const identity = await requireAuthenticatedUser("/dashboard");
  const profile = await env.DB.prepare(
    `SELECT display_name,email,city,active_role,is_admin,admin_level,onboarding_complete
     FROM users WHERE id = ?`,
  )
    .bind(identity.userId)
    .first<Profile>();

  if (!profile?.onboarding_complete) redirect("/onboarding");

  const role = profile.active_role || identity.activeRole;
  const adminLevel = profile.admin_level || identity.adminLevel;
  const isSuperadmin =
    role === "superadmin" || adminLevel === "superadmin" || identity.adminLevel === "superadmin";

  if (isSuperadmin) {
    return (
      <SuperadminDashboard
        actor={{
          displayName: profile.display_name || identity.displayName || "Kola Administrator",
          email: profile.email || identity.email,
          city: profile.city || undefined,
        }}
      />
    );
  }

  return <DashboardClient />;
}
