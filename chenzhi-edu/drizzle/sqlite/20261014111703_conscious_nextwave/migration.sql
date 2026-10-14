CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY,
	`role` text DEFAULT 'viewer' NOT NULL,
	`realName` text,
	`phone` text,
	`teacherId` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
