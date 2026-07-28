import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  phone: text("phone"),
  activeRole: text("active_role").notNull().default("customer"),
  language: text("language").notNull().default("en"),
  city: text("city"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  notificationPreferences: text("notification_preferences").notNull().default("all"),
  onboardingComplete: integer("onboarding_complete", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const authIdentities = sqliteTable("auth_identities", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  providerUserId: text("provider_user_id").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("auth_identity_provider_user_unique").on(table.provider, table.providerUserId),
  index("auth_identity_user_idx").on(table.userId),
]);

export const authChallenges = sqliteTable("auth_challenges", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: integer("consumed_at"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("auth_challenge_phone_created_idx").on(table.phone, table.createdAt),
]);

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("auth_session_token_unique").on(table.tokenHash),
  index("auth_session_user_idx").on(table.userId),
]);

export const oauthStates = sqliteTable("oauth_states", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  stateHash: text("state_hash").notNull(),
  codeVerifier: text("code_verifier"),
  returnTo: text("return_to").notNull().default("/dashboard"),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("oauth_state_hash_unique").on(table.stateHash),
  index("oauth_state_expires_idx").on(table.expiresAt),
]);

export const rateLimits = sqliteTable("rate_limits", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  subjectHash: text("subject_hash").notNull(),
  count: integer("count").notNull().default(1),
  windowStart: integer("window_start").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [
  uniqueIndex("rate_limit_scope_subject_window_unique").on(
    table.scope,
    table.subjectHash,
    table.windowStart,
  ),
  index("rate_limit_expires_idx").on(table.expiresAt),
]);

export const securityEvents = sqliteTable("security_events", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  eventType: text("event_type").notNull(),
  severity: text("severity").notNull().default("info"),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("security_event_created_idx").on(table.createdAt),
  index("security_event_user_idx").on(table.userId, table.createdAt),
]);

export const idempotencyRecords = sqliteTable("idempotency_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  scope: text("scope").notNull(),
  requestKey: text("request_key").notNull(),
  status: text("status").notNull().default("processing"),
  responseJson: text("response_json"),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idempotency_user_scope_key_unique").on(
    table.userId,
    table.scope,
    table.requestKey,
  ),
  index("idempotency_expires_idx").on(table.expiresAt),
]);

export const addresses = sqliteTable("addresses", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  label: text("label").notNull().default("Home"),
  address: text("address").notNull(),
  city: text("city").notNull(),
  instructions: text("instructions").notNull().default(""),
  latitude: real("latitude"),
  longitude: real("longitude"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
});

export const courierProfiles = sqliteTable("courier_profiles", {
  userId: text("user_id").primaryKey(),
  vehicleType: text("vehicle_type").notNull().default("motorcycle"),
  status: text("status").notNull().default("offline"),
  verificationStatus: text("verification_status").notNull().default("pending"),
  rating: real("rating").notNull().default(5),
  completedDeliveries: integer("completed_deliveries").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const vendors = sqliteTable("vendors", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  status: text("status").notNull().default("active"),
  rating: real("rating").notNull().default(5),
  createdAt: integer("created_at").notNull(),
});

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  vendorId: text("vendor_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull(),
  price: integer("price").notNull(),
  stock: integer("stock").notNull().default(0),
  emoji: text("emoji").notNull().default("📦"),
  imageKey: text("image_key"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at"),
});

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  vendorId: text("vendor_id").notNull(),
  status: text("status").notNull().default("pending"),
  subtotal: integer("subtotal").notNull(),
  discount: integer("discount").notNull().default(0),
  promotionCode: text("promotion_code"),
  deliveryFee: integer("delivery_fee").notNull(),
  total: integer("total").notNull(),
  paymentMethod: text("payment_method").notNull(),
  paymentStatus: text("payment_status").notNull().default("pending"),
  deliveryAddress: text("delivery_address").notNull(),
  deliveryLat: real("delivery_lat"),
  deliveryLng: real("delivery_lng"),
  notes: text("notes").notNull().default(""),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: integer("cancelled_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const orderItems = sqliteTable("order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  productId: text("product_id").notNull(),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
});

export const deliveries = sqliteTable("deliveries", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().unique(),
  trackingToken: text("tracking_token").unique(),
  courierId: text("courier_id"),
  status: text("status").notNull().default("unassigned"),
  pickupAddress: text("pickup_address").notNull(),
  dropoffAddress: text("dropoff_address").notNull(),
  distanceKm: real("distance_km").notNull().default(0),
  courierFee: integer("courier_fee").notNull(),
  pickupCode: text("pickup_code").notNull(),
  deliveryCode: text("delivery_code").notNull(),
  estimatedArrival: integer("estimated_arrival"),
  acceptedAt: integer("accepted_at"),
  pickedUpAt: integer("picked_up_at"),
  deliveredAt: integer("delivered_at"),
  currentLat: real("current_lat"),
  currentLng: real("current_lng"),
  locationUpdatedAt: integer("location_updated_at"),
});

