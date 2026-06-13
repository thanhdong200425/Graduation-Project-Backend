-- CreateTable
CREATE TABLE "slide_decks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT,
    "chapterId" TEXT,
    "title" TEXT NOT NULL,
    "numSlides" INTEGER NOT NULL,
    "density" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "slides" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slide_decks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "slide_decks_userId_idx" ON "slide_decks"("userId");

-- CreateIndex
CREATE INDEX "slide_decks_subjectId_idx" ON "slide_decks"("subjectId");

-- CreateIndex
CREATE INDEX "slide_decks_chapterId_idx" ON "slide_decks"("chapterId");

-- AddForeignKey
ALTER TABLE "slide_decks" ADD CONSTRAINT "slide_decks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slide_decks" ADD CONSTRAINT "slide_decks_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slide_decks" ADD CONSTRAINT "slide_decks_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
