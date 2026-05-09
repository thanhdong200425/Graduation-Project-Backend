-- CreateEnum
CREATE TYPE "CurrentStep" AS ENUM ('PARSING', 'CHUNKING', 'EMBEDDING', 'STORING', 'DONE');

-- AlterTable
ALTER TABLE "pdf_uploads" ADD COLUMN     "currentStep" "CurrentStep" NOT NULL DEFAULT 'PARSING',
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0;
