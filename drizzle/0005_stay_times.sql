ALTER TABLE `accommodations`
  ADD COLUMN `checkInTime` varchar(5) AFTER `checkIn`,
  ADD COLUMN `checkOutTime` varchar(5) AFTER `checkOut`;
