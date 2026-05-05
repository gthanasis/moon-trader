-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "exitPrice" DOUBLE PRECISION,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "pnl" DOUBLE PRECISION,
    "reasoning" TEXT,
    "source" TEXT NOT NULL DEFAULT 'live',

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "coins" TEXT[],
    "raw" JSONB,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmDecision" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT NOT NULL,
    "stopLoss" DOUBLE PRECISION,
    "takeProfit" DOUBLE PRECISION,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tradeId" TEXT,

    CONSTRAINT "LlmDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candle" (
    "id" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Candle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotState" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "BotState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trade_coin_idx" ON "Trade"("coin");

-- CreateIndex
CREATE INDEX "Trade_openedAt_idx" ON "Trade"("openedAt");

-- CreateIndex
CREATE INDEX "Trade_source_idx" ON "Trade"("source");

-- CreateIndex
CREATE INDEX "Signal_timestamp_idx" ON "Signal"("timestamp");

-- CreateIndex
CREATE INDEX "Signal_source_idx" ON "Signal"("source");

-- CreateIndex
CREATE INDEX "LlmDecision_decidedAt_idx" ON "LlmDecision"("decidedAt");

-- CreateIndex
CREATE INDEX "LlmDecision_coin_idx" ON "LlmDecision"("coin");

-- CreateIndex
CREATE INDEX "Candle_coin_timeframe_idx" ON "Candle"("coin", "timeframe");

-- CreateIndex
CREATE INDEX "Candle_timestamp_idx" ON "Candle"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Candle_coin_timeframe_timestamp_key" ON "Candle"("coin", "timeframe", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "BotState_key_key" ON "BotState"("key");

-- AddForeignKey
ALTER TABLE "LlmDecision" ADD CONSTRAINT "LlmDecision_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
