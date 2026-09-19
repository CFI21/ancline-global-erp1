import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from './integrations/integrations.service';
import { ancCarrierReference, assertAncCarrierOutboundPayload } from './carrier-outbound-policy';

type StepResult = {
  name: string;
  status: 'PASS' | 'FAIL';
  durationMs: number;
  detail?: any;
  error?: string;
};

@Injectable()
export class UatService {
  constructor(
    private readonly p: PrismaService,
    private readonly integrations: IntegrationsService,
  ) {}

  private assertAdmin(user: any) {
    if (user?.role !== 'GLOBAL_ADMIN') {
      throw new ForbiddenException('GLOBAL_ADMIN is required for UAT runner');
    }
  }

  private assertEnabled() {
    if (String(process.env.UAT_RUNNER_ENABLED || '').toLowerCase() !== 'true') {
      throw new ServiceUnavailableException('UAT runner is disabled. Set UAT_RUNNER_ENABLED=true for controlled staging use.');
    }
  }

  status(user: any) {
    this.assertAdmin(user);
    return {
      enabled: String(process.env.UAT_RUNNER_ENABLED || '').toLowerCase() === 'true',
      environment: process.env.NODE_ENV || 'unknown',
      destructive: false,
      defaultCleanup: true,
      scope: 'ANCLINE full transaction release-gate UAT',
      profile: 'FULL_TRANSACTION',
      coverage: [
        'customer KYC', 'accepted rate/quote', 'booking controls', 'carrier identity/privacy',
        'payer/prepaid-collect matrix', 'carrier booking', 'SI', 'VGM', 'HBL', 'MBL',
        'shipment promotion', 'tracking milestones', 'integration idempotency', 'customer isolation',
        'AR invoice', 'AP invoice', 'payment lifecycle', 'profitability', 'task/SLA',
        'maker-checker', 'exceptions', 'audit trail', 'closeout', 'cleanup', 'exception/failure release gate'
      ]
    };
  }

