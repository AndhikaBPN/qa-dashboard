-- CreateEnum
CREATE TYPE "SuiteType" AS ENUM ('CASE_FOLDER', 'RUN_FOLDER');

-- AlterTable
ALTER TABLE "TestSuite" ADD COLUMN     "type" "SuiteType" NOT NULL DEFAULT 'CASE_FOLDER';
