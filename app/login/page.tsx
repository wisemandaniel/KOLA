import { env } from "cloudflare:workers";
import { redirect } from "next/navigation";
import {
  getAuthenticatedUser,
  readRuntimeAuthConfig,
  safeReturnPath,
} from "../auth";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnPath(params.return_to, "/dashboard");
  const user = await getAuthenticatedUser();

  if (user) {
    const profile = await env.DB.prepare(
      "SELECT onboarding_complete FROM users WHERE id = ?",
    )
      .bind(user.userId)
      .first<{ onboarding_complete: number }>();
    redirect(profile?.onboarding_complete ? returnTo : "/onboarding");
  }

  const authConfig = readRuntimeAuthConfig();
  const whatsappReady = Boolean(
    authConfig.sessionSecret && authConfig.waSenderApiKey,
  );

  return <LoginClient returnTo={returnTo} whatsappReady={whatsappReady} />;
}
