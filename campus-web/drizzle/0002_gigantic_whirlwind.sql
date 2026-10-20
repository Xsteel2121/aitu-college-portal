CREATE TABLE `homework_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`homework_id` text,
	`author_id` text NOT NULL,
	`name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`storage_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`homework_id`) REFERENCES `homework`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attachments_homework` ON `homework_attachments` (`homework_id`);--> statement-breakpoint
CREATE INDEX `attachments_author_created` ON `homework_attachments` (`author_id`,`created_at`);