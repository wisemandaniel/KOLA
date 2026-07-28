import { finishOAuth, OAuthProvider } from "../../../../../oauth";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (provider !== "google" && provider !== "facebook") {
    return Response.json({ error: "Unsupported sign-in provider." }, { status: 404 });
  }
  return finishOAuth(request, provider as OAuthProvider);
}
