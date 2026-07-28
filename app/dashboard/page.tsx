import { env } from "cloudflare:workers";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "../auth";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const identity = await requireAuthenticatedUser("/dashboard");
  const profile = await env.DB.prepare(
    "SELECT onboarding_complete FROM users WHERE id = ?",
  )
    .bind(identity.userId)
    .first<{ onboarding_complete: number }>();
  if (!profile?.onboarding_complete) redirect("/onboarding");
  return <DashboardClient />;
}
