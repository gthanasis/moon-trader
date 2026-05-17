-- AlterTable
ALTER TABLE "LlmDecision" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'executed';

-- CreateIndex
CREATE INDEX "LlmDecision_status_idx" ON "LlmDecision"("status");
