-- CreateTable
CREATE TABLE "Narration" (
    "id" TEXT NOT NULL,
    "granularity" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "assessment" TEXT,
    "stats" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Narration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Narration_granularity_periodStart_idx" ON "Narration"("granularity", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "Narration_granularity_periodStart_key" ON "Narration"("granularity", "periodStart");

