CREATE TABLE `access_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`window` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `moderation_log` (
	`id` text PRIMARY KEY NOT NULL,
	`homework_id` text NOT NULL,
	`group_id` text NOT NULL,
	`moderator_hash` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `moderator_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`code_version` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `homework` ADD `status` text DEFAULT 'approved' NOT NULL;