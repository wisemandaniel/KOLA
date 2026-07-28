import { runtimeString } from "./security";

export type PaymentStartResult = {
  status: "redirect_required";
  providerReference: string;
  checkoutUrl: string;
};

export type FapshiStatus = {
  status: "pending_provider" | "paid" | "failed" | "expired";
  externalId?: string;
  amount?: number;
  reason?: string;
  medium?: string;
};

type FapshiPaymentResponse = {
  message?: string;
  link?: string;
  transId?: string;
  dateInitiated?: string;
};

type FapshiStatusResponse = {
  transId?: string;
  status?: string;
  amount?: number;
  externalId?: string;
  reason?: string;
  medium?: string;
  message?: string;
};

export function integrationReadiness() {
  return {
    cash: true,
    whatsapp: complete("AUTH_SESSION_SECRET", "WASENDER_API_KEY"),
    fapshi: complete("FAPSHI_API_USER", "FAPSHI_API_KEY"),
    push: complete("WEB_PUSH_PUBLIC_KEY", "WEB_PUSH_PRIVATE_KEY", "WEB_PUSH_SUBJECT"),
    maps: true,
    routeOptimization: complete("MAPS_API_KEY"),
  };
}

export async function startPayment({
  orderId,
  amount,
  userId,
  email,
  origin,
}: {
  orderId: string;
  amount: number;
  userId: string;
  email?: string;
  origin: string;
}): Promise<PaymentStartResult> {
  if (!Number.isInteger(amount) || amount < 100) {
    throw new Error("Fapshi payments must be at least 100 FCFA.");
  }
  const response = await fetch(`${fapshiBaseUrl()}/initiate-pay`, {
    method: "POST",
    headers: fapshiHeaders(true),
    body: JSON.stringify({
      amount,
      ...(email ? { email } : {}),
      redirectUrl: `${origin}/dashboard?payment=returned`,
      userId: safePaymentReference(userId),
      externalId: safePaymentReference(orderId),
      message: `Kola order ${orderId}`,
    }),
  });
  const result = (await response.json().catch(() => ({}))) as FapshiPaymentResponse;
  if (!response.ok || !result.link || !result.transId) {
    throw new Error(result.message ?? "Fapshi could not start this payment.");
  }
  const checkoutUrl = new URL(result.link);
  if (checkoutUrl.protocol !== "https:" || !checkoutUrl.hostname.endsWith("fapshi.com")) {
    throw new Error("Fapshi returned an invalid checkout URL.");
  }
  return {
    status: "redirect_required",
    providerReference: result.transId,
    checkoutUrl: checkoutUrl.toString(),
  };
}

export async function fetchFapshiPaymentStatus(
  transactionId: string,
): Promise<FapshiStatus> {
  if (!/^[a-zA-Z0-9_-]{3,100}$/.test(transactionId)) {
    throw new Error("Invalid Fapshi transaction reference.");
  }
  const response = await fetch(
    `${fapshiBaseUrl()}/payment-status/${encodeURIComponent(transactionId)}`,
    { headers: fapshiHeaders(false) },
  );
  const result = (await response.json().catch(() => ({}))) as FapshiStatusResponse;
  if (!response.ok || !result.status) {
    throw new Error(result.message ?? "Fapshi payment status is unavailable.");
  }
  return {
    status: normalizeFapshiStatus(result.status),
    externalId: result.externalId,
    amount: result.amount == null ? undefined : Number(result.amount),
    reason: result.reason,
    medium: result.medium,
  };
}

function fapshiHeaders(json: boolean) {
  return {
    apiuser: required("FAPSHI_API_USER"),
    apikey: required("FAPSHI_API_KEY"),
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

function fapshiBaseUrl() {
  const configured = runtimeString("FAPSHI_BASE_URL") ?? "https://live.fapshi.com";
  const url = new URL(configured);
  if (
    url.protocol !== "https:" ||
    !["live.fapshi.com", "sandbox.fapshi.com"].includes(url.hostname)
  ) {
    throw new Error("FAPSHI_BASE_URL must use an official Fapshi environment.");
  }
  return url.origin;
}

export function normalizeFapshiStatus(
  value: string,
): FapshiStatus["status"] {
  switch (value.toUpperCase()) {
    case "SUCCESSFUL":
      return "paid";
    case "FAILED":
      return "failed";
    case "EXPIRED":
      return "expired";
    default:
      return "pending_provider";
  }
}

export function safePaymentReference(value: string) {
  const result = value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
  if (!result) throw new Error("Payment reference is invalid.");
  return result;
}

function complete(...names: string[]) {
  return names.every((name) => Boolean(runtimeString(name)));
}

function required(name: string) {
  const value = runtimeString(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
