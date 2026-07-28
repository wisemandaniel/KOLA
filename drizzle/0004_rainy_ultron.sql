CREATE TABLE `voice_call_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`user_id` text NOT NULL,
	`candidate` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `voice_call_candidate_call_idx` ON `voice_call_candidates` (`call_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `voice_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`initiator_id` text NOT NULL,
	`initiator_name` text NOT NULL,
	`answered_by` text,
	`status` text DEFAULT 'ringing' NOT NULL,
	`offer_sdp` text NOT NULL,
	`answer_sdp` text,
	`created_at` integer NOT NULL,
	`answered_at` integer,
	`ended_at` integer
);
--> statement-breakpoint
CREATE INDEX `voice_call_order_created_idx` ON `voice_calls` (`order_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `voice_call_status_idx` ON `voice_calls` (`status`);--> statement-breakpoint
ALTER TABLE `messages` ADD `media_key` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `media_type` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `media_size` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `duration_ms` integer;