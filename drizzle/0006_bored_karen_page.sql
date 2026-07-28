CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `courier_verification_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`document_type` text NOT NULL,
	`document_key` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`review_note` text,
	`created_at` integer NOT NULL,
	`reviewed_at` integer
);
--> statement-breakpoint
CREATE INDEX `courier_verification_user_idx` ON `courier_verification_requests` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`href` text,
	`read_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_user_created_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`phone` text,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_reference` text,
	`failure_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payment_attempt_order_idx` ON `payment_attempts` (`order_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payment_attempt_user_idx` ON `payment_attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `promotions` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_id` text NOT NULL,
	`code` text NOT NULL,
	`discount_type` text DEFAULT 'percentage' NOT NULL,
	`discount_value` integer NOT NULL,
	`minimum_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`usage_limit` integer,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_vendor_code_unique` ON `promotions` (`vendor_id`,`code`);--> statement-breakpoint
CREATE INDEX `promotion_code_active_idx` ON `promotions` (`code`,`active`);--> statement-breakpoint
CREATE TABLE `support_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_message_ticket_idx` ON `support_messages` (`ticket_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`order_id` text,
	`category` text NOT NULL,
	`subject` text NOT NULL,
	`description` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_ticket_user_created_idx` ON `support_tickets` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `support_ticket_status_idx` ON `support_tickets` (`status`);--> statement-breakpoint
ALTER TABLE `orders` ADD `discount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `promotion_code` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `cancellation_reason` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `cancelled_at` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `image_key` text;--> statement-breakpoint
ALTER TABLE `products` ADD `updated_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `is_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `notification_preferences` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
DELETE FROM `reviews`
WHERE `rowid` NOT IN (
  SELECT MIN(`rowid`) FROM `reviews`
  GROUP BY `order_id`,`author_id`,`subject_type`
);--> statement-breakpoint
CREATE UNIQUE INDEX `review_order_author_subject_unique` ON `reviews` (`order_id`,`author_id`,`subject_type`);
