ALTER TABLE `users` ADD `admin_level` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `account_status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
UPDATE `users`
SET `admin_level` = 'superadmin', `active_role` = 'superadmin'
WHERE `is_admin` = 1;
--> statement-breakpoint
DELETE FROM `auth_sessions`
WHERE `user_id` IN (
  SELECT `user_id` FROM `auth_identities`
  WHERE `provider` IN ('google', 'facebook')
);
--> statement-breakpoint
DELETE FROM `auth_identities`
WHERE `provider` IN ('google', 'facebook');
--> statement-breakpoint
DELETE FROM `oauth_states`;
