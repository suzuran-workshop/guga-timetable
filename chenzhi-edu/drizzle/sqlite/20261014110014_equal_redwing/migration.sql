CREATE TABLE `attendance` (
	`id` text PRIMARY KEY,
	`scheduleId` text NOT NULL,
	`studentId` text NOT NULL,
	`lessonDate` text NOT NULL,
	`status` text DEFAULT 'present' NOT NULL,
	`consumedLessons` integer DEFAULT 1 NOT NULL,
	`remark` text,
	`markedBy` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth2_identity_links` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_sub` text NOT NULL,
	`raw_profile` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `passwords` (
	`user_id` text PRIMARY KEY,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`token_hash` text PRIMARY KEY,
	`family_id` text NOT NULL,
	`sid` text NOT NULL,
	`sub` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`profile` text
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`username` text,
	`nickname` text,
	`avatar_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webauthn_credentials` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text,
	`display_name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `class_members` (
	`id` text PRIMARY KEY,
	`classId` text NOT NULL,
	`studentId` text NOT NULL,
	`joinedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`courseId` text NOT NULL,
	`teacherId` text,
	`room` text,
	`capacity` integer DEFAULT 30 NOT NULL,
	`startDate` text,
	`status` text DEFAULT 'recruiting' NOT NULL,
	`remark` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`subject` text,
	`creditHours` integer DEFAULT 0 NOT NULL,
	`totalLessons` integer DEFAULT 0 NOT NULL,
	`pricePerLesson` integer DEFAULT 0 NOT NULL,
	`colorIndex` integer DEFAULT 1 NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY,
	`objectKey` text NOT NULL,
	`fileName` text NOT NULL,
	`contentType` text,
	`size` integer DEFAULT 0 NOT NULL,
	`ns` text NOT NULL,
	`uploadedBy` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `grades` (
	`id` text PRIMARY KEY,
	`studentId` text NOT NULL,
	`classId` text,
	`examName` text NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`fullScore` integer DEFAULT 100 NOT NULL,
	`examDate` text NOT NULL,
	`remark` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `license_state` (
	`id` text PRIMARY KEY,
	`license_id` text,
	`instance_key` text NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY,
	`orderNo` text NOT NULL,
	`studentId` text NOT NULL,
	`courseId` text NOT NULL,
	`lessonsPurchased` integer NOT NULL,
	`amount` integer NOT NULL,
	`payMethod` text DEFAULT 'wechat' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`paidAt` text,
	`remark` text,
	`createdBy` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY,
	`classId` text NOT NULL,
	`weekday` integer NOT NULL,
	`startPeriod` integer NOT NULL,
	`endPeriod` integer NOT NULL,
	`weekStart` integer DEFAULT 1 NOT NULL,
	`weekEnd` integer DEFAULT 20 NOT NULL,
	`room` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`studentNo` text NOT NULL,
	`phone` text,
	`gender` text DEFAULT 'unknown' NOT NULL,
	`birthDate` text,
	`gradeLevel` text,
	`guardianName` text,
	`guardianPhone` text,
	`address` text,
	`status` text DEFAULT 'active' NOT NULL,
	`balanceLessons` integer DEFAULT 0 NOT NULL,
	`remark` text,
	`avatarUrl` text,
	`createdBy` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teachers` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`teacherNo` text NOT NULL,
	`phone` text,
	`gender` text DEFAULT 'unknown' NOT NULL,
	`title` text,
	`subjects` text,
	`status` text DEFAULT 'active' NOT NULL,
	`remark` text,
	`avatarUrl` text,
	`userId` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_uniq` ON `attendance` (`scheduleId`,`studentId`,`lessonDate`);--> statement-breakpoint
CREATE INDEX `attendance_date_idx` ON `attendance` (`lessonDate`);--> statement-breakpoint
CREATE INDEX `oauth2_links_user_idx` ON `oauth2_identity_links` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauth2_links_provider_sub_uidx` ON `oauth2_identity_links` (`provider`,`provider_sub`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_family_idx` ON `refresh_tokens` (`family_id`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_sub_idx` ON `refresh_tokens` (`sub`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_uidx` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `webauthn_creds_user_idx` ON `webauthn_credentials` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `class_members_uniq` ON `class_members` (`classId`,`studentId`);--> statement-breakpoint
CREATE INDEX `classes_course_idx` ON `classes` (`courseId`);--> statement-breakpoint
CREATE UNIQUE INDEX `courses_code_idx` ON `courses` (`code`);--> statement-breakpoint
CREATE INDEX `grades_student_idx` ON `grades` (`studentId`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_no_idx` ON `orders` (`orderNo`);--> statement-breakpoint
CREATE INDEX `orders_student_idx` ON `orders` (`studentId`);--> statement-breakpoint
CREATE INDEX `schedules_class_idx` ON `schedules` (`classId`);--> statement-breakpoint
CREATE INDEX `schedules_day_idx` ON `schedules` (`weekday`);--> statement-breakpoint
CREATE UNIQUE INDEX `students_no_idx` ON `students` (`studentNo`);--> statement-breakpoint
CREATE INDEX `students_status_idx` ON `students` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `teachers_no_idx` ON `teachers` (`teacherNo`);