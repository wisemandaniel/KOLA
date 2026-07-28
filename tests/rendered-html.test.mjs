import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ships Kola product metadata without starter or ChatGPT sign-in remnants", async () => {
  const [layout, landing, login, favicon] = await Promise.all([
    source("app/layout.tsx"),
    source("app/page.tsx"),
    source("app/login/LoginClient.tsx"),
    source("app/favicon.ico/route.ts"),
  ]);

  assert.match(layout, /Kola/);
  assert.match(landing, /Cameroon/i);
  assert.match(login, /WhatsApp/i);
  assert.doesNotMatch(login, /Google|Facebook/i);
  assert.doesNotMatch(`${layout}\n${landing}\n${login}`, /codex-preview/i);
  assert.doesNotMatch(`${layout}\n${landing}\n${login}`, /sign in with ChatGPT/i);
  assert.match(favicon, /favicon\.svg/);
  assert.match(favicon, /status: 308/);
});

test("protects WhatsApp-only verification and persistent sessions", async () => {
  const [requestRoute, verifyRoute, logoutRoute, auth] = await Promise.all([
    source("app/api/auth/whatsapp/request/route.ts"),
    source("app/api/auth/whatsapp/verify/route.ts"),
    source("app/api/auth/logout/route.ts"),
    source("app/auth.ts"),
  ]);

  assert.match(requestRoute, /MAX_REQUESTS_PER_WINDOW/);
  assert.match(requestRoute, /waSenderApiKey/);
  assert.match(requestRoute, /hashValue/);
  assert.match(verifyRoute, /MAX_ATTEMPTS/);
  assert.match(verifyRoute, /createSession/);
  assert.match(auth, /auth_sessions/);
  assert.match(auth, /HttpOnly/);
  assert.match(auth, /SameSite=Lax/);
  assert.match(auth, /safeReturnPath/);
  assert.match(auth, /KOLA_SUPERADMIN_PHONE/);
  assert.match(logoutRoute, /new Response\(null/);
  assert.doesNotMatch(`${requestRoute}\n${verifyRoute}\n${auth}`, /GOOGLE_CLIENT|FACEBOOK_APP/);
});

test("hardens checkout, uploads, tracking, Fapshi payments and administration", async () => {
  const [workspace, fileSecurity, tracking, integrations, webhook, platform, migration] =
    await Promise.all([
      source("app/api/workspace/route.ts"),
      source("app/file-security.ts"),
      source("app/api/track/[orderId]/route.ts"),
      source("app/integrations.ts"),
      source("app/api/payments/fapshi/webhook/route.ts"),
      source("app/api/platform/route.ts"),
      source("drizzle/0009_married_ultragirl.sql"),
    ]);

  assert.match(workspace, /idempotency_records/);
  assert.match(workspace, /stock=stock-\?/);
  assert.match(workspace, /rejectCrossSiteMutation/);
  assert.match(fileSecurity, /%PDF-/);
  assert.match(tracking, /tracking_token = \?/);
  assert.doesNotMatch(tracking, /orderId === "KL-2084"/);
  assert.match(integrations, /\/initiate-pay/);
  assert.match(integrations, /\/payment-status\//);
  assert.match(integrations, /apiuser/);
  assert.match(integrations, /live\.fapshi\.com/);
  assert.match(webhook, /fetchFapshiPaymentStatus/);
  assert.match(webhook, /Payment reconciliation mismatch/);
  assert.match(platform, /admin_user_role/);
  assert.match(platform, /admin_user_status/);
  assert.match(platform, /admin_vendor_status/);
  assert.match(platform, /admin_payment_status/);
  assert.match(migration, /admin_level/);
  assert.match(migration, /account_status/);
  assert.match(migration, /superadmin/);
  assert.match(migration, /DELETE FROM `oauth_states`/);
});

test("implements private, optimistic rich order messaging", async () => {
  const [messagesRoute, uploadRoute, mediaRoute, chat] = await Promise.all([
    source("app/api/messages/route.ts"),
    source("app/api/messages/upload/route.ts"),
    source("app/api/media/[messageId]/route.ts"),
    source("app/dashboard/OrderChat.tsx"),
  ]);

  assert.match(messagesRoute, /canAccessOrder/);
  assert.match(messagesRoute, /message_receipts/);
  assert.match(messagesRoute, /delivery_status/);
  assert.match(messagesRoute, /clientMessageId/);
  assert.match(uploadRoute, /MEDIA/);
  assert.match(uploadRoute, /MAX_IMAGE_BYTES/);
  assert.match(uploadRoute, /MAX_AUDIO_BYTES/);
  assert.match(mediaRoute, /canAccessOrder/);
  assert.match(chat, /XMLHttpRequest/);
  assert.match(chat, /wa-upload-progress/);
  assert.match(chat, /retryMessage/);
  assert.match(chat, /VoiceNote/);
  assert.match(chat, /MessageStatus/);
});

test("packages the required database and private media bindings", async () => {
  const [hosting, migration, schema] = await Promise.all([
    source(".openai/hosting.json"),
    source("drizzle/0005_abandoned_ultragirl.sql"),
    source("db/schema.ts"),
  ]);

  assert.match(hosting, /"d1":\s*"DB"/);
  assert.match(hosting, /"r2":\s*"MEDIA"/);
  assert.match(migration, /CREATE TABLE `message_receipts`/);
  assert.match(migration, /message_receipt_message_user_unique/);
  assert.match(schema, /export const messageReceipts/);
});
