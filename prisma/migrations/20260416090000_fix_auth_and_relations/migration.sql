-- Normalize legacy role values.
UPDATE "User"
SET "role" = UPPER("role")
WHERE "role" <> UPPER("role");

ALTER TABLE "User"
ALTER COLUMN "role" SET DEFAULT 'ADMIN';

-- Keep attendance and payments in sync with student deletion.
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_studentId_fkey";
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_studentId_fkey";

ALTER TABLE "Attendance"
ADD CONSTRAINT "Attendance_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prevent duplicate attendance rows for the same normalized day.
CREATE UNIQUE INDEX "Attendance_studentId_date_key" ON "Attendance"("studentId", "date");
