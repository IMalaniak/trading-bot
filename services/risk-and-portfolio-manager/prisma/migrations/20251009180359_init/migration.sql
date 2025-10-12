-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "assetClass" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "venue" TEXT NOT NULL,
    "externalSymbol" TEXT,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_symbol_venue_key" ON "Instrument"("symbol", "venue");
