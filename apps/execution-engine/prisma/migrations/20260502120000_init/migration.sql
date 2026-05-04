-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "execution_engine";

-- CreateEnum
CREATE TYPE "execution_engine"."ExecutionOrderStatus" AS ENUM ('PLACED', 'PARTIALLY_FILLED', 'FILLED');

-- CreateEnum
CREATE TYPE "execution_engine"."OutboxEventStatus" AS ENUM ('PENDING', 'IN_FLIGHT', 'DISPATCHED', 'FAILED');

-- CreateTable
CREATE TABLE "execution_engine"."ExecutionOrder" (
    "id" TEXT NOT NULL,
    "approvalEventId" TEXT NOT NULL,
    "candidateIdempotencyKey" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "side" INTEGER NOT NULL,
    "requestedNotional" DECIMAL(36,18) NOT NULL,
    "requestedQuantity" DECIMAL(36,18) NOT NULL,
    "referencePrice" DECIMAL(36,18) NOT NULL,
    "status" "execution_engine"."ExecutionOrderStatus" NOT NULL DEFAULT 'PLACED',
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_engine"."ExecutionFill" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "fillNotional" DECIMAL(36,18) NOT NULL,
    "fillQuantity" DECIMAL(36,18) NOT NULL,
    "fillPrice" DECIMAL(36,18) NOT NULL,
    "cumulativeFilledNotional" DECIMAL(36,18) NOT NULL,
    "cumulativeFilledQuantity" DECIMAL(36,18) NOT NULL,
    "orderStatus" "execution_engine"."ExecutionOrderStatus" NOT NULL,
    "filledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionFill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_engine"."OutboxEvent" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" BYTEA NOT NULL,
    "headers" JSONB,
    "lifecycleSequence" INTEGER NOT NULL DEFAULT 0,
    "status" "execution_engine"."OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dispatchedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionOrder_approvalEventId_key" ON "execution_engine"."ExecutionOrder"("approvalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionOrder_candidateIdempotencyKey_key" ON "execution_engine"."ExecutionOrder"("candidateIdempotencyKey");

-- CreateIndex
CREATE INDEX "ExecutionOrder_portfolioId_status_idx" ON "execution_engine"."ExecutionOrder"("portfolioId", "status");

-- CreateIndex
CREATE INDEX "ExecutionOrder_portfolioId_instrumentId_idx" ON "execution_engine"."ExecutionOrder"("portfolioId", "instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionFill_orderId_sequence_key" ON "execution_engine"."ExecutionFill"("orderId", "sequence");

-- CreateIndex
CREATE INDEX "ExecutionFill_portfolioId_instrumentId_idx" ON "execution_engine"."ExecutionFill"("portfolioId", "instrumentId");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_nextAttemptAt_lifecycleSequence_idx" ON "execution_engine"."OutboxEvent"("status", "nextAttemptAt", "lifecycleSequence");

-- AddForeignKey
ALTER TABLE "execution_engine"."ExecutionFill" ADD CONSTRAINT "ExecutionFill_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "execution_engine"."ExecutionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
