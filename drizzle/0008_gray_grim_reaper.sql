CREATE TABLE `idempotency_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`request_key` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`response_json` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_user_scope_key_unique` ON `idempotency_records` (`user_id`,`scope`,`request_key`);--> statement-breakpoint
CREATE INDEX `idempotency_expires_idx` ON `idempotency_records` (`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`state_hash` text NOT NULL,
	`code_verifier` text,
	`return_to` text DEFAULT '/dashboard' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_state_hash_unique` ON `oauth_states` (`state_hash`);--> statement-breakpoint
CREATE INDEX `oauth_state_expires_idx` ON `oauth_states` (`expires_at`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscription_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscription_user_idx` ON `push_subscriptions` (`user_id`,`active`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`subject_hash` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`window_start` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_scope_subject_window_unique` ON `rate_limits` (`scope`,`subject_hash`,`window_start`);--> statement-breakpoint
CREATE INDEX `rate_limit_expires_idx` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`event_type` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`ip_hash` text,
	`user_agent` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `security_event_created_idx` ON `security_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `security_event_user_idx` ON `security_events` (`user_id`,`created_at`);