import { requireAuthenticatedUser } from "../auth";
import OnboardingClient from "./OnboardingClient";

export const dynamic = "force-dynamic";
export default async function OnboardingPage() {
  const user = await requireAuthenticatedUser("/onboarding");
  return (
    <OnboardingClient
      name={user.displayName}
      phone={user.phone ?? ""}
      phoneVerified={user.provider === "whatsapp"}
    />
  );
}
