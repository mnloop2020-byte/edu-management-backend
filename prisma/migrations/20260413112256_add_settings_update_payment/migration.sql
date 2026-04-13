/*
  Warnings:

  - You are about to drop the column `amount` on the `Payment` table. All the data in the column will be lost.
  - Added the required column `totalAmount` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "amount",
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalAmount" DOUBLE PRECISION NOT NULL;

-- CreateTable
CREATE TABLE "Setting" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");
