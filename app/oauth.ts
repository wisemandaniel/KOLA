import { env } from "cloudflare:workers";
import { createSession, hashValue, readRuntimeAuthConfig, safeReturnPath } from "./auth";
import { enforceRateLimit, recordSecurityEvent } from "./security";

export type OAuthProvider = "google" | "facebook";

type OAuthProfile = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

export function oauthProviderReady(provider: OAuthProvider) {
  const config = readRuntimeAuthConfig();
  return provider === "google"
    ? Boolean(config.googleClientId && config.googleClientSecret)
    : Boolean(
        config.facebookAppId &&
          config.facebookAppSecret &&
          validGraphVersion(config.facebookGraphVersion),
      );
}

export async function beginOAuth(
  request: Request,
  provider: OAuthProvider,
  returnToValue: string | null,
) {
  const limited = await enforceRateLimit({
    request,
    scope: `auth.oauth.start.${provider}`,
    limit: 30,
    windowSeconds: 60 * 60,
  });
  if (limited) return limited;
  if (!oauthProviderReady(provider)) {
    return loginError(request, "That sign-in provider is not activated yet.", 503);
  }

  const config = readRuntimeAuthConfig();
  const requestUrl = new URL(request.url);
  const redirectUri = `${requestUrl.origin}/api/auth/oauth/${provider}/callback`;
  const state = randomBase64Url(32);
  const verifier = provider === "google" ? randomBase64Url(48) : null;
  const stateHash = await hashValue(state);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO oauth_states
        (id,provider,state_hash,code_verifier,return_to,expires_at,created_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      provider,
      stateHash,
      verifier,
      safeReturnPath(returnToValue, "/dashboard"),
      now + 10 * 60 * 1000,
      now,
    ),
    env.DB.prepare("DELETE FROM oauth_states WHERE expires_at<=?").bind(now),
  ]);

  let authorizationUrl: URL;
  if (provider === "google") {
    authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      client_id: config.googleClientId!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: await pkceChallenge(verifier!),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
  } else {
    authorizationUrl = new URL(
      `https://www.facebook.com/${config.facebookGraphVersion}/dialog/oauth`,
    );
    authorizationUrl.search = new URLSearchParams({
      client_id: config.facebookAppId!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "email",
      state,
    }).toString();
  }

  return redirectResponse(authorizationUrl, 302, [
    [
      "set-cookie",
      `kola_oauth_state=${state}; Path=/api/auth/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    ],
  ]);
}

export async function finishOAuth(
  request: Request,
  provider: OAuthProvider,
) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const stateCookie = readCookie(request.headers.get("cookie"), "kola_oauth_state");
  if (
    !state ||
    !code ||
    !stateCookie ||
    !constantTimeEqual(await hashValue(stateCookie), await hashValue(state)) ||
    !oauthProviderReady(provider)
  ) {
    return loginError(request, "The sign-in request is invalid or no longer available.");
  }

  const row = await env.DB.prepare(
    `SELECT id,code_verifier,return_to,expires_at
     FROM oauth_states WHERE provider=? AND state_hash=? LIMIT 1`,
  )
    .bind(provider, await hashValue(state))
    .first<{
      id: string;
      code_verifier: string | null;
      return_to: string;
      expires_at: number;
    }>();
  if (!row || row.expires_at <= Date.now()) {
    await recordSecurityEvent(request, {
      eventType: "auth.oauth.invalid_state",
      severity: "warning",
      metadata: { provider },
    });
    return loginError(request, "That sign-in request expired. Please try again.");
  }

  await env.DB.prepare("DELETE FROM oauth_states WHERE id=?").bind(row.id).run();

  try {
    const profile =
      provider === "google"
        ? await fetchGoogleProfile(request, code, row.code_verifier)
        : await fetchFacebookProfile(request, code);
    const identity = await resolveOAuthIdentity(provider, profile);
    const session = await createSession(identity.userId);
    await recordSecurityEvent(request, {
      eventType: "auth.login.success",
      userId: identity.userId,
      metadata: { provider },
    });
    const redirectTo = identity.onboardingComplete
      ? safeReturnPath(row.return_to, "/dashboard")
      : "/onboarding";
    return redirectResponse(new URL(redirectTo, url.origin), 302, [
      ["set-cookie", session.cookie],
      [
        "set-cookie",
        "kola_oauth_state=; Path=/api/auth/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      ],
    ]);
  } catch (error) {
    console.error("OAuth callback failed", provider, error);
    await recordSecurityEvent(request, {
      eventType: "auth.oauth.failed",
      severity: "warning",
      metadata: { provider },
    });
    return loginError(
      request,
      error instanceof Error ? error.message : "Sign-in could not be completed.",
    );
  }
}

async function fetchGoogleProfile(
  request: Request,
  code: string,
  verifier: string | null,
): Promise<OAuthProfile> {
  const config = readRuntimeAuthConfig();
  const redirectUri = `${new URL(request.url).origin}/api/auth/oauth/google/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId!,
      client_secret: config.googleClientSecret!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      ...(verifier ? { code_verifier: verifier } : {}),
    }),
  });
  const token = (await tokenResponse.json()) as {
    access_token?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !token.access_token) {
    throw new Error(token.error_description ?? "Google sign-in was declined.");
  }
  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  const user = (await userResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (!userResponse.ok || !user.sub || !user.email || !user.email_verified) {
    throw new Error("Google did not return a verified email address.");
  }
  return {
    id: user.sub,
    email: user.email.toLowerCase(),
    name: user.name?.trim() || user.email.split("@")[0],
    emailVerified: true,
  };
}

