import { runtimeString } from "./security";

export type PaymentProvider = "mtn_momo" | "orange_money";

export type PaymentStartResult = {
  status: "pending_provider" | "redirect_required";
  providerReference: string;
  checkoutUrl?: string;
};

export function integrationReadiness() {
  return {
    cash: true,
    whatsapp: complete("AUTH_SESSION_SECRET", "WASENDER_API_KEY"),
    mtnMomo: complete(
      "MTN_MOMO_BASE_URL",
      "MTN_MOMO_SUBSCRIPTION_KEY",
      "MTN_MOMO_API_USER",
      "MTN_MOMO_API_KEY",
      "MTN_MOMO_TARGET_ENVIRONMENT",
    ),
    orangeMoney: complete(
      "ORANGE_MONEY_CLIENT_ID",
      "ORANGE_MONEY_CLIENT_SECRET",
      "ORANGE_MONEY_MERCHANT_KEY",
      "ORANGE_MONEY_TOKEN_URL",
      "ORANGE_MONEY_PAYMENT_URL",
    ),
    google: complete("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
    facebook:
      complete(
        "FACEBOOK_APP_ID",
        "FACEBOOK_APP_SECRET",
        "FACEBOOK_GRAPH_VERSION",
      ) && /^v\d+\.\d+$/.test(runtimeString("FACEBOOK_GRAPH_VERSION") ?? ""),
    push: complete("WEB_PUSH_PUBLIC_KEY", "WEB_PUSH_PRIVATE_KEY", "WEB_PUSH_SUBJECT"),
    maps: true,
    routeOptimization: complete("MAPS_API_KEY"),
  };
}

export async function startPayment({
  provider,
  orderId,
  amount,
  phone,
  origin,
}: {
  provider: PaymentProvider;
  orderId: string;
  amount: number;
  phone: string;
  origin: string;
}): Promise<PaymentStartResult> {
  if (provider === "mtn_momo") {
    return startMtnPayment({ orderId, amount, phone });
  }
  return startOrangePayment({ orderId, amount, phone, origin });
}

export async function fetchMtnPaymentStatus(reference: string) {
  const token = await mtnAccessToken();
  const response = await fetch(
    `${requiredUrl("MTN_MOMO_BASE_URL")}/collection/v1_0/requesttopay/${encodeURIComponent(reference)}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        "Ocp-Apim-Subscription-Key": required("MTN_MOMO_SUBSCRIPTION_KEY"),
        "X-Target-Environment": required("MTN_MOMO_TARGET_ENVIRONMENT"),
      },
    },
  );
  const body = (await response.json().catch(() => ({}))) as {
    status?: string;
    reason?: string;
  };
  if (!response.ok) throw new Error(body.reason ?? "MTN MoMo status check failed.");
  return {
    status: normalizeProviderStatus(body.status),
    rawStatus: String(body.status ?? "UNKNOWN"),
    reason: body.reason,
  };
}

async function startMtnPayment({
  orderId,
  amount,
  phone,
}: {
  orderId: string;
  amount: number;
  phone: string;
}): Promise<PaymentStartResult> {
  const token = await mtnAccessToken();
  const reference = crypto.randomUUID();
  const response = await fetch(
    `${requiredUrl("MTN_MOMO_BASE_URL")}/collection/v1_0/requesttopay`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "Ocp-Apim-Subscription-Key": required("MTN_MOMO_SUBSCRIPTION_KEY"),
        "X-Reference-Id": reference,
        "X-Target-Environment": required("MTN_MOMO_TARGET_ENVIRONMENT"),
        ...(runtimeString("MTN_MOMO_CALLBACK_URL")
          ? { "X-Callback-Url": runtimeString("MTN_MOMO_CALLBACK_URL")! }
          : {}),
      },
      body: JSON.stringify({
        amount: String(Math.round(amount)),
        currency: runtimeString("MTN_MOMO_CURRENCY") ?? "XAF",
        externalId: orderId,
        payer: {
          partyIdType: "MSISDN",
          partyId: normalizeProviderPhone(phone),
        },
        payerMessage: `Kola order ${orderId}`,
        payeeNote: `Payment for ${orderId}`,
      }),
    },
  );
  if (response.status !== 202) {
    throw new Error(await providerError(response, "MTN MoMo rejected the request."));
  }
  return { status: "pending_provider", providerReference: reference };
}

async function mtnAccessToken() {
  const credentials = btoa(
    `${required("MTN_MOMO_API_USER")}:${required("MTN_MOMO_API_KEY")}`,
  );
  const response = await fetch(
    `${requiredUrl("MTN_MOMO_BASE_URL")}/collection/token/`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${credentials}`,
        "Ocp-Apim-Subscription-Key": required("MTN_MOMO_SUBSCRIPTION_KEY"),
      },
    },
  );
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new Error("MTN MoMo authentication failed.");
  }
  return body.access_token;
}

