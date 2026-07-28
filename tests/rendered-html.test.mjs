import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ships Kola product metadata without starter or ChatGPT sign-in remnants", async () => {
  const [layout, landing, login] = await Promise.all([
    source("app/layout.tsx"),
    source("app/page.tsx"),
    source("app/login/LoginClient.tsx"),
  ]);

  assert.match(layout, /Kola/);
  assert.match(landing, /Cameroon/i);
  assert.match(login, /WhatsApp/i);
  assert.doesNotMatch(`${layout}\n${landing}\n${login}`, /codex-preview/i);
  assert.doesNotMatch(`${layout}\n${landing}\n${login}`, /sign in with ChatGPT/i);
});

test("protects WhatsApp verification and persistent sessions", async () => {
  const [requestRoute, verifyRoute, auth] = await Promise.all([
    source("app/api/auth/whatsapp/request/route.ts"),
    source("app/api/auth/whatsapp/verify/route.ts"),
    source("app/auth.ts"),
  ]);

  assert.match(requestRoute, /MAX_REQUESTS_PER_WINDOW/);
  assert.match(requestRoute, /waSenderApiKey/);
  assert.match(requestRoute, /hashValue/);
  assert.match(verifyRoute, /MAX_ATTEMPTS/);
  assert.match(verifyRoute, /auth_sessions/);
  assert.match(verifyRoute, /HttpOnly/);
  assert.match(verifyRoute, /SameSite=Lax/);
  assert.match(auth, /safeReturnPath/);
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
