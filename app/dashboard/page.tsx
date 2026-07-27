import { requireChatGPTUser } from "../chatgpt-auth";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireChatGPTUser("/dashboard");
  return <DashboardClient />;
}
