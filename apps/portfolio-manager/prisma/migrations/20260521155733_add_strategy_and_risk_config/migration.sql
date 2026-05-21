-- CreateEnum
CREATE TYPE "RiskConfigAuditEntityType" AS ENUM ('PORTFOLIO', 'INSTRUMENT_CONFIG');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RiskDecisionReasonCode" ADD VALUE 'MAX_OPEN_TRADES_EXCEEDED';
ALTER TYPE "RiskDecisionReasonCode" ADD VALUE 'DAILY_TURNOVER_LIMIT_EXCEEDED';
ALTER TYPE "RiskDecisionReasonCode" ADD VALUE 'STRATEGY_SIDE_FILTER';
ALTER TYPE "RiskDecisionReasonCode" ADD VALUE 'STRATEGY_TIME_FILTER';
ALTER TYPE "RiskDecisionReasonCode" ADD VALUE 'STRATEGY_COOLDOWN_FILTER';

-- AlterTable
ALTER TABLE "Portfolio" ADD COLUMN     "strategyId" TEXT;

-- AlterTable
ALTER TABLE "PortfolioInstrumentConfig" ADD COLUMN     "cooldownSeconds" INTEGER,
ADD COLUMN     "maxConsecutiveRejections" INTEGER,
ADD COLUMN     "maxDailyTurnoverNotional" DECIMAL(36,18),
ADD COLUMN     "maxOpenTrades" INTEGER;

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "allowedSides" INTEGER[],
    "minIntervalSecs" INTEGER,
    "activeTimeStart" TEXT,
    "activeTimeEnd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskConfigAuditLog" (
    "id" TEXT NOT NULL,
    "entityType" "RiskConfigAuditEntityType" NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "portfolioInstrumentConfigId" TEXT,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskConfigAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_name_key" ON "Strategy"("name");

-- CreateIndex
CREATE INDEX "RiskConfigAuditLog_portfolioId_changedAt_idx" ON "RiskConfigAuditLog"("portfolioId", "changedAt");

-- CreateIndex
CREATE INDEX "RiskConfigAuditLog_portfolioInstrumentConfigId_changedAt_idx" ON "RiskConfigAuditLog"("portfolioInstrumentConfigId", "changedAt");

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskConfigAuditLog" ADD CONSTRAINT "RiskConfigAuditLog_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskConfigAuditLog" ADD CONSTRAINT "RiskConfigAuditLog_portfolioInstrumentConfigId_fkey" FOREIGN KEY ("portfolioInstrumentConfigId") REFERENCES "PortfolioInstrumentConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
