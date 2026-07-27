CREATE TABLE `addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text DEFAULT 'Home' NOT NULL,
	`address` text NOT NULL,
	`city` text NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`latitude` real,
	`longitude` real,
	`is_default` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `courier_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`vehicle_type` text DEFAULT 'motorcycle' NOT NULL,
	`status` text DEFAULT 'offline' NOT NULL,
	`verification_status` text DEFAULT 'pending' NOT NULL,
	`rating` real DEFAULT 5 NOT NULL,
	`completed_deliveries` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `deliveries` ADD `tracking_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_tracking_token_unique` ON `deliveries` (`tracking_token`);--> statement-breakpoint
ALTER TABLE `users` ADD `city` text;--> statement-breakpoint
ALTER TABLE `users` ADD `onboarding_complete` integer DEFAULT false NOT NULL;