CREATE TABLE `terms` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`startDate` text NOT NULL,
	`endDate` text NOT NULL,
	`totalWeeks` integer DEFAULT 20 NOT NULL,
	`isCurrent` integer DEFAULT false NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `terms_start_idx` ON `terms` (`startDate`);