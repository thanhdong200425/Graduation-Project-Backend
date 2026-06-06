-- AlterTable
ALTER TABLE "User" ADD COLUMN     "creditQuota" INTEGER;

-- AlterTable
ALTER TABLE "generation_jobs" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "token_usage_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "defaultQuota" INTEGER NOT NULL DEFAULT 100,
    "alertThresholdPct" INTEGER NOT NULL DEFAULT 80,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "token_usage_logs_userId_idx" ON "token_usage_logs"("userId");

-- CreateIndex
CREATE INDEX "token_usage_logs_createdAt_idx" ON "token_usage_logs"("createdAt");

-- CreateIndex
CREATE INDEX "generation_jobs_userId_idx" ON "generation_jobs"("userId");

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_usage_logs" ADD CONSTRAINT "token_usage_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_usage_logs" ADD CONSTRAINT "token_usage_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "generation_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
