import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  phone: text("phone"),
  activeRole: text("active_role").notNull().default("customer"),
  language: text("language").notNull().default("en"),
  city: text("city"),
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
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
});

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  vendorId: text("vendor_id").notNull(),
  status: text("status").notNull().default("pending"),
  subtotal: integer("subtotal").notNull(),
  deliveryFee: integer("delivery_fee").notNull(),
  total: integer("total").notNull(),
  paymentMethod: text("payment_method").notNull(),
  paymentStatus: text("payment_status").notNull().default("pending"),
  deliveryAddress: text("delivery_address").notNull(),
  deliveryLat: real("delivery_lat"),
  deliveryLng: real("delivery_lng"),
  notes: text("notes").notNull().default(""),
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
  createdAt: integer("created_at").notNull(),
});

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
});
