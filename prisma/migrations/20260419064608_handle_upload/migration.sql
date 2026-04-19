-- CreateEnum
CREATE TYPE "PdfUploadStatus" AS ENUM ('PENDING', 'INDEXED', 'FAILED');

-- CreateTable
CREATE TABLE "pdf_uploads" (
    "id" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "status" "PdfUploadStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pdf_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pdf_uploads_fileHash_key" ON "pdf_uploads"("fileHash");

-- CreateIndex
CREATE INDEX "pdf_uploads_uploadedById_idx" ON "pdf_uploads"("uploadedById");

-- AddForeignKey
ALTER TABLE "pdf_uploads" ADD CONSTRAINT "pdf_uploads_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
