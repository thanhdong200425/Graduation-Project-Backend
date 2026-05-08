/*
Warnings:

- You are about to drop the `exam_questions` table. If the table is not empty, all the data it contains will be lost.
- You are about to drop the `generated_questions` table. If the table is not empty, all the data it contains will be lost.

*/
-- RenameTabke
ALTER TABLE "exam_questions" RENAME TO "exam_items";

ALTER TABLE "generated_questions" RENAME TO "questions";