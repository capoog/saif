-- CreateEnum
CREATE TYPE "ExternalOrderStatus" AS ENUM ('SYNCED', 'NEEDS_MAPPING', 'ERROR', 'IGNORED');

-- AlterTable
ALTER TABLE "Engine" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'CORE',
ADD COLUMN     "maxCapitalPct" DECIMAL(5,2),
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalSource" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sku" TEXT;

-- CreateTable
CREATE TABLE "ExternalOrder" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "reference" TEXT,
    "status" "ExternalOrderStatus" NOT NULL,
    "storeStatus" TEXT,
    "orderId" TEXT,
    "payload" JSONB NOT NULL,
    "missingSkus" TEXT[],
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalOrder_status_idx" ON "ExternalOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOrder_source_externalId_key" ON "ExternalOrder"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_externalSource_externalId_key" ON "Order"("externalSource", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

