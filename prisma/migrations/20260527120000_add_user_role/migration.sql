-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('TEACHER', 'STUDENT');

-- AlterTable: existing rows receive TEACHER via DEFAULT (no data loss)
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'TEACHER';
