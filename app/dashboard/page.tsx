import { env } from "cloudflare:workers";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "../auth";
import DashboardClient from "./DashboardClient";
import SuperadminDashboard from "./SuperadminDashboard";

export const dynamic = "force-dynamic";

type Profile = Record<string, unknown>;

export default async function DashboardPage() {
  const identity = await requireAuthenticatedUser("/dashboard");

  // Read the complete row rather than naming optional columns. Some early Kola
  // D1 databases were created before fields such as `city` were introduced,
  // and selecting a missing column makes D1 abort the whole server render.
  const profile = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(identity.userId)
    .first<Profile>();

  if (!profile) redirect("/login?auth_error=Account%20profile%20not%20found");
  if (!Boolean(profile.onboarding_complete)) redirect("/onboarding");

  const role = String(profile.active_role ?? identity.activeRole ?? "customer");
  const adminLevel = String(profile.admin_level ?? identity.adminLevel ?? "none");
  const isSuperadmin =
    role === "superadmin" ||
    adminLevel === "superadmin" ||
    identity.adminLevel === "superadmin";

  if (isSuperadmin) {
    return (
      <SuperadminDashboard
        actor={{
          displayName: String(
            profile.display_name ?? identity.displayName ?? "Kola Administrator",
          ),
          email: String(profile.email ?? identity.email ?? ""),
          city: profile.city ? String(profile.city) : undefined,
        }}
      />
    );
  }

  return <DashboardClient />;
}