async function startOrangePayment({
  orderId,
  amount,
  phone,
  origin,
}: {
  orderId: string;
  amount: number;
  phone: string;
  origin: string;
}): Promise<PaymentStartResult> {
  const credentials = btoa(
    `${required("ORANGE_MONEY_CLIENT_ID")}:${required("ORANGE_MONEY_CLIENT_SECRET")}`,
  );
  const tokenResponse = await fetch(requiredUrl("ORANGE_MONEY_TOKEN_URL"), {
    method: "POST",
    headers: {
      authorization: `Basic ${credentials}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  const tokenBody = (await tokenResponse.json().catch(() => ({}))) as {
    access_token?: string;
  };
  if (!tokenResponse.ok || !tokenBody.access_token) {
    throw new Error("Orange Money authentication failed.");
  }

  const reference = crypto.randomUUID();
  const paymentResponse = await fetch(requiredUrl("ORANGE_MONEY_PAYMENT_URL"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${tokenBody.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      merchant_key: required("ORANGE_MONEY_MERCHANT_KEY"),
      currency: runtimeString("ORANGE_MONEY_CURRENCY") ?? "XAF",
      order_id: orderId,
      amount: Math.round(amount),
      return_url: `${origin}/dashboard?payment=returned`,
      cancel_url: `${origin}/dashboard?payment=cancelled`,
      notif_url: runtimeString("ORANGE_MONEY_NOTIFICATION_URL"),
      lang: "en",
      reference,
      customer_phone: normalizeProviderPhone(phone),
    }),
  });
  const paymentBody = (await paymentResponse.json().catch(() => ({}))) as {
    payment_url?: string;
    paymentUrl?: string;
    pay_token?: string;
    token?: string;
    message?: string;
  };
  if (!paymentResponse.ok) {
    throw new Error(paymentBody.message ?? "Orange Money rejected the request.");
  }
  const checkoutUrl = paymentBody.payment_url ?? paymentBody.paymentUrl;
  return {
    status: checkoutUrl ? "redirect_required" : "pending_provider",
    providerReference: paymentBody.pay_token ?? paymentBody.token ?? reference,
    checkoutUrl,
  };
}

function normalizeProviderPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 9) digits = `237${digits}`;
  return digits;
}

function normalizeProviderStatus(value: string | undefined) {
  switch (String(value ?? "").toUpperCase()) {
    case "SUCCESSFUL":
      return "paid";
    case "FAILED":
      return "failed";
    case "REJECTED":
      return "rejected";
    case "CANCELLED":
      return "cancelled";
    default:
      return "pending_provider";
  }
}

function complete(...names: string[]) {
  return names.every((name) => Boolean(runtimeString(name)));
}

function required(name: string) {
  const value = runtimeString(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function requiredUrl(name: string) {
  const value = required(name).replace(/\/+$/, "");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS.`);
  return url.toString().replace(/\/+$/, "");
}

async function providerError(response: Response, fallback: string) {
  const text = (await response.text()).slice(0, 500);
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as { message?: string; reason?: string };
    return parsed.message ?? parsed.reason ?? fallback;
  } catch {
    return fallback;
  }
}
