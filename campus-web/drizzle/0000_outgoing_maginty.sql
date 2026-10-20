CREATE TABLE `notification_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `homework` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`assigned_date` text NOT NULL,
	`created_at` integer NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`done_at` integer
);
--> statement-breakpoint
CREATE INDEX `homework_group_date` ON `homework` (`group_id`,`assigned_date`);--> statement-breakpoint
CREATE INDEX `homework_author_created` ON `homework` (`author_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`next_attempt` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `outbox_status_next` ON `notification_outbox` (`status`,`next_attempt`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`group_id` text NOT NULL,
	`subscription` text NOT NULL,
	`lessons` integer DEFAULT 1 NOT NULL,
	`digest` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subscriptions_actor` ON `subscriptions` (`actor_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_group_active` ON `subscriptions` (`group_id`,`active`);