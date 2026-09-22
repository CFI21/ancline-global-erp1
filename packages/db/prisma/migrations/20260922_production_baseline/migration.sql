-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('CUSTOMER', 'SHIPPER', 'CONSIGNEE', 'AGENT', 'CARRIER', 'SLOT_PROVIDER', 'DEPOT', 'TERMINAL', 'TRUCKER', 'BROKER', 'VENDOR', 'ANCLINE_BRANCH');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('DRAFT', 'RATE_REQUESTED', 'RATE_RECEIVED', 'RATE_APPROVED', 'QUOTE_SENT', 'CUSTOMER_ACCEPTED', 'BOOKING_REQUESTED', 'CREDIT_CHECK', 'EQUIPMENT_CHECK', 'SLOT_CHECK', 'AGENT_ACCEPTANCE', 'CARRIER_CONFIRMATION', 'FINAL_APPROVAL', 'CONFIRMED', 'OPERATIONAL', 'COMPLETED', 'FINANCIALLY_CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinanceType" AS ENUM ('REVENUE', 'COST');

-- CreateEnum
CREATE TYPE "FinanceStatus" AS ENUM ('PLANNED', 'WIP', 'ACCRUED', 'POSTED', 'APPROVAL_PENDING', 'APPROVED', 'PAYABLE', 'PAYMENT_SCHEDULED', 'PART_PAID', 'PAID', 'CLEARED', 'FINAL', 'DISPUTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "branchId" TEXT,
    "agentId" TEXT,
    "customerId" TEXT,
    "partyId" TEXT,
    "costCenterCode" TEXT,
    "agentMode" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roles" "OrgRole"[],
    "countryCode" TEXT,
    "costCenterCode" TEXT,
    "customerRef" TEXT,
    "registrationRef" TEXT,
    "kycStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "kycData" JSONB,
    "kycSubmittedAt" TIMESTAMP(3),
    "kycApprovedAt" TIMESTAMP(3),
    "kycApprovedBy" TEXT,
    "kycRejectedAt" TIMESTAMP(3),
    "kycRejectedBy" TEXT,
    "kycRejectionReason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateQuote" (
    "id" TEXT NOT NULL,
    "quoteNo" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "buyRate" DECIMAL(18,2) NOT NULL,
    "sellRate" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT,
    "customerRef" TEXT,
    "costCenterCode" TEXT,
    "requestData" JSONB,
    "carrierOfferData" JSONB,
    "carrierCode" TEXT,
    "carrierQuoteRef" TEXT,
    "termsVersion" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "termsAcceptedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "owningBranchId" TEXT,
    "id" TEXT NOT NULL,
    "bookingNo" TEXT NOT NULL,
    "businessModel" TEXT NOT NULL DEFAULT 'NVOCC',
    "bookingChannel" TEXT NOT NULL DEFAULT 'INTERNAL',
    "shipmentNo" TEXT,
    "shipmentStatus" TEXT DEFAULT 'BOOKED',
    "consolId" TEXT,
    "customerId" TEXT NOT NULL,
    "customerRef" TEXT,
    "costCenterCode" TEXT,
    "jobType" TEXT,
    "forwardingTradeType" TEXT,
    "producingAgentId" TEXT,
    "rateQuoteId" TEXT,
    "salesOwner" TEXT,
    "operator" TEXT,
    "bookingType" TEXT,
    "transportMode" TEXT,
    "serviceType" TEXT,
    "bookingDate" TIMESTAMP(3),
    "customerReference" TEXT,
    "shipperReference" TEXT,
    "carrierBookingNo" TEXT,
    "houseBL" TEXT,
    "masterBL" TEXT,
    "shipper" TEXT,
    "consignee" TEXT,
    "notifyParty" TEXT,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "placeOfReceipt" TEXT,
    "portOfLoading" TEXT,
    "portOfDischarge" TEXT,
    "placeOfDelivery" TEXT,
    "transshipmentPort" TEXT,
    "terminal" TEXT,
    "polAgent" TEXT,
    "podAgent" TEXT,
    "etd" TIMESTAMP(3),
    "eta" TIMESTAMP(3),
    "atd" TIMESTAMP(3),
    "ata" TIMESTAMP(3),
    "cyClosing" TIMESTAMP(3),
    "siCutoff" TIMESTAMP(3),
    "vgmCutoff" TIMESTAMP(3),
    "docCutoff" TIMESTAMP(3),
    "portCutoff" TIMESTAMP(3),
    "carrier" TEXT,
    "vesselVoyage" TEXT,
    "equipment" TEXT,
    "quantity" INTEGER,
    "containerOwner" TEXT,
    "throughBL" TEXT,
    "commodity" TEXT,
    "packageCount" INTEGER,
    "packageType" TEXT,
    "grossWeight" DOUBLE PRECISION,
    "netWeight" DOUBLE PRECISION,
    "volumeCbm" DOUBLE PRECISION,
    "marksNumbers" TEXT,
    "hsCode" TEXT,
    "cargoDescription" TEXT,
    "incoterm" TEXT,
    "freightTerms" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "BookingStatus" NOT NULL DEFAULT 'DRAFT',
    "creditStatus" TEXT,
    "slotStatus" TEXT,
    "equipmentStatus" TEXT,
    "specialCargo" TEXT,
    "dgUnNo" TEXT,
    "dgImoClass" TEXT,
    "dgPackingGroup" TEXT,
    "dgProperShippingName" TEXT,
    "reeferTemperatureC" DOUBLE PRECISION,
    "reeferVentilation" DOUBLE PRECISION,
    "reeferHumidityPct" DOUBLE PRECISION,
    "oogLengthCm" DOUBLE PRECISION,
    "oogWidthCm" DOUBLE PRECISION,
    "oogHeightCm" DOUBLE PRECISION,
    "oogWeightKg" DOUBLE PRECISION,
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentMilestone" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "location" TEXT,
    "plannedAt" TIMESTAMP(3),
    "actualAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "source" TEXT DEFAULT 'MANUAL',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingLeg" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "legType" TEXT NOT NULL DEFAULT 'MAIN',
    "mode" TEXT NOT NULL DEFAULT 'SEA',
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "carrier" TEXT,
    "vessel" TEXT,
    "voyage" TEXT,
    "terminal" TEXT,
    "etd" TIMESTAMP(3),
    "eta" TIMESTAMP(3),
    "atd" TIMESTAMP(3),
    "ata" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "releaseControl" TEXT,
    "fileKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL,
    "containerNo" TEXT NOT NULL,
    "bookingId" TEXT,
    "type" TEXT NOT NULL,
    "ownership" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "location" TEXT,
    "sealNo" TEXT,
    "vgm" DOUBLE PRECISION,
    "grossWeight" DOUBLE PRECISION,
    "pickupDate" TIMESTAMP(3),
    "emptyDepot" TEXT,
    "fullReturnTerminal" TEXT,
    "equipmentProvider" TEXT,
    "allocationRef" TEXT,
    "allocationStatus" TEXT DEFAULT 'UNALLOCATED',
    "emptyReleaseOrderNo" TEXT,
    "emptyReleaseValidUntil" TIMESTAMP(3),
    "fullGateInAt" TIMESTAMP(3),
    "dischargeAt" TIMESTAMP(3),
    "deliveryAt" TIMESTAMP(3),
    "detentionFreeDays" INTEGER,
    "demurrageFreeDays" INTEGER,
    "detentionFreeUntil" TIMESTAMP(3),
    "demurrageFreeUntil" TIMESTAMP(3),
    "emptyReturnDue" TIMESTAMP(3),
    "emptyReturnedAt" TIMESTAMP(3),
    "detentionRatePerDay" DOUBLE PRECISION,
    "demurrageRatePerDay" DOUBLE PRECISION,
    "freeTimeCurrency" TEXT DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerMovement" (
    "id" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "eventCode" TEXT NOT NULL,
    "eventLabel" TEXT NOT NULL,
    "status" TEXT,
    "location" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "reference" TEXT,
    "remarks" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContainerMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceLine" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "FinanceType" NOT NULL,
    "chargeCode" TEXT NOT NULL,
    "description" TEXT,
    "partyId" TEXT,
    "billingPartyId" TEXT,
    "serviceProviderId" TEXT,
    "quantity" DECIMAL(18,3),
    "unitRate" DECIMAL(18,2),
    "amount" DECIMAL(18,2) NOT NULL,
    "finalAmount" DECIMAL(18,2),
    "currency" TEXT NOT NULL,
    "status" "FinanceStatus" NOT NULL DEFAULT 'PLANNED',
    "source" TEXT,
    "reference" TEXT,
    "taxRate" DECIMAL(8,4),
    "invoiceReady" BOOLEAN NOT NULL DEFAULT false,
    "invoiceNo" TEXT,
    "invoiceIssuedAt" TIMESTAMP(3),
    "accruedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "title" TEXT NOT NULL,
    "ownerId" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "slaState" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "type" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalId" TEXT,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "objectType" TEXT,
    "objectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNREAD',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCloseoutChecklist" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemLabel" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobCloseoutChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VesselVoyageSchedule" (
    "id" TEXT NOT NULL,
    "scheduleNo" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "serviceName" TEXT,
    "vessel" TEXT NOT NULL,
    "imoNo" TEXT,
    "voyage" TEXT NOT NULL,
    "direction" TEXT,
    "portOfLoading" TEXT NOT NULL,
    "portOfDischarge" TEXT NOT NULL,
    "terminal" TEXT,
    "etd" TIMESTAMP(3) NOT NULL,
    "eta" TIMESTAMP(3) NOT NULL,
    "atd" TIMESTAMP(3),
    "ata" TIMESTAMP(3),
    "cyClosing" TIMESTAMP(3),
    "siCutoff" TIMESTAMP(3),
    "vgmCutoff" TIMESTAMP(3),
    "docCutoff" TIMESTAMP(3),
    "capacityTeu" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "remarks" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VesselVoyageSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportOrder" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "containerId" TEXT,
    "orderType" TEXT NOT NULL DEFAULT 'IMPORT_DELIVERY',
    "providerOrgId" TEXT,
    "providerName" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "truckNo" TEXT,
    "trailerNo" TEXT,
    "pickupLocation" TEXT NOT NULL,
    "deliveryLocation" TEXT NOT NULL,
    "plannedPickupAt" TIMESTAMP(3),
    "plannedDeliveryAt" TIMESTAMP(3),
    "actualPickupAt" TIMESTAMP(3),
    "actualDeliveryAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "customerReference" TEXT,
    "providerReference" TEXT,
    "instructions" TEXT,
    "proofOfDeliveryRef" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consol" (
    "id" TEXT NOT NULL,
    "consolNo" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SEA',
    "carrier" TEXT,
    "serviceName" TEXT,
    "masterBL" TEXT,
    "vessel" TEXT,
    "voyage" TEXT,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "portOfLoading" TEXT NOT NULL,
    "portOfDischarge" TEXT NOT NULL,
    "terminal" TEXT,
    "etd" TIMESTAMP(3) NOT NULL,
    "eta" TIMESTAMP(3) NOT NULL,
    "atd" TIMESTAMP(3),
    "ata" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "owningBranchId" TEXT,
    "remarks" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceContract" (
    "id" TEXT NOT NULL,
    "contractNo" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "partyType" TEXT NOT NULL,
    "contractType" TEXT NOT NULL,
    "trade" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "minimumQuantity" DECIMAL(18,2),
    "quantityUnit" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractRateLane" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "chargeCode" TEXT NOT NULL,
    "buyRate" DECIMAL(18,2),
    "sellRate" DECIMAL(18,2),
    "currency" TEXT NOT NULL,
    "dgPremium" DECIMAL(18,2),
    "reeferPremium" DECIMAL(18,2),
    "oogRule" TEXT,
    "freeTimeOrigin" INTEGER,
    "freeTimeDestination" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractRateLane_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_email_key" ON "UserAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");

-- CreateIndex
CREATE INDEX "Organization_customerRef_idx" ON "Organization"("customerRef");

-- CreateIndex
CREATE INDEX "Organization_registrationRef_idx" ON "Organization"("registrationRef");

-- CreateIndex
CREATE UNIQUE INDEX "RateQuote_quoteNo_key" ON "RateQuote"("quoteNo");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingNo_key" ON "Booking"("bookingNo");

-- CreateIndex
CREATE INDEX "Booking_businessModel_bookingChannel_idx" ON "Booking"("businessModel", "bookingChannel");

-- CreateIndex
CREATE INDEX "Booking_rateQuoteId_idx" ON "Booking"("rateQuoteId");

-- CreateIndex
CREATE INDEX "Booking_customerRef_idx" ON "Booking"("customerRef");

-- CreateIndex
CREATE INDEX "Booking_salesOwner_idx" ON "Booking"("salesOwner");

-- CreateIndex
CREATE INDEX "Booking_operator_idx" ON "Booking"("operator");

-- CreateIndex
CREATE INDEX "Booking_consolId_idx" ON "Booking"("consolId");

-- CreateIndex
CREATE INDEX "Booking_shipmentNo_idx" ON "Booking"("shipmentNo");

-- CreateIndex
CREATE INDEX "ShipmentMilestone_bookingId_plannedAt_idx" ON "ShipmentMilestone"("bookingId", "plannedAt");

-- CreateIndex
CREATE INDEX "ShipmentMilestone_status_idx" ON "ShipmentMilestone"("status");

-- CreateIndex
CREATE INDEX "BookingLeg_bookingId_status_idx" ON "BookingLeg"("bookingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BookingLeg_bookingId_sequence_key" ON "BookingLeg"("bookingId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Document_documentNo_key" ON "Document"("documentNo");

-- CreateIndex
CREATE UNIQUE INDEX "Container_containerNo_key" ON "Container"("containerNo");

-- CreateIndex
CREATE INDEX "ContainerMovement_containerId_occurredAt_idx" ON "ContainerMovement"("containerId", "occurredAt");

-- CreateIndex
CREATE INDEX "ContainerMovement_eventCode_idx" ON "ContainerMovement"("eventCode");

-- CreateIndex
CREATE INDEX "FinanceLine_bookingId_type_idx" ON "FinanceLine"("bookingId", "type");

-- CreateIndex
CREATE INDEX "FinanceLine_bookingId_status_idx" ON "FinanceLine"("bookingId", "status");

-- CreateIndex
CREATE INDEX "FinanceLine_reference_idx" ON "FinanceLine"("reference");

-- CreateIndex
CREATE INDEX "IntegrationEvent_objectType_objectId_idx" ON "IntegrationEvent"("objectType", "objectId");

-- CreateIndex
CREATE INDEX "Notification_userId_status_idx" ON "Notification"("userId", "status");

-- CreateIndex
CREATE INDEX "Notification_objectType_objectId_idx" ON "Notification"("objectType", "objectId");

-- CreateIndex
CREATE UNIQUE INDEX "JobCloseoutChecklist_bookingId_itemCode_key" ON "JobCloseoutChecklist"("bookingId", "itemCode");

-- CreateIndex
CREATE UNIQUE INDEX "VesselVoyageSchedule_scheduleNo_key" ON "VesselVoyageSchedule"("scheduleNo");

-- CreateIndex
CREATE INDEX "VesselVoyageSchedule_carrier_vessel_voyage_idx" ON "VesselVoyageSchedule"("carrier", "vessel", "voyage");

-- CreateIndex
CREATE INDEX "VesselVoyageSchedule_portOfLoading_portOfDischarge_etd_idx" ON "VesselVoyageSchedule"("portOfLoading", "portOfDischarge", "etd");

-- CreateIndex
CREATE INDEX "VesselVoyageSchedule_status_idx" ON "VesselVoyageSchedule"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TransportOrder_orderNo_key" ON "TransportOrder"("orderNo");

-- CreateIndex
CREATE INDEX "TransportOrder_bookingId_status_idx" ON "TransportOrder"("bookingId", "status");

-- CreateIndex
CREATE INDEX "TransportOrder_containerId_idx" ON "TransportOrder"("containerId");

-- CreateIndex
CREATE INDEX "TransportOrder_providerOrgId_idx" ON "TransportOrder"("providerOrgId");

-- CreateIndex
CREATE INDEX "TransportOrder_plannedPickupAt_idx" ON "TransportOrder"("plannedPickupAt");

-- CreateIndex
CREATE UNIQUE INDEX "Consol_consolNo_key" ON "Consol"("consolNo");

-- CreateIndex
CREATE INDEX "Consol_carrier_vessel_voyage_idx" ON "Consol"("carrier", "vessel", "voyage");

-- CreateIndex
CREATE INDEX "Consol_portOfLoading_portOfDischarge_etd_idx" ON "Consol"("portOfLoading", "portOfDischarge", "etd");

-- CreateIndex
CREATE INDEX "Consol_status_idx" ON "Consol"("status");

-- CreateIndex
CREATE INDEX "Consol_owningBranchId_idx" ON "Consol"("owningBranchId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceContract_contractNo_key" ON "ServiceContract"("contractNo");

-- CreateIndex
CREATE INDEX "ServiceContract_partyId_status_idx" ON "ServiceContract"("partyId", "status");

-- CreateIndex
CREATE INDEX "ServiceContract_validTo_idx" ON "ServiceContract"("validTo");

-- CreateIndex
CREATE INDEX "ContractRateLane_contractId_idx" ON "ContractRateLane"("contractId");

-- CreateIndex
CREATE INDEX "ContractRateLane_origin_destination_equipment_idx" ON "ContractRateLane"("origin", "destination", "equipment");

-- CreateIndex
CREATE INDEX "ContractRateLane_chargeCode_currency_idx" ON "ContractRateLane"("chargeCode", "currency");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_producingAgentId_fkey" FOREIGN KEY ("producingAgentId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_rateQuoteId_fkey" FOREIGN KEY ("rateQuoteId") REFERENCES "RateQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_consolId_fkey" FOREIGN KEY ("consolId") REFERENCES "Consol"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentMilestone" ADD CONSTRAINT "ShipmentMilestone_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingLeg" ADD CONSTRAINT "BookingLeg_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerMovement" ADD CONSTRAINT "ContainerMovement_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLine" ADD CONSTRAINT "FinanceLine_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCloseoutChecklist" ADD CONSTRAINT "JobCloseoutChecklist_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractRateLane" ADD CONSTRAINT "ContractRateLane_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

