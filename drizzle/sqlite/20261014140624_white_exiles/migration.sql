CREATE TABLE `schedule_exceptions` (
	`id` text PRIMARY KEY,
	`scheduleId` text NOT NULL,
	`originalDate` text NOT NULL,
	`action` text NOT NULL,
	`targetDate` text,
	`targetStartPeriod` integer,
	`targetEndPeriod` integer,
	`targetRoom` text,
	`teacherId` text,
	`reason` text,
	`createdBy` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sched_exc_uniq` ON `schedule_exceptions` (`scheduleId`,`originalDate`,`action`);--> statement-breakpoint
CREATE INDEX `sched_exc_date_idx` ON `schedule_exceptions` (`originalDate`);--> statement-breakpoint
CREATE INDEX `sched_exc_target_date_idx` ON `schedule_exceptions` (`targetDate`);