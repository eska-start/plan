CREATE TABLE `expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tripId` int NOT NULL,
	`userId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`currency` varchar(10) DEFAULT 'KRW',
	`category` varchar(30) NOT NULL DEFAULT '기타',
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tripId` int NOT NULL,
	`userId` int NOT NULL,
	`group` varchar(50) NOT NULL DEFAULT '기타',
	`label` varchar(255) NOT NULL,
	`done` boolean DEFAULT false,
	`order` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `checklist_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `trips` ADD `budget` decimal(12,2);--> statement-breakpoint
ALTER TABLE `trips` ADD `budgetCurrency` varchar(10) DEFAULT 'KRW';
