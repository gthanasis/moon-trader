-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "evidenceFor" INTEGER NOT NULL DEFAULT 0,
    "evidenceAgainst" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_text_key" ON "Lesson"("text");

-- CreateIndex
CREATE INDEX "Lesson_status_idx" ON "Lesson"("status");