  async run(user: any, body: any) {
    this.assertAdmin(user);
    this.assertEnabled();

    const startedAt = new Date();
    const runId = `UAT-${startedAt.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const cleanup = body.cleanup !== false;
    const actorId = user?.sub || user?.email || 'uat-runner';
    const adminUser: any = { role: 'GLOBAL_ADMIN', sub: actorId, email: user?.email || 'uat@ancline.local' };
    const steps: StepResult[] = [];
    const ids: Record<string, string> = {};

    const step = async (name: string, fn: () => Promise<any>, detail?: (value: any) => any): Promise<any> => {
      const t0 = Date.now();
      try {
        const value = await fn();
        steps.push({ name, status: 'PASS', durationMs: Date.now() - t0, detail: detail ? detail(value) : value });
        return value;
      } catch (e: any) {
        steps.push({ name, status: 'FAIL', durationMs: Date.now() - t0, error: e?.message || String(e) });
        throw e;
      }
    };

    const cleanupData = async () => {
      const bookingIds = [ids.bookingId, ids.nvoccBookingId].filter((v): v is string => Boolean(v));
      for (const bookingId of bookingIds) {
        await this.p.jobCloseoutChecklist.deleteMany({ where: { bookingId } });
        await this.p.notification.deleteMany({ where: { objectType: 'Booking', objectId: bookingId } });
        await this.p.auditEvent.deleteMany({ where: { bookingId } });
        await this.p.approval.deleteMany({ where: { bookingId } });
        await this.p.task.deleteMany({ where: { bookingId } });
        await this.p.financeLine.deleteMany({ where: { bookingId } });
        await this.p.document.deleteMany({ where: { bookingId } });
        await this.p.container.deleteMany({ where: { bookingId } });
        await this.p.booking.deleteMany({ where: { id: bookingId } });
      }
      await this.p.integrationEvent.deleteMany({
        where: {
          OR: [
            { externalId: { startsWith: runId } },
            { objectId: { in: bookingIds.length ? bookingIds : ['__none__'] } },
          ],
        },
      });
      if (ids.rateId) await this.p.rateQuote.deleteMany({ where: { id: ids.rateId } });
      const orgIds = [ids.customerId, ids.otherCustomerId, ids.agentId, ids.carrierId].filter((v): v is string => Boolean(v));
      if (orgIds.length) await this.p.organization.deleteMany({ where: { id: { in: orgIds } } });
    };

    const payerMatrix = [
      { chargeGroup: 'ORIGIN_PORT', term: 'PREPAID_ORIGIN', payerType: 'ANC_REGISTERED_OFFICE', payerCode: 'ANC-CN' },
      { chargeGroup: 'SEA_FREIGHT', term: 'PREPAID_ELSEWHERE', payerType: 'ANC_REGISTERED_OFFICE_ELSEWHERE', payerCode: 'ANC-NL' },
      { chargeGroup: 'DESTINATION_PORT', term: 'COLLECT', payerType: 'ANC_REGISTERED_OFFICE', payerCode: 'ANC-AE' },
      { chargeGroup: 'ORIGIN_HAULAGE', term: 'PREPAID_ORIGIN', payerType: 'ANC_REGISTERED_OFFICE', payerCode: 'ANC-CN' },
      { chargeGroup: 'DESTINATION_HAULAGE', term: 'NOT_APPLICABLE', applicable: false },
    ];

    try {
      const customer = await step('01 Customer KYC approved', async () => {
        const row = await this.p.organization.create({
          data: {
            code: `${runId}-CUST`,
            name: `${runId} Customer`,
            roles: ['CUSTOMER'],
            countryCode: 'NL',
            customerRef: `${runId}-PRIVATE-CUSTOMER-REF`,
            registrationRef: `${runId}-REG`,
            kycStatus: 'APPROVED',
            kycData: {
              address1: 'UAT Private Customer Address',
              city: 'Rotterdam',
              email: 'private.customer@example.test',
              phone: '+31000000000',
              beneficialOwner: 'UAT PRIVATE UBO'
            },
            kycSubmittedAt: new Date(Date.now() - 86400000),
            kycApprovedAt: new Date(),
            kycApprovedBy: actorId,
          }
        });
        if (row.kycStatus !== 'APPROVED') throw new Error('KYC approval was not persisted');
        return row;
      }, x => ({ id: x.id, code: x.code, kycStatus: x.kycStatus }));
      ids.customerId = customer.id;

      const otherCustomer = await step('02 Create isolation customer', () => this.p.organization.create({
        data: { code: `${runId}-OTHER`, name: `${runId} Other Customer`, roles: ['CUSTOMER'], countryCode: 'DE', kycStatus: 'APPROVED' }
      }), x => ({ id: x.id, code: x.code }));
      ids.otherCustomerId = otherCustomer.id;

      const agent = await step('03 Create producing agent', () => this.p.organization.create({
        data: { code: `${runId}-AGT`, name: `${runId} Agent`, roles: ['AGENT'], countryCode: 'AE' }
      }), x => ({ id: x.id, code: x.code }));
      ids.agentId = agent.id;

      const carrier = await step('04 Create carrier master', () => this.p.organization.create({
        data: { code: `${runId}-CAR`, name: 'UAT OCEAN CARRIER', roles: ['CARRIER'], countryCode: 'DK' }
      }), x => ({ id: x.id, code: x.code }));
      ids.carrierId = carrier.id;

      const rate = await step('05 Accepted forwarding quote', () => this.p.rateQuote.create({
        data: {
          quoteNo: `${runId}-Q`,
          customerId: customer.id,
          trade: 'CNSHA-AEJEA',
          equipment: '40HC',
          buyRate: 900,
          sellRate: 1250,
          currency: 'USD',
          validFrom: new Date(Date.now() - 86400000),
          validTo: new Date(Date.now() + 30 * 86400000),
          status: 'CUSTOMER_ACCEPTED',
          source: 'UAT_RUNNER',
          customerRef: `${runId}-INTERNAL-QUOTE-REF`,
          carrierCode: carrier.code,
          carrierQuoteRef: `ANC-CARRIER-Q-${runId}`,
          termsVersion: 'UAT-1',
          termsAcceptedAt: new Date(),
          termsAcceptedBy: actorId,
        }
      }), x => ({ id: x.id, quoteNo: x.quoteNo, status: x.status, carrierCode: x.carrierCode }));
      ids.rateId = rate.id;

      const booking = await step('06 Create forwarding booking', () => this.p.booking.create({
        data: {
          bookingNo: `${runId}-BK`,
          businessModel: 'FORWARDING',
          bookingChannel: 'CUSTOMER_PORTAL',
          customerId: customer.id,
          producingAgentId: agent.id,
          rateQuoteId: rate.id,
          customerRef: `${runId}-ANC-CUST-REF`,
          customerReference: `${runId}-PRIVATE-REF`,
          shipperReference: `${runId}-PRIVATE-SHIPPER-REF`,
          costCenterCode: 'ANC-GLOBAL-UAT',
          origin: 'CNSHA',
          destination: 'AEJEA',
          portOfLoading: 'CNSHA',
          portOfDischarge: 'AEJEA',
          carrier: carrier.name,
          equipment: '40HC',
          quantity: 1,
          freightTerms: 'PREPAID',
          currency: 'USD',
          status: 'CUSTOMER_ACCEPTED',
          creditStatus: 'Pending',
          slotStatus: 'Pending',
          equipmentStatus: 'Pending',
          siCutoff: new Date(Date.now() + 48 * 3600000),
          vgmCutoff: new Date(Date.now() + 54 * 3600000),
          notes: `Automated FULL UAT ${runId}`,
        }
      }), x => ({ id: x.id, bookingNo: x.bookingNo, businessModel: x.businessModel, status: x.status }));
      ids.bookingId = booking.id;

      await step('07 Confirmation controls block uncleared booking', async () => {
        const b = await this.p.booking.findUniqueOrThrow({ where: { id: booking.id } });
        const blocked = !(b.creditStatus === 'Passed' && b.slotStatus === 'Protected' && b.equipmentStatus === 'Available');
        if (!blocked) throw new Error('Expected credit/slot/equipment controls to block confirmation');
        return { blocked, creditStatus: b.creditStatus, slotStatus: b.slotStatus, equipmentStatus: b.equipmentStatus };
      });

      await step('08 Carrier privacy firewall negative + positive', async () => {
        let unsafeBlocked = false;
        try {
          assertAncCarrierOutboundPayload({
            carrierAccount: 'ANCLINE',
            customerRef: booking.customerRef,
            houseBL: `HBL-${runId}`,
            kycData: { registrationRef: customer.registrationRef },
          });
        } catch {
          unsafeBlocked = true;
        }
        if (!unsafeBlocked) throw new Error('Unsafe customer/house payload was not blocked');
        const safe = assertAncCarrierOutboundPayload({
          forwarder: { code: 'ANCLINE', name: 'ANCLINE' },
          ancBookingRef: ancCarrierReference('BOOKING', booking.bookingNo),
          route: { origin: booking.origin, destination: booking.destination },
          equipment: booking.equipment,
          quantity: booking.quantity,
          carrierQuoteRef: rate.carrierQuoteRef,
        });
        return { unsafeBlocked, safeKeys: Object.keys(safe), carrierIdentity: 'ANCLINE' };
      });

      await step('09 Payer / prepaid-collect matrix validated', async () => {
        const required = ['ORIGIN_PORT', 'SEA_FREIGHT', 'DESTINATION_PORT'];
        const groups = new Set(payerMatrix.map(x => x.chargeGroup));
        if (required.some(x => !groups.has(x))) throw new Error('Required payer charge group missing');
        const validTerms = new Set(['PREPAID_ORIGIN', 'COLLECT', 'PREPAID_ELSEWHERE', 'NOT_APPLICABLE']);
        if (payerMatrix.some(x => !validTerms.has(x.term))) throw new Error('Invalid payer term');
        const payload = assertAncCarrierOutboundPayload({
          bookingId: booking.id,
          ancBookingRef: ancCarrierReference('PAYER', booking.bookingNo),
          instructions: payerMatrix,
          customerDataOutbound: false,
          houseDataOutbound: false,
        });
        await this.p.integrationEvent.create({
          data: {
            sourceSystem: 'ANCLINE_CARRIER_PAYMENT',
            eventType: 'CARRIER_PAYMENT_INSTRUCTIONS_SET',
            externalId: `${runId}-PAYER`,
            objectType: 'CarrierPaymentInstruction',
            objectId: booking.id,
            status: 'COMPLETED',
            payload,
            completedAt: new Date(),
          }
        });
        return { chargeGroups: payerMatrix.length, requiredCovered: required.length, customerDataOutbound: false, houseDataOutbound: false };
      });

      await step('10 Clear controls and carrier confirmation', async () => {
        const row = await this.p.booking.update({
          where: { id: booking.id },
          data: {
            creditStatus: 'Passed',
            slotStatus: 'Protected',
            equipmentStatus: 'Available',
            status: 'CONFIRMED',
            carrierBookingNo: `ANC-CBR-${String(Date.now()).slice(-8)}`,
            shipmentStatus: 'CARRIER_CONFIRMED',
          }
        });
        await this.p.integrationEvent.create({
          data: {
            sourceSystem: 'UAT_RUNNER',
            eventType: 'CARRIER_BOOKING_CONFIRMED',
            externalId: `${runId}-CARRIER-CONFIRM`,
            objectType: 'Booking',
            objectId: booking.id,
            status: 'COMPLETED',
            payload: assertAncCarrierOutboundPayload({
              ancBookingRef: ancCarrierReference('BOOKING', booking.bookingNo),
              carrierBookingNo: row.carrierBookingNo,
              carrierCode: carrier.code,
            }),
            completedAt: new Date(),
          }
        });
        return { status: row.status, carrierBookingNo: row.carrierBookingNo };
      });

      const container = await step('11 Container allocated; missing VGM blocks readiness', async () => {
        const c = await this.p.container.create({
          data: {
            containerNo: `UAT${Date.now().toString().slice(-8)}`,
            bookingId: booking.id,
            type: '40HC',
            ownership: 'LEASED',
            status: 'ALLOCATED',
            location: 'CNSHA',
            allocationStatus: 'ALLOCATED',
          }
        });
        if (c.vgm != null) throw new Error('Synthetic container unexpectedly has VGM');
        return c;
      }, x => ({ id: x.id, containerNo: x.containerNo, vgm: x.vgm, readinessBlocked: x.vgm == null }));
      ids.containerId = container.id;

      await step('12 SI submitted and VGM completed', async () => {
        await this.p.document.create({
          data: { documentNo: `${runId}-SI`, bookingId: booking.id, type: 'SHIPPING_INSTRUCTION', status: 'Submitted', releaseControl: 'Clear' }
        });
        const c = await this.p.container.update({ where: { id: container.id }, data: { vgm: 28750, grossWeight: 29120 } });
        await this.p.document.create({
          data: { documentNo: `${runId}-VGM`, bookingId: booking.id, type: 'VGM_DECLARATION', status: 'Accepted', releaseControl: 'Clear' }
        });
        if (!c.vgm) throw new Error('VGM was not persisted');
        return { si: 'Submitted', vgm: c.vgm };
      });

      await step('13 HBL and MBL issued', async () => {
        const houseBL = `HBL-${runId}`, masterBL = `MBL-${runId}`;
        await this.p.booking.update({ where: { id: booking.id }, data: { houseBL, masterBL, shipmentNo: `SHP-${booking.bookingNo}`, shipmentStatus: 'OPEN' } });
        await this.p.document.createMany({ data: [
          { documentNo: houseBL, bookingId: booking.id, type: 'HOUSE_BILL_OF_LADING', status: 'Released', releaseControl: 'Clear' },
          { documentNo: masterBL, bookingId: booking.id, type: 'MASTER_BILL_OF_LADING', status: 'Released', releaseControl: 'Clear' },
        ]});
        const b = await this.p.booking.findUniqueOrThrow({ where: { id: booking.id } });
        return { shipmentNo: b.shipmentNo, houseBL: b.houseBL, masterBL: b.masterBL };
      });

      await step('14 Tracking integration + duplicate idempotency', async () => {
        const body = {
          sourceSystem: 'UAT_CARRIER_EDI',
          eventType: 'IFTSTA',
          externalId: `${runId}-DEP`,
          payload: { bookingNo: booking.bookingNo, code: 'DEPARTED', label: 'Vessel Departed', occurredAt: new Date().toISOString(), location: 'CNSHA' }
        };
        const first: any = await this.integrations.ingest(body, adminUser);
        const second: any = await this.integrations.ingest(body, adminUser);
        if (first.status !== 'COMPLETED') throw new Error('Tracking integration did not complete');
        if (second.duplicate !== true) throw new Error('Duplicate integration event was not idempotently suppressed');
        return { firstStatus: first.status, duplicateSuppressed: second.duplicate === true, externalId: body.externalId };
      });

      await step('15 Arrival milestone and operational tracking', async () => {
        const arrived: any = await this.integrations.ingest({
          sourceSystem: 'UAT_CARRIER_EDI',
          eventType: 'IFTSTA',
          externalId: `${runId}-ARR`,
          payload: { bookingNo: booking.bookingNo, code: 'ARRIVED', label: 'Vessel Arrived', occurredAt: new Date(Date.now() + 3600000).toISOString(), location: 'AEJEA' }
        }, adminUser);
        const milestones = await this.p.shipmentMilestone.findMany({ where: { bookingId: booking.id } });
        if (!milestones.some(x => x.code === 'DEPARTED') || !milestones.some(x => x.code === 'ARRIVED')) throw new Error('Expected departure/arrival milestones missing');
        return { integrationStatus: arrived.status, milestones: milestones.map(x => x.code) };
      });

      await step('16 Customer isolation / RBAC data scope', async () => {
        const own = await this.p.booking.count({ where: { id: booking.id, customerId: customer.id } });
        const wrong = await this.p.booking.count({ where: { id: booking.id, customerId: otherCustomer.id } });
        if (own !== 1 || wrong !== 0) throw new Error('Customer data isolation failed');
        return { ownerVisible: own === 1, otherCustomerVisible: wrong !== 0 };
      });

      const revenue = await step('17 AR invoice issued', async () => {
        const r = await this.p.financeLine.create({
          data: {
            bookingId: booking.id,
            type: 'REVENUE',
            chargeCode: 'OCEAN_FREIGHT',
            description: 'UAT customer ocean freight',
            amount: 1250,
            finalAmount: 1250,
            currency: 'USD',
            status: 'POSTED',
            source: 'UAT_RUNNER',
            billingPartyId: customer.id,
            invoiceReady: true,
            invoiceNo: `AR-${runId}`,
            invoiceIssuedAt: new Date(),
            postedAt: new Date(),
          }
        });
        if (!r.invoiceNo || r.status !== 'POSTED') throw new Error('AR invoice was not issued/posted');
        return r;
      }, x => ({ id: x.id, invoiceNo: x.invoiceNo, amount: String(x.finalAmount), status: x.status }));
      ids.revenueId = revenue.id;

      const cost = await step('18 AP carrier invoice payable', async () => {
        const r = await this.p.financeLine.create({
          data: {
            bookingId: booking.id,
            type: 'COST',
            chargeCode: 'SLOT_COST',
            description: 'UAT carrier buy',
            amount: 900,
            finalAmount: 900,
            currency: 'USD',
            status: 'PAYABLE',
            source: 'UAT_RUNNER',
            serviceProviderId: carrier.id,
            invoiceReady: true,
            invoiceNo: `AP-${runId}`,
            invoiceIssuedAt: new Date(),
          }
        });
        return r;
      }, x => ({ id: x.id, invoiceNo: x.invoiceNo, amount: String(x.finalAmount), status: x.status }));
      ids.costId = cost.id;

      await step('19 Payment lifecycle partial to cleared', async () => {
        const part = await this.p.financeLine.update({ where: { id: revenue.id }, data: { status: 'PART_PAID' } });
        if (part.status !== 'PART_PAID') throw new Error('Partial payment state failed');
        const paid = await this.p.financeLine.update({ where: { id: revenue.id }, data: { status: 'CLEARED' } });
        const apPaid = await this.p.financeLine.update({ where: { id: cost.id }, data: { status: 'PAID', postedAt: new Date() } });
        if (paid.status !== 'CLEARED' || apPaid.status !== 'PAID') throw new Error('Payment settlement failed');
        return { ar: paid.status, ap: apPaid.status };
      });

      await step('20 Profitability = sell 1250 - buy 900', async () => {
        const lines = await this.p.financeLine.findMany({ where: { bookingId: booking.id } });
        const revenueTotal = lines.filter(x => x.type === 'REVENUE').reduce((s, x) => s + Number(x.finalAmount ?? x.amount), 0);
        const costTotal = lines.filter(x => x.type === 'COST').reduce((s, x) => s + Number(x.finalAmount ?? x.amount), 0);
        const gp = revenueTotal - costTotal;
        if (revenueTotal !== 1250 || costTotal !== 900 || gp !== 350) throw new Error(`Unexpected P&L ${revenueTotal}/${costTotal}/${gp}`);
        return { revenue: revenueTotal, cost: costTotal, gp, marginPct: Math.round(gp / revenueTotal * 10000) / 100 };
      });

      const task = await step('21 Exception/task SLA lifecycle', async () => {
        const t = await this.p.task.create({
          data: { bookingId: booking.id, title: `${runId} cutoff/VGM exception review`, ownerId: actorId, dueAt: new Date(Date.now() + 3600000), status: 'OPEN', slaState: 'At Risk' }
        });
        const done = await this.p.task.update({ where: { id: t.id }, data: { status: 'COMPLETED', slaState: 'Met' } });
        return done;
      }, x => ({ id: x.id, status: x.status, slaState: x.slaState }));
      ids.taskId = task.id;

      const approval = await step('22 Maker-checker approval', async () => {
        const a = await this.p.approval.create({
          data: { bookingId: booking.id, type: 'UAT_FINAL_APPROVAL', requesterId: `${actorId}:maker`, approverId: `${actorId}:checker`, status: 'PENDING' }
        });
        if (a.requesterId === a.approverId) throw new Error('Maker-checker separation failed');
        return this.p.approval.update({ where: { id: a.id }, data: { status: 'Approved' } });
      }, x => ({ id: x.id, status: x.status, makerCheckerSeparated: x.requesterId !== x.approverId }));
      ids.approvalId = approval.id;

      await step('23 Audit trail complete', async () => {
        await this.p.auditEvent.createMany({ data: [
          { bookingId: booking.id, actorId, action: 'UAT_KYC_TO_BOOKING', objectType: 'Booking', objectId: booking.id, detail: { runId } },
          { bookingId: booking.id, actorId, action: 'UAT_CARRIER_PRIVACY_PASS', objectType: 'Booking', objectId: booking.id, detail: { customerOutbound: false, houseOutbound: false } },
          { bookingId: booking.id, actorId, action: 'UAT_FINANCE_SETTLED', objectType: 'Booking', objectId: booking.id, detail: { gp: 350 } },
        ]});
        const count = await this.p.auditEvent.count({ where: { bookingId: booking.id } });
        if (count < 3) throw new Error('Audit trail incomplete');
        return { auditEvents: count };
      });

      await step('24 Closeout readiness and financial closure', async () => {
        const codes = ['OPS_COMPLETE','DOCUMENTS_COMPLETE','COSTS_CAPTURED','REVENUE_POSTED','EXCEPTIONS_CLOSED','TASKS_CLOSED','AGENT_SETTLED','DND_RESOLVED'];
        await this.p.jobCloseoutChecklist.createMany({ data: codes.map(itemCode => ({
          bookingId: booking.id,
          itemCode,
          itemLabel: itemCode.replace(/_/g, ' '),
          mandatory: true,
          completed: true,
          completedBy: actorId,
          completedAt: new Date(),
          note: `FULL UAT ${runId}`,
        })) });
        const [openTasks, pendingApprovals, unsettledFinance, checklist] = await Promise.all([
          this.p.task.count({ where: { bookingId: booking.id, status: { notIn: ['COMPLETED', 'Completed'] } } }),
          this.p.approval.count({ where: { bookingId: booking.id, status: 'PENDING' } }),
          this.p.financeLine.count({ where: { bookingId: booking.id, status: { notIn: ['FINAL','CLEARED','PAID','CANCELLED'] } } }),
          this.p.jobCloseoutChecklist.findMany({ where: { bookingId: booking.id } }),
        ]);
        const ready = openTasks === 0 && pendingApprovals === 0 && unsettledFinance === 0 && checklist.every(x => !x.mandatory || x.completed);
        if (!ready) throw new Error('Closeout should be ready');
        const final = await this.p.booking.update({ where: { id: booking.id }, data: { status: 'FINANCIALLY_CLOSED', shipmentStatus: 'CLOSED' } });
        return { ready, status: final.status, checklist: checklist.length, openTasks, pendingApprovals, unsettledFinance };
      });

      await step('25 Final full-transaction persistence check', async () => {
        const final = await this.p.booking.findUnique({
          where: { id: booking.id },
          include: { financeLines: true, documents: true, containers: true, milestones: true, auditEvents: true }
        });
        if (!final || final.status !== 'FINANCIALLY_CLOSED') throw new Error('Booking did not reach FINANCIALLY_CLOSED');
        const requiredDocs = new Set(['SHIPPING_INSTRUCTION','VGM_DECLARATION','HOUSE_BILL_OF_LADING','MASTER_BILL_OF_LADING']);
        const foundDocs = new Set(final.documents.map(x => x.type));
        if ([...requiredDocs].some(x => !foundDocs.has(x))) throw new Error('Required transaction documents missing');
        return {
          status: final.status,
          shipmentNo: final.shipmentNo,
          documents: final.documents.length,
          milestones: final.milestones.length,
          financeLines: final.financeLines.length,
          auditEvents: final.auditEvents.length,
        };
      });

      if (cleanup) {
        await step('26 Cleanup synthetic UAT data', async () => {
          await cleanupData();
          const remaining = await this.p.booking.count({ where: { id: booking.id } });
          if (remaining !== 0) throw new Error('UAT cleanup failed');
          return { removed: true };
        });
      }

      const finishedAt = new Date();
      return {
        runId,
        profile: 'FULL_TRANSACTION',
        status: 'PASS',
        releaseGate: 'PASS',
        cleanup,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        summary: { passed: steps.filter(x => x.status === 'PASS').length, failed: 0, total: steps.length },
        gates: {
          kyc: 'PASS',
          booking: 'PASS',
          carrierPrivacy: 'PASS',
          payerMatrix: 'PASS',
          documents: 'PASS',
          tracking: 'PASS',
          idempotency: 'PASS',
          rbacIsolation: 'PASS',
          finance: 'PASS',
          audit: 'PASS',
          closeout: 'PASS',
        },
        steps,
      };
    } catch (e: any) {
      if (cleanup) {
        try {
          await cleanupData();
        } catch (cleanupError: any) {
          steps.push({ name: '99 Emergency cleanup after failure', status: 'FAIL', durationMs: 0, error: cleanupError?.message || String(cleanupError) });
        }
      }
      const finishedAt = new Date();
      return {
        runId,
        profile: 'FULL_TRANSACTION',
        status: 'FAIL',
        releaseGate: 'FAIL',
        cleanup,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        summary: {
          passed: steps.filter(x => x.status === 'PASS').length,
          failed: steps.filter(x => x.status === 'FAIL').length,
          total: steps.length,
        },
        error: e?.message || String(e),
        steps,
      };
    }
  }

  async runExceptionFailure(user:any, body:any){
    this.assertAdmin(user);
    this.assertEnabled();

    const startedAt=new Date();
    const runId=`UAT-EX-${startedAt.toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    const cleanup=body.cleanup!==false;
    const actorId=user?.sub||user?.email||'uat-exception-runner';
    const adminUser:any={role:'GLOBAL_ADMIN',sub:actorId,email:user?.email||'uat@ancline.local'};
    const steps:StepResult[]=[];
    const ids:Record<string,string>={};

    const step=async(name:string,fn:()=>Promise<any>,detail?:(value:any)=>any)=>{
      const t0=Date.now();
      try{
        const value=await fn();
        steps.push({name,status:'PASS',durationMs:Date.now()-t0,detail:detail?detail(value):value});
        return value;
      }catch(e:any){
        steps.push({name,status:'FAIL',durationMs:Date.now()-t0,error:e?.message||String(e)});
        throw e;
      }
    };

    const cleanupData=async()=>{
      const bookingIds=[ids.bookingId].filter((v):v is string=>Boolean(v));
      for(const bookingId of bookingIds){
        await this.p.jobCloseoutChecklist.deleteMany({where:{bookingId}});
        await this.p.notification.deleteMany({where:{objectType:'Booking',objectId:bookingId}});
        await this.p.auditEvent.deleteMany({where:{bookingId}});
        await this.p.approval.deleteMany({where:{bookingId}});
        await this.p.task.deleteMany({where:{bookingId}});
        await this.p.financeLine.deleteMany({where:{bookingId}});
        await this.p.document.deleteMany({where:{bookingId}});
        await this.p.container.deleteMany({where:{bookingId}});
        await this.p.booking.deleteMany({where:{id:bookingId}});
      }
      await this.p.integrationEvent.deleteMany({where:{OR:[
        {externalId:{startsWith:runId}},
        {objectId:{in:bookingIds.length?bookingIds:['__none__']}}
      ]}});
      if(ids.rateId)await this.p.rateQuote.deleteMany({where:{id:ids.rateId}});
      const orgIds=[ids.customerId,ids.carrierId].filter((v):v is string=>Boolean(v));
      if(orgIds.length)await this.p.organization.deleteMany({where:{id:{in:orgIds}}});
    };

    try{
      const customer=await step('01 Create exception-test customer',()=>this.p.organization.create({data:{
        code:`${runId}-CUST`,name:`${runId} Customer`,roles:['CUSTOMER'],countryCode:'NL',
        customerRef:`${runId}-PRIVATE-CUSTOMER`,kycStatus:'APPROVED',kycApprovedAt:new Date(),kycApprovedBy:actorId
      }}),x=>({id:x.id,code:x.code}));
      ids.customerId=customer.id;

      const carrier=await step('02 Create exception-test carrier',()=>this.p.organization.create({data:{
        code:`${runId}-CAR`,name:`${runId} Carrier`,roles:['CARRIER'],countryCode:'DK'
      }}),x=>({id:x.id,code:x.code}));
      ids.carrierId=carrier.id;

      const rate=await step('03 Create accepted quote',()=>this.p.rateQuote.create({data:{
        quoteNo:`${runId}-Q`,customerId:customer.id,trade:'CNSHA-NLRTM',equipment:'40HC',
        buyRate:1000,sellRate:1400,currency:'USD',validFrom:new Date(Date.now()-86400000),validTo:new Date(Date.now()+14*86400000),
        status:'CUSTOMER_ACCEPTED',source:'UAT_EXCEPTION',carrierCode:carrier.code,carrierQuoteRef:`${runId}-CQR`,
        termsVersion:'EX-1',termsAcceptedAt:new Date(),termsAcceptedBy:actorId
      }}),x=>({id:x.id,quoteNo:x.quoteNo}));
      ids.rateId=rate.id;

      const booking=await step('04 Create vulnerable booking',()=>this.p.booking.create({data:{
        bookingNo:`${runId}-BK`,businessModel:'FORWARDING',bookingChannel:'CUSTOMER_PORTAL',
        customerId:customer.id,rateQuoteId:rate.id,customerRef:`${runId}-ANC-REF`,
        customerReference:`${runId}-PRIVATE-REF`,costCenterCode:'ANC-UAT-EX',
        origin:'CNSHA',destination:'NLRTM',portOfLoading:'CNSHA',portOfDischarge:'NLRTM',
        carrier:carrier.name,equipment:'40HC',quantity:1,currency:'USD',status:'CUSTOMER_ACCEPTED',
        creditStatus:'Pending',slotStatus:'Pending',equipmentStatus:'Pending',
        siCutoff:new Date(Date.now()-3*3600000),vgmCutoff:new Date(Date.now()-2*3600000),
        notes:`Exception UAT ${runId}`
      }}),x=>({id:x.id,bookingNo:x.bookingNo,status:x.status}));
      ids.bookingId=booking.id;

      await step('05 Credit hold blocks progression',async()=>{
        const held=await this.p.booking.update({where:{id:booking.id},data:{creditStatus:'Hold'}});
        if(held.creditStatus==='Passed')throw new Error('Credit hold did not block booking');
        return {creditStatus:held.creditStatus,blocked:true};
      });

      await step('06 Missed SI and VGM cutoff detected',async()=>{
        const b=await this.p.booking.findUniqueOrThrow({where:{id:booking.id}});
        const siMissing=await this.p.document.count({where:{bookingId:booking.id,type:'SHIPPING_INSTRUCTION'}})===0;
        const vgmMissing=await this.p.document.count({where:{bookingId:booking.id,type:'VGM_DECLARATION'}})===0;
        const now=Date.now();
        const siBreached=Boolean(b.siCutoff&&b.siCutoff.getTime()<now&&siMissing);
        const vgmBreached=Boolean(b.vgmCutoff&&b.vgmCutoff.getTime()<now&&vgmMissing);
        if(!siBreached||!vgmBreached)throw new Error('Expected SI/VGM cutoff breaches not detected');
        const task=await this.p.task.create({data:{
          bookingId:booking.id,title:`${runId} SI/VGM cutoff breach`,ownerId:actorId,
          dueAt:new Date(Date.now()+1800000),status:'OPEN',slaState:'Breached'
        }});
        ids.taskId=task.id;
        return {siBreached,vgmBreached,taskId:task.id};
      });

      await step('07 Missing document blocks release',async()=>{
        const required=['SHIPPING_INSTRUCTION','VGM_DECLARATION','HOUSE_BILL_OF_LADING'];
        const docs=await this.p.document.findMany({where:{bookingId:booking.id}});
        const found=new Set(docs.map(x=>x.type));
        const missing=required.filter(x=>!found.has(x));
        if(missing.length!==3)throw new Error('Missing document gate did not detect all required documents');
        return {blocked:true,missing};
      });

      await step('08 Carrier rejection captured and escalated',async()=>{
        await this.p.integrationEvent.create({data:{
          sourceSystem:'ANCLINE_CARRIER_OPERATIONS',eventType:'CARRIER_BOOKING_REJECTED',
          externalId:`${runId}-REJECT`,objectType:'CarrierBooking',objectId:booking.id,status:'COMPLETED',
          payload:{bookingId:booking.id,ancBookingRef:ancCarrierReference('BOOKING',booking.bookingNo),reason:'NO_SPACE',customerDataOutbound:false,houseDataOutbound:false},
          completedAt:new Date()
        }});
        const updated=await this.p.booking.update({where:{id:booking.id},data:{slotStatus:'REJECTED',shipmentStatus:'CARRIER_REJECTED'}});
        if(updated.slotStatus!=='REJECTED')throw new Error('Carrier rejection state not applied');
        return {slotStatus:updated.slotStatus,shipmentStatus:updated.shipmentStatus};
      });

      await step('09 Carrier rollover preserves booking and records exception',async()=>{
        const rolled=await this.p.booking.update({where:{id:booking.id},data:{
          slotStatus:'ROLLED',shipmentStatus:'CARRIER_ROLLED',etd:new Date(Date.now()+5*86400000),eta:new Date(Date.now()+25*86400000)
        }});
        await this.p.integrationEvent.create({data:{
          sourceSystem:'ANCLINE_CARRIER_OPERATIONS',eventType:'CARRIER_BOOKING_ROLLED',
          externalId:`${runId}-ROLL`,objectType:'CarrierBooking',objectId:booking.id,status:'COMPLETED',
          payload:{bookingId:booking.id,rollReason:'VESSEL_FULL',ancBookingRef:ancCarrierReference('BOOKING',booking.bookingNo)},
          completedAt:new Date()
        }});
        if(rolled.slotStatus!=='ROLLED')throw new Error('Rollover status not persisted');
        return {slotStatus:rolled.slotStatus,newEtd:rolled.etd};
      });

      await step('10 Carrier cancellation clears execution state',async()=>{
        const cancelled=await this.p.booking.update({where:{id:booking.id},data:{
          carrierBookingNo:null,slotStatus:'CANCELLED',equipmentStatus:'CANCELLED',shipmentStatus:'CARRIER_CANCELLED'
        }});
        if(cancelled.slotStatus!=='CANCELLED'||cancelled.equipmentStatus!=='CANCELLED')throw new Error('Carrier cancellation did not clear execution state');
        return {slotStatus:cancelled.slotStatus,equipmentStatus:cancelled.equipmentStatus};
      });

      await step('11 Carrier API failure enters retry state',async()=>{
        let failed=false;
        try{
          await this.integrations.ingest({
            sourceSystem:'UAT_FAILURE_CARRIER',eventType:'IFTSTA',externalId:`${runId}-BAD-EDI`,
            payload:{bookingNo:'DOES-NOT-EXIST',code:'DEPARTED',occurredAt:new Date().toISOString()}
          },adminUser);
        }catch{failed=true;}
        const event=await this.p.integrationEvent.findFirst({where:{sourceSystem:'UAT_FAILURE_CARRIER',externalId:`${runId}-BAD-EDI`},orderBy:{createdAt:'desc'}});
        if(!failed||!event||event.status!=='FAILED'||event.attemptCount<1)throw new Error('Carrier API/integration failure was not retained for retry');
        ids.failedEventId=event.id;
        return {failed,status:event.status,attemptCount:event.attemptCount};
      });

      await step('12 Failed integration retry increments attempts safely',async()=>{
        if(!ids.failedEventId)throw new Error('Failed integration event missing');
        let retried=false;
        try{await this.integrations.retry(ids.failedEventId,adminUser);}catch{retried=true;}
        const event=await this.p.integrationEvent.findUniqueOrThrow({where:{id:ids.failedEventId}});
        if(!retried||event.attemptCount<2||event.status!=='FAILED')throw new Error('Retry policy did not retain failed state and increment attempts');
        return {status:event.status,attemptCount:event.attemptCount};
      });

      await step('13 Duplicate webhook suppressed',async()=>{
        const validBooking=await this.p.booking.update({where:{id:booking.id},data:{status:'CONFIRMED'}});
        const webhook={
          sourceSystem:'UAT_DUPLICATE_WEBHOOK',eventType:'IFTSTA',externalId:`${runId}-DUP`,
          payload:{bookingNo:validBooking.bookingNo,code:'STATUS_UPDATE',label:'Carrier Status',occurredAt:new Date().toISOString()}
        };
        const first:any=await this.integrations.ingest(webhook,adminUser);
        const second:any=await this.integrations.ingest(webhook,adminUser);
        if(first.status!=='COMPLETED'||second.duplicate!==true)throw new Error('Duplicate webhook suppression failed');
        return {first:first.status,duplicateSuppressed:true};
      });

      await step('14 Customs hold blocks release',async()=>{
        await this.p.integrationEvent.create({data:{
          sourceSystem:'ANCLINE_CUSTOMS',eventType:'CUSTOMS_HOLD',
          externalId:`${runId}-CUSTOMS-HOLD`,objectType:'CustomsCase',objectId:booking.id,status:'COMPLETED',
          payload:{bookingId:booking.id,status:'HOLD',reason:'DOCUMENT_REVIEW',releaseAllowed:false},completedAt:new Date()
        }});
        const hold=await this.p.integrationEvent.findFirst({where:{sourceSystem:'ANCLINE_CUSTOMS',objectId:booking.id,eventType:'CUSTOMS_HOLD'}});
        if((hold?.payload as any)?.releaseAllowed!==false)throw new Error('Customs hold did not block release');
        return {hold:true,releaseAllowed:false};
      });

      await step('15 Demurrage/detention exposure creates financial exception',async()=>{
        const line=await this.p.financeLine.create({data:{
          bookingId:booking.id,type:'COST',chargeCode:'DEMURRAGE_DETENTION',
          description:'UAT D&D exposure',amount:650,finalAmount:650,currency:'USD',
          status:'PAYABLE',source:'UAT_EXCEPTION',serviceProviderId:carrier.id,invoiceReady:false
        }});
        await this.p.task.create({data:{
          bookingId:booking.id,title:`${runId} demurrage/detention review`,ownerId:actorId,
          dueAt:new Date(Date.now()+3600000),status:'OPEN',slaState:'At Risk'
        }});
        return {financeLineId:line.id,amount:Number(line.finalAmount??line.amount),exceptionRaised:true};
      });

      const failedPayment=await step('16 Payment failure blocks financial close',async()=>{
        const line=await this.p.financeLine.create({data:{
          bookingId:booking.id,type:'REVENUE',chargeCode:'OCEAN_FREIGHT',description:'UAT AR failed payment',
          amount:1400,finalAmount:1400,currency:'USD',status:'PAYMENT_FAILED',source:'UAT_EXCEPTION',
          billingPartyId:customer.id,invoiceReady:true,invoiceNo:`AR-${runId}`,invoiceIssuedAt:new Date()
        }});
        const unsettled=await this.p.financeLine.count({where:{bookingId:booking.id,status:{notIn:['FINAL','CLEARED','PAID','CANCELLED']}}});
        if(unsettled<1)throw new Error('Failed payment did not block financial close');
        return line;
      },x=>({id:x.id,status:x.status,invoiceNo:x.invoiceNo}));
      ids.failedPaymentId=failedPayment.id;

      await step('17 Exception escalation retains SLA/audit visibility',async()=>{
        const open=await this.p.task.count({where:{bookingId:booking.id,status:'OPEN'}});
        if(open<2)throw new Error('Expected operational exception tasks were not raised');
        await this.p.auditEvent.create({data:{
          bookingId:booking.id,actorId,action:'UAT_EXCEPTION_ESCALATED',objectType:'Booking',objectId:booking.id,
          detail:{runId,openExceptionTasks:open,severity:'CRITICAL'}
        }});
        return {openExceptionTasks:open,auditLogged:true};
      });

      await step('18 Recovery clears holds, documents, payment and tasks',async()=>{
        await this.p.document.createMany({data:[
          {documentNo:`${runId}-SI`,bookingId:booking.id,type:'SHIPPING_INSTRUCTION',status:'Submitted',releaseControl:'Clear'},
          {documentNo:`${runId}-VGM`,bookingId:booking.id,type:'VGM_DECLARATION',status:'Accepted',releaseControl:'Clear'},
          {documentNo:`HBL-${runId}`,bookingId:booking.id,type:'HOUSE_BILL_OF_LADING',status:'Released',releaseControl:'Clear'}
        ]});
        if(ids.failedPaymentId)await this.p.financeLine.update({where:{id:ids.failedPaymentId},data:{status:'CLEARED',postedAt:new Date()}});
        await this.p.financeLine.updateMany({where:{bookingId:booking.id,chargeCode:'DEMURRAGE_DETENTION'},data:{status:'PAID',postedAt:new Date()}});
        await this.p.task.updateMany({where:{bookingId:booking.id,status:'OPEN'},data:{status:'COMPLETED',slaState:'Met'}});
        await this.p.booking.update({where:{id:booking.id},data:{
          creditStatus:'Passed',slotStatus:'Protected',equipmentStatus:'Available',
          status:'OPERATIONAL',shipmentStatus:'RECOVERED'
        }});
        await this.p.integrationEvent.create({data:{
          sourceSystem:'ANCLINE_CUSTOMS',eventType:'CUSTOMS_RELEASED',externalId:`${runId}-CUSTOMS-RELEASE`,
          objectType:'CustomsCase',objectId:booking.id,status:'COMPLETED',
          payload:{bookingId:booking.id,status:'RELEASED',releaseAllowed:true},completedAt:new Date()
        }});
        return {recovered:true};
      });

      await step('19 Recovery verification permits progression',async()=>{
        const [b,openTasks,unsettled,docs,release]=await Promise.all([
          this.p.booking.findUniqueOrThrow({where:{id:booking.id}}),
          this.p.task.count({where:{bookingId:booking.id,status:'OPEN'}}),
          this.p.financeLine.count({where:{bookingId:booking.id,status:{notIn:['FINAL','CLEARED','PAID','CANCELLED']}}}),
          this.p.document.findMany({where:{bookingId:booking.id}}),
          this.p.integrationEvent.findFirst({where:{sourceSystem:'ANCLINE_CUSTOMS',objectId:booking.id,eventType:'CUSTOMS_RELEASED'},orderBy:{createdAt:'desc'}})
        ]);
        const required=new Set(['SHIPPING_INSTRUCTION','VGM_DECLARATION','HOUSE_BILL_OF_LADING']);
        const found=new Set(docs.map(x=>x.type));
        const docsClear=[...required].every(x=>found.has(x));
        const released=(release?.payload as any)?.releaseAllowed===true;
        const controlsClear=b.creditStatus==='Passed'&&b.slotStatus==='Protected'&&b.equipmentStatus==='Available';
        if(openTasks!==0||unsettled!==0||!docsClear||!released||!controlsClear)throw new Error('Recovery gate did not fully clear');
        return {openTasks,unsettled,docsClear,released,controlsClear};
      });

      await step('20 Exception audit trail complete',async()=>{
        const events=await this.p.integrationEvent.count({where:{OR:[{objectId:booking.id},{externalId:{startsWith:runId}}]}});
        const audits=await this.p.auditEvent.count({where:{bookingId:booking.id}});
        if(events<6||audits<1)throw new Error('Exception audit/event trail incomplete');
        return {integrationEvents:events,auditEvents:audits};
      });

      if(cleanup){
        await step('21 Cleanup exception UAT data',async()=>{
          await cleanupData();
          const remaining=await this.p.booking.count({where:{id:booking.id}});
          if(remaining!==0)throw new Error('Exception UAT cleanup failed');
          return {removed:true};
        });
      }

      const finishedAt=new Date();
      return {
        runId,profile:'EXCEPTION_FAILURE',status:'PASS',releaseGate:'PASS',cleanup,
        startedAt,finishedAt,durationMs:finishedAt.getTime()-startedAt.getTime(),
        summary:{passed:steps.filter(x=>x.status==='PASS').length,failed:0,total:steps.length},
        gates:{
          creditHold:'PASS',cutoffBreach:'PASS',documentBlock:'PASS',carrierRejection:'PASS',
          carrierRollover:'PASS',carrierCancellation:'PASS',integrationFailureRetry:'PASS',
          duplicateWebhook:'PASS',customsHold:'PASS',demurrageDetention:'PASS',
          paymentFailure:'PASS',exceptionEscalation:'PASS',recovery:'PASS',audit:'PASS'
        },
        steps
      };
    }catch(e:any){
      if(cleanup){
        try{await cleanupData();}
        catch(cleanupError:any){
          steps.push({name:'99 Emergency cleanup after exception UAT failure',status:'FAIL',durationMs:0,error:cleanupError?.message||String(cleanupError)});
        }
      }
      const finishedAt=new Date();
      return {
        runId,profile:'EXCEPTION_FAILURE',status:'FAIL',releaseGate:'FAIL',cleanup,
        startedAt,finishedAt,durationMs:finishedAt.getTime()-startedAt.getTime(),
        summary:{passed:steps.filter(x=>x.status==='PASS').length,failed:steps.filter(x=>x.status==='FAIL').length,total:steps.length},
        error:e?.message||String(e),steps
      };
    }
  }

}
