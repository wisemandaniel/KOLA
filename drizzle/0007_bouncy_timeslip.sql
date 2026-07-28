CREATE TABLE `chat_presence` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`user_id` text NOT NULL,
	`last_typed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_presence_order_user_unique` ON `chat_presence` (`order_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `chat_presence_order_typed_idx` ON `chat_presence` (`order_id`,`last_typed_at`);