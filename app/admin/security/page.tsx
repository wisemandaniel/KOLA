import { env } from "cloudflare:workers";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "../../auth";
import { isSuperadmin } from "../../admin";
import SecurityClient from "./SecurityClient";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function AdminSecurityPage() {
  const identity = await requireAuthenticatedUser("/admin/security");
  const actor = await env.DB.prepare("SELECT * FROM users WHERE id=?")
    .bind(identity.userId)
    .first<Row>();

  if (!actor || !isSuperadmin(actor)) redirect("/dashboard");

  return <SecurityClient displayName={String(actor.display_name ?? identity.displayName ?? "Kola Administrator")} />;
}
