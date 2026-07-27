import { requireChatGPTUser } from "../chatgpt-auth";
import OnboardingClient from "./OnboardingClient";

export const dynamic = "force-dynamic";
export default async function OnboardingPage() {
  const user = await requireChatGPTUser("/onboarding");
  return <OnboardingClient name={user.displayName} />;
}
