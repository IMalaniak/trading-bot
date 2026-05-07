ALTER TABLE "execution_engine"."ExecutionOrder"
ADD COLUMN "lastActivityAt" TIMESTAMP(3);

UPDATE "execution_engine"."ExecutionOrder" AS order_row
SET "lastActivityAt" = COALESCE(
  (
    SELECT MAX(fill_row."filledAt")
    FROM "execution_engine"."ExecutionFill" AS fill_row
    WHERE fill_row."orderId" = order_row."id"
  ),
  order_row."placedAt"
);

ALTER TABLE "execution_engine"."ExecutionOrder"
ALTER COLUMN "lastActivityAt" SET NOT NULL;

CREATE INDEX "ExecutionOrder_portfolioId_lastActivityAt_idx"
ON "execution_engine"."ExecutionOrder"("portfolioId", "lastActivityAt");
