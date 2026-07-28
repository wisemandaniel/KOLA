CREATE TABLE `message_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`delivered_at` integer NOT NULL,
	`read_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_receipt_message_user_unique` ON `message_receipts` (`message_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `message_receipt_message_idx` ON `message_receipts` (`message_id`);