import { redirect } from "next/navigation";
import { getAuthenticatedUser, safeReturnPath } from "../auth";
import AdminLoginClient from "./AdminLoginClient";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnPath(params.return_to, "/dashboard");
  const user = await getAuthenticatedUser();
  if (user) redirect(returnTo);
  return <AdminLoginClient returnTo={returnTo} />;
}
