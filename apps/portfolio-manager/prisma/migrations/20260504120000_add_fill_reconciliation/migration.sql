-- CreateEnum
CREATE TYPE "PortfolioOrderStatus" AS ENUM ('PLACED', 'PARTIALLY_FILLED', 'FILLED');

-- CreateTable
CREATE TABLE "PortfolioOrder" (
    "id" TEXT NOT NULL,
    "approvalEventId" TEXT NOT NULL,
    "candidateIdempotencyKey" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "side" INTEGER NOT NULL,
    "status" "PortfolioOrderStatus" NOT NULL,
    "finalSequence" INTEGER,
    "firstFilledAt" TIMESTAMP(3) NOT NULL,
    "lastFilledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioFill" (
    "id" TEXT NOT NULL,
    "kafkaEventId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "approvalEventId" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "candidateIdempotencyKey" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "side" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "fillNotional" DECIMAL(36,18) NOT NULL,
    "fillQuantity" DECIMAL(36,18) NOT NULL,
    "fillPrice" DECIMAL(36,18) NOT NULL,
    "cumulativeFilledNotional" DECIMAL(36,18) NOT NULL,
    "cumulativeFilledQuantity" DECIMAL(36,18) NOT NULL,
    "orderStatus" "PortfolioOrderStatus" NOT NULL,
    "filledAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioFill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioPosition" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "quantity" DECIMAL(36,18) NOT NULL,
    "averageEntryPrice" DECIMAL(36,18) NOT NULL,
    "exposureNotional" DECIMAL(36,18) NOT NULL,
    "lastFillId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSummarySnapshot" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "sourceFillId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "aggregateExposureNotional" DECIMAL(36,18) NOT NULL,
    "openPositionCount" INTEGER NOT NULL,
    "changedPositionQuantity" DECIMAL(36,18) NOT NULL,
    "changedPositionAverageEntryPrice" DECIMAL(36,18) NOT NULL,
    "changedPositionExposureNotional" DECIMAL(36,18) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioSummarySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioOrder_approvalEventId_key" ON "PortfolioOrder"("approvalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioOrder_candidateIdempotencyKey_key" ON "PortfolioOrder"("candidateIdempotencyKey");

-- CreateIndex
CREATE INDEX "PortfolioOrder_portfolioId_status_idx" ON "PortfolioOrder"("portfolioId", "status");

-- CreateIndex
CREATE INDEX "PortfolioOrder_portfolioId_instrumentId_idx" ON "PortfolioOrder"("portfolioId", "instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioFill_kafkaEventId_key" ON "PortfolioFill"("kafkaEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioFill_orderId_sequence_key" ON "PortfolioFill"("orderId", "sequence");

-- CreateIndex
CREATE INDEX "PortfolioFill_portfolioId_instrumentId_filledAt_idx" ON "PortfolioFill"("portfolioId", "instrumentId", "filledAt");

-- CreateIndex
CREATE INDEX "PortfolioFill_candidateIdempotencyKey_idx" ON "PortfolioFill"("candidateIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioPosition_portfolioId_instrumentId_key" ON "PortfolioPosition"("portfolioId", "instrumentId");

-- CreateIndex
CREATE INDEX "PortfolioPosition_portfolioId_exposureNotional_idx" ON "PortfolioPosition"("portfolioId", "exposureNotional");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSummarySnapshot_sourceFillId_key" ON "PortfolioSummarySnapshot"("sourceFillId");

-- CreateIndex
CREATE INDEX "PortfolioSummarySnapshot_portfolioId_updatedAt_idx" ON "PortfolioSummarySnapshot"("portfolioId", "updatedAt");

-- AddForeignKey
ALTER TABLE "PortfolioOrder" ADD CONSTRAINT "PortfolioOrder_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioOrder" ADD CONSTRAINT "PortfolioOrder_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioFill" ADD CONSTRAINT "PortfolioFill_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PortfolioOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioFill" ADD CONSTRAINT "PortfolioFill_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioFill" ADD CONSTRAINT "PortfolioFill_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPosition" ADD CONSTRAINT "PortfolioPosition_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPosition" ADD CONSTRAINT "PortfolioPosition_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSummarySnapshot" ADD CONSTRAINT "PortfolioSummarySnapshot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
