-- AlterTable
ALTER TABLE "pdf_uploads" ADD COLUMN     "chapterId" TEXT;

-- CreateIndex
CREATE INDEX "pdf_uploads_chapterId_idx" ON "pdf_uploads"("chapterId");

-- AddForeignKey
ALTER TABLE "pdf_uploads" ADD CONSTRAINT "pdf_uploads_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
