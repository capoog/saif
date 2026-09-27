-- CreateEnum
CREATE TYPE "CarDealType" AS ENUM ('BROKERAGE', 'PURCHASE');

-- CreateEnum
CREATE TYPE "CarDealStatus" AS ENUM ('EVALUATING', 'LISTED', 'OWNED', 'SOLD', 'CANCELLED');

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "carDealId" TEXT;

-- CreateTable
CREATE TABLE "CarDeal" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "type" "CarDealType" NOT NULL,
    "status" "CarDealStatus" NOT NULL,
    "make" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "mileage" INTEGER,
    "color" TEXT,
    "specs" TEXT,
    "vin" TEXT,
    "source" TEXT,
    "ownerName" TEXT,
    "ownerPhone" TEXT,
    "marketPrices" JSONB NOT NULL DEFAULT '[]',
    "marketAvg" DECIMAL(14,2),
    "askingPrice" DECIMAL(14,2),
    "commissionType" TEXT,
    "commissionValue" DECIMAL(14,2),
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "purchasePrice" DECIMAL(14,2),
    "purchasedAt" TIMESTAMP(3),
    "salePrice" DECIMAL(14,2),
    "soldAt" TIMESTAMP(3),
    "buyerId" TEXT,
    "commission" DECIMAL(14,2),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarDealCost" (
    "id" TEXT NOT NULL,
    "carDealId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "accountId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarDealCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CarDeal_number_key" ON "CarDeal"("number");

-- CreateIndex
CREATE INDEX "CarDeal_status_idx" ON "CarDeal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CarDealCost_journalEntryId_key" ON "CarDealCost"("journalEntryId");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_carDealId_fkey" FOREIGN KEY ("carDealId") REFERENCES "CarDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarDeal" ADD CONSTRAINT "CarDeal_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarDealCost" ADD CONSTRAINT "CarDealCost_carDealId_fkey" FOREIGN KEY ("carDealId") REFERENCES "CarDeal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