async function fetchFacebookProfile(
  request: Request,
  code: string,
): Promise<OAuthProfile> {
  const config = readRuntimeAuthConfig();
  const redirectUri = `${new URL(request.url).origin}/api/auth/oauth/facebook/callback`;
  const tokenUrl = new URL(
    `https://graph.facebook.com/${config.facebookGraphVersion}/oauth/access_token`,
  );
  tokenUrl.search = new URLSearchParams({
    client_id: config.facebookAppId!,
    client_secret: config.facebookAppSecret!,
    redirect_uri: redirectUri,
    code,
  }).toString();
  const tokenResponse = await fetch(tokenUrl);
  const token = (await tokenResponse.json()) as {
    access_token?: string;
    error?: { message?: string };
  };
  if (!tokenResponse.ok || !token.access_token) {
    throw new Error(token.error?.message ?? "Facebook sign-in was declined.");
  }
  const profileUrl = new URL(
    `https://graph.facebook.com/${config.facebookGraphVersion}/me`,
  );
  profileUrl.search = new URLSearchParams({
    fields: "id,name,email",
    access_token: token.access_token,
  }).toString();
  const profileResponse = await fetch(profileUrl);
  const profile = (await profileResponse.json()) as {
    id?: string;
    email?: string;
    name?: string;
    error?: { message?: string };
  };
  if (!profileResponse.ok || !profile.id || !profile.email) {
    throw new Error(
      profile.error?.message ??
        "Facebook must share an email address to create a Kola account.",
    );
  }
  return {
    id: profile.id,
    email: profile.email.toLowerCase(),
    name: profile.name?.trim() || profile.email.split("@")[0],
    emailVerified: false,
  };
}

async function resolveOAuthIdentity(provider: OAuthProvider, profile: OAuthProfile) {
  const existing = await env.DB.prepare(
    `SELECT ai.user_id,u.onboarding_complete
     FROM auth_identities ai JOIN users u ON u.id=ai.user_id
     WHERE ai.provider=? AND ai.provider_user_id=? LIMIT 1`,
  )
    .bind(provider, profile.id)
    .first<{ user_id: string; onboarding_complete: number }>();
  if (existing) {
    return {
      userId: existing.user_id,
      onboardingComplete: Boolean(existing.onboarding_complete),
    };
  }

  const emailOwner = await env.DB.prepare(
    "SELECT id,onboarding_complete FROM users WHERE lower(email)=? LIMIT 1",
  )
    .bind(profile.email)
    .first<{ id: string; onboarding_complete: number }>();
  if (emailOwner && !(provider === "google" && profile.emailVerified)) {
    throw new Error("Use your existing sign-in method, then link Facebook from Account.");
  }

  const userId = emailOwner?.id ?? `usr_${crypto.randomUUID()}`;
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  if (!emailOwner) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO users
          (id,email,display_name,active_role,language,onboarding_complete,created_at)
         VALUES (?,?,?,'customer','en',0,?)`,
      ).bind(userId, profile.email, profile.name.slice(0, 80), now),
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO auth_identities
        (id,user_id,provider,provider_user_id,created_at)
       VALUES (?,?,?,?,?)`,
    ).bind(crypto.randomUUID(), userId, provider, profile.id, now),
  );
  await env.DB.batch(statements);
  return {
    userId,
    onboardingComplete: Boolean(emailOwner?.onboarding_complete),
  };
}

function loginError(request: Request, message: string, status = 400) {
  const url = new URL("/login", request.url);
  url.searchParams.set("auth_error", message.slice(0, 180));
  return redirectResponse(url, 302, [
    ["x-auth-error-status", String(status)],
  ]);
}

function redirectResponse(
  destination: string | URL,
  status: 302 | 303,
  extraHeaders: Array<[string, string]> = [],
) {
  const headers = new Headers({
    "cache-control": "no-store",
    location: destination.toString(),
  });
  for (const [name, value] of extraHeaders) headers.append(name, value);
  return new Response(null, { status, headers });
}

function randomBase64Url(size: number) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function validGraphVersion(value: string | undefined) {
  return Boolean(value && /^v\d+\.\d+$/.test(value));
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

function constantTimeEqual(first: string, second: string) {
  if (first.length !== second.length) return false;
  let result = 0;
  for (let index = 0; index < first.length; index += 1) {
    result |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return result === 0;
}
