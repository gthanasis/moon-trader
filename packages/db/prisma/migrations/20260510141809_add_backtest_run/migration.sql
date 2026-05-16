-- CreateTable
CREATE TABLE "BacktestRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "coins" TEXT[],
    "model" TEXT NOT NULL,
    "intervalMs" INTEGER NOT NULL,
    "initialCapital" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "stats" JSONB,
    "trades" JSONB,
    "pnlCurve" JSONB,
    "decisions" JSONB,
    "errorMessage" TEXT,

    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BacktestRun_createdAt_idx" ON "BacktestRun"("createdAt");

-- CreateIndex
CREATE INDEX "BacktestRun_status_idx" ON "BacktestRun"("status");
