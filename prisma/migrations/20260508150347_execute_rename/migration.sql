-- AlterTable
ALTER TABLE "exam_items" RENAME CONSTRAINT "exam_questions_pkey" TO "exam_items_pkey";

-- AlterTable
ALTER TABLE "questions" RENAME CONSTRAINT "generated_questions_pkey" TO "questions_pkey";

-- RenameForeignKey
ALTER TABLE "exam_items" RENAME CONSTRAINT "exam_questions_examId_fkey" TO "exam_items_examId_fkey";

-- RenameForeignKey
ALTER TABLE "exam_items" RENAME CONSTRAINT "exam_questions_questionId_fkey" TO "exam_items_questionId_fkey";

-- RenameForeignKey
ALTER TABLE "questions" RENAME CONSTRAINT "generated_questions_chapterId_fkey" TO "questions_chapterId_fkey";

-- RenameForeignKey
ALTER TABLE "questions" RENAME CONSTRAINT "generated_questions_chunkId_fkey" TO "questions_chunkId_fkey";

-- RenameIndex
ALTER INDEX "exam_questions_examId_idx" RENAME TO "exam_items_examId_idx";

-- RenameIndex
ALTER INDEX "exam_questions_examId_questionId_key" RENAME TO "exam_items_examId_questionId_key";

-- RenameIndex
ALTER INDEX "exam_questions_questionId_idx" RENAME TO "exam_items_questionId_idx";

-- RenameIndex
ALTER INDEX "generated_questions_chapterId_idx" RENAME TO "questions_chapterId_idx";

-- RenameIndex
ALTER INDEX "generated_questions_chunkId_idx" RENAME TO "questions_chunkId_idx";

-- RenameIndex
ALTER INDEX "generated_questions_status_idx" RENAME TO "questions_status_idx";