export const trackingEvents = sqliteTable("tracking_events", {
  id: text("id").primaryKey(),
  deliveryId: text("delivery_id").notNull(),
  eventType: text("event_type").notNull(),
  label: text("label").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  createdAt: integer("created_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  senderId: text("sender_id").notNull(),
  senderName: text("sender_name").notNull(),
  senderRole: text("sender_role").notNull(),
  body: text("body").notNull(),
  messageType: text("message_type").notNull().default("text"),
  mediaKey: text("media_key"),
  mediaType: text("media_type"),
  mediaSize: integer("media_size"),
  durationMs: integer("duration_ms"),
  createdAt: integer("created_at").notNull(),
});

export const messageReceipts = sqliteTable("message_receipts", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull(),
  userId: text("user_id").notNull(),
  deliveredAt: integer("delivered_at").notNull(),
  readAt: integer("read_at"),
}, (table) => [
  uniqueIndex("message_receipt_message_user_unique").on(table.messageId, table.userId),
  index("message_receipt_message_idx").on(table.messageId),
]);

export const chatPresence = sqliteTable("chat_presence", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  userId: text("user_id").notNull(),
  lastTypedAt: integer("last_typed_at").notNull(),
}, (table) => [
  uniqueIndex("chat_presence_order_user_unique").on(table.orderId, table.userId),
  index("chat_presence_order_typed_idx").on(table.orderId, table.lastTypedAt),
]);

export const voiceCalls = sqliteTable("voice_calls", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  initiatorId: text("initiator_id").notNull(),
  initiatorName: text("initiator_name").notNull(),
  answeredBy: text("answered_by"),
  status: text("status").notNull().default("ringing"),
  offerSdp: text("offer_sdp").notNull(),
  answerSdp: text("answer_sdp"),
  createdAt: integer("created_at").notNull(),
  answeredAt: integer("answered_at"),
  endedAt: integer("ended_at"),
}, (table) => [
  index("voice_call_order_created_idx").on(table.orderId, table.createdAt),
  index("voice_call_status_idx").on(table.status),
]);

export const voiceCallCandidates = sqliteTable("voice_call_candidates", {
  id: text("id").primaryKey(),
  callId: text("call_id").notNull(),
  userId: text("user_id").notNull(),
  candidate: text("candidate").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("voice_call_candidate_call_idx").on(table.callId, table.createdAt),
]);

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  provider: text("provider").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("pending"),
  providerReference: text("provider_reference"),
  createdAt: integer("created_at").notNull(),
});

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  authorId: text("author_id").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment").notNull().default(""),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("review_order_author_subject_unique").on(
    table.orderId,
    table.authorId,
    table.subjectType,
  ),
]);

export const promotions = sqliteTable("promotions", {
  id: text("id").primaryKey(),
  vendorId: text("vendor_id").notNull(),
  code: text("code").notNull(),
  discountType: text("discount_type").notNull().default("percentage"),
  discountValue: integer("discount_value").notNull(),
  minimumOrder: integer("minimum_order").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  startsAt: integer("starts_at").notNull(),
  endsAt: integer("ends_at"),
  usageLimit: integer("usage_limit"),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("promotion_vendor_code_unique").on(table.vendorId, table.code),
  index("promotion_code_active_idx").on(table.code, table.active),
]);

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  href: text("href"),
  readAt: integer("read_at"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("notification_user_created_idx").on(table.userId, table.createdAt),
]);

export const supportTickets = sqliteTable("support_tickets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  orderId: text("order_id"),
  category: text("category").notNull(),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("open"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("support_ticket_user_created_idx").on(table.userId, table.createdAt),
  index("support_ticket_status_idx").on(table.status),
]);

export const supportMessages = sqliteTable("support_messages", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  senderId: text("sender_id").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("support_message_ticket_idx").on(table.ticketId, table.createdAt),
]);

export const paymentAttempts = sqliteTable("payment_attempts", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  phone: text("phone"),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("pending"),
  providerReference: text("provider_reference"),
  failureReason: text("failure_reason"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("payment_attempt_order_idx").on(table.orderId, table.createdAt),
  index("payment_attempt_user_idx").on(table.userId, table.createdAt),
]);

export const courierVerificationRequests = sqliteTable("courier_verification_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  documentType: text("document_type").notNull(),
  documentKey: text("document_key").notNull(),
  status: text("status").notNull().default("submitted"),
  reviewNote: text("review_note"),
  createdAt: integer("created_at").notNull(),
  reviewedAt: integer("reviewed_at"),
}, (table) => [
  index("courier_verification_user_idx").on(table.userId, table.createdAt),
]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("audit_log_created_idx").on(table.createdAt),
]);

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("push_subscription_endpoint_unique").on(table.endpoint),
  index("push_subscription_user_idx").on(table.userId, table.active),
]);
