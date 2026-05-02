-- CreateEnum
CREATE TYPE "SignalReceiptStatus" AS ENUM ('PENDING', 'FANNED_OUT', 'NO_ELIGIBLE_PORTFOLIOS', 'UNKNOWN_INSTRUMENT');

-- CreateEnum
CREATE TYPE "PortfolioSignalCandidateStatus" AS ENUM ('PENDING', 'DECIDED');

-- CreateEnum
CREATE TYPE "RiskDecisionStatus" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RiskDecisionReasonCode" AS ENUM ('SUBSCRIPTION_DISABLED', 'TRADE_CAP_EXCEEDED', 'INSTRUMENT_EXPOSURE_CAP_EXCEEDED', 'PORTFOLIO_EXPOSURE_CAP_EXCEEDED');

-- CreateEnum
CREATE TYPE "ExposureReservationStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exposureCapNotional" DECIMAL(36,18) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioInstrumentConfig" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "targetNotional" DECIMAL(36,18) NOT NULL,
    "maxTradeNotional" DECIMAL(36,18) NOT NULL,
    "maxPositionNotional" DECIMAL(36,18) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioInstrumentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalReceipt" (
    "id" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "kafkaKey" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "status" "SignalReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "eligiblePortfolioCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignalReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSignalCandidateRecord" (
    "id" TEXT NOT NULL,
    "candidateIdempotencyKey" TEXT NOT NULL,
    "signalReceiptId" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "side" INTEGER NOT NULL,
    "referencePrice" DECIMAL(36,18) NOT NULL,
    "targetNotionalSnapshot" DECIMAL(36,18) NOT NULL,
    "signalTimestamp" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "status" "PortfolioSignalCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioSignalCandidateRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskDecision" (
    "id" TEXT NOT NULL,
    "candidateRecordId" TEXT NOT NULL,
    "candidateIdempotencyKey" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "decision" "RiskDecisionStatus" NOT NULL,
    "reasonCodes" "RiskDecisionReasonCode"[] NOT NULL,
    "requestedNotional" DECIMAL(36,18) NOT NULL,
    "requestedQuantity" DECIMAL(36,18) NOT NULL,
    "referencePrice" DECIMAL(36,18) NOT NULL,
    "emittedTopic" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExposureReservation" (
    "id" TEXT NOT NULL,
    "riskDecisionId" TEXT NOT NULL,
    "candidateIdempotencyKey" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "reservedNotional" DECIMAL(36,18) NOT NULL,
    "reservedQuantity" DECIMAL(36,18) NOT NULL,
    "status" "ExposureReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "ExposureReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioInstrumentConfig_portfolioId_instrumentId_key" ON "PortfolioInstrumentConfig"("portfolioId", "instrumentId");

-- CreateIndex
CREATE INDEX "PortfolioInstrumentConfig_instrumentId_enabled_idx" ON "PortfolioInstrumentConfig"("instrumentId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "SignalReceipt_sourceEventId_key" ON "SignalReceipt"("sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSignalCandidateRecord_candidateIdempotencyKey_key" ON "PortfolioSignalCandidateRecord"("candidateIdempotencyKey");

-- CreateIndex
CREATE INDEX "PortfolioSignalCandidateRecord_portfolioId_createdAt_idx" ON "PortfolioSignalCandidateRecord"("portfolioId", "createdAt");

-- CreateIndex
CREATE INDEX "PortfolioSignalCandidateRecord_sourceEventId_idx" ON "PortfolioSignalCandidateRecord"("sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskDecision_candidateRecordId_key" ON "RiskDecision"("candidateRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskDecision_candidateIdempotencyKey_key" ON "RiskDecision"("candidateIdempotencyKey");

-- CreateIndex
CREATE INDEX "RiskDecision_portfolioId_decision_idx" ON "RiskDecision"("portfolioId", "decision");

-- CreateIndex
CREATE INDEX "RiskDecision_portfolioId_instrumentId_decision_idx" ON "RiskDecision"("portfolioId", "instrumentId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "ExposureReservation_riskDecisionId_key" ON "ExposureReservation"("riskDecisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExposureReservation_candidateIdempotencyKey_key" ON "ExposureReservation"("candidateIdempotencyKey");

-- CreateIndex
CREATE INDEX "ExposureReservation_portfolioId_status_idx" ON "ExposureReservation"("portfolioId", "status");

-- CreateIndex
CREATE INDEX "ExposureReservation_portfolioId_instrumentId_status_idx" ON "ExposureReservation"("portfolioId", "instrumentId", "status");

-- AddForeignKey
ALTER TABLE "PortfolioInstrumentConfig" ADD CONSTRAINT "PortfolioInstrumentConfig_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioInstrumentConfig" ADD CONSTRAINT "PortfolioInstrumentConfig_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSignalCandidateRecord" ADD CONSTRAINT "PortfolioSignalCandidateRecord_signalReceiptId_fkey" FOREIGN KEY ("signalReceiptId") REFERENCES "SignalReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSignalCandidateRecord" ADD CONSTRAINT "PortfolioSignalCandidateRecord_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskDecision" ADD CONSTRAINT "RiskDecision_candidateRecordId_fkey" FOREIGN KEY ("candidateRecordId") REFERENCES "PortfolioSignalCandidateRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskDecision" ADD CONSTRAINT "RiskDecision_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExposureReservation" ADD CONSTRAINT "ExposureReservation_riskDecisionId_fkey" FOREIGN KEY ("riskDecisionId") REFERENCES "RiskDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExposureReservation" ADD CONSTRAINT "ExposureReservation_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
