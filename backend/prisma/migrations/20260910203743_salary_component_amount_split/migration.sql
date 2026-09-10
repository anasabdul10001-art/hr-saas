/*
  Warnings:

  - You are about to drop the column `value` on the `EmployeeSalaryComponent` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "EmployeeSalaryComponent" DROP COLUMN "value",
ADD COLUMN     "fixedAmount" INTEGER,
ADD COLUMN     "percentage" DOUBLE PRECISION;
