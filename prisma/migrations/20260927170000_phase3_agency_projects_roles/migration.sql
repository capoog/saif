-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DELIVERED', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('QUALIFICATION', 'PRIVATE_SUPPLY', 'GOV_TENDER', 'SUBCONTRACT', 'DIRECT_CONTRACT');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('BIDDING', 'ACTIVE', 'COMPLETED', 'LOST', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID');

-- AlterEnum
ALTER TYPE "AccountKind" ADD VALUE 'RESTRICTED_CASH';

-- AlterEnum
ALTER TYPE "ProductKind" ADD VALUE 'SERVICE';

-- AlterTable
ALTER TABLE "B2BContract" ADD COLUMN     "commissionAccrued" DECIMAL(14,2),
ADD COLUMN     "salesUserId" TEXT;

-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "JournalLine" ADD COLUMN     "freelancerId" TEXT,
ADD COLUMN     "salesUserId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "commissionPct" DECIMAL(5,2),
ADD COLUMN     "freelancerId" TEXT;

-- CreateTable
CREATE TABLE "Freelancer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "skills" TEXT,
    "rateNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Freelancer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "nextBillingDate" TIMESTAMP(3) NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionCharge" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyTask" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3),
    "freelancerId" TEXT,
    "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "deliveryUrl" TEXT,
    "deliveryNote" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BigProject" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "type" "ProjectType" NOT NULL,
    "name" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'BIDDING',
    "value" DECIMAL(14,2) NOT NULL,
    "advancePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bankGuarantee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "guaranteeMargin" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expectedCollectionDays" INTEGER NOT NULL DEFAULT 60,
    "startDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BigProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectInvoice" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advanceDeduction" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionCharge_orderId_key" ON "SubscriptionCharge"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionCharge_subscriptionId_period_key" ON "SubscriptionCharge"("subscriptionId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyTask_journalEntryId_key" ON "AgencyTask"("journalEntryId");

-- CreateIndex
CREATE INDEX "AgencyTask_freelancerId_status_idx" ON "AgencyTask"("freelancerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BigProject_number_key" ON "BigProject"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInvoice_projectId_number_key" ON "ProjectInvoice"("projectId", "number");

-- CreateIndex
CREATE INDEX "JournalEntry_projectId_idx" ON "JournalEntry"("projectId");

-- CreateIndex
CREATE INDEX "JournalLine_freelancerId_idx" ON "JournalLine"("freelancerId");

-- CreateIndex
CREATE INDEX "JournalLine_salesUserId_idx" ON "JournalLine"("salesUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_freelancerId_key" ON "User"("freelancerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "Freelancer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "BigProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyTask" ADD CONSTRAINT "AgencyTask_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyTask" ADD CONSTRAINT "AgencyTask_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyTask" ADD CONSTRAINT "AgencyTask_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "Freelancer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BigProject" ADD CONSTRAINT "BigProject_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvoice" ADD CONSTRAINT "ProjectInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "BigProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

