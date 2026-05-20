ALTER TABLE `expenses` ADD COLUMN `paidBefore` boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE `expenses` ADD COLUMN `krwAmount` decimal(12,2);
