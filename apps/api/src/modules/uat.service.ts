import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
type StepResult = {
  name: string;
  status: 'PASS' | 'FAIL';
  durationMs: number;
  detail?: any;
  error?: string;
};

@Injectable()
export class UatService {
  constructor(private readonly p: PrismaService) {}

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
      scope: 'staging transaction smoke test',
      coverage: [
        'organization', 'rate', 'booking', 'workflow controls', 'container',
        'document', 'finance', 'task', 'approval', 'integration', 'notification',
        'audit trail', 'portal visibility query', 'closeout readiness', 'cleanup'
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
    const steps: StepResult[] = [];
    const ids: Record<string, string> = {};

    const step = async (
      name: string,
      fn: () => Promise<any>,
      detail?: (value: any) => any
    ): Promise<any> => {
      const t0 = Date.now();
      try {
        const value = await fn();
        steps.push({
          name,
          status: 'PASS',
          durationMs: Date.now() - t0,
          detail: detail ? detail(value) : undefined,
        });
        return value;
      } catch (e: any) {
        steps.push({
          name,
          status: 'FAIL',
          durationMs: Date.now() - t0,
          error: e?.message || String(e),
        });
        throw e;
      }
    };

    const cleanupData = async () => {
      const bookingId = ids.bookingId;
      if (bookingId) {
        await this.p.jobCloseoutChecklist.deleteMany({ where: { bookingId } });
        await this.p.integrationEvent.deleteMany({ where: { objectType: 'Booking', objectId: bookingId } });
        await this.p.notification.deleteMany({ where: { objectType: 'Booking', objectId: bookingId } });
        await this.p.auditEvent.deleteMany({ where: { bookingId } });
        await this.p.approval.deleteMany({ where: { bookingId } });
        await this.p.task.deleteMany({ where: { bookingId } });
        await this.p.financeLine.deleteMany({ where: { bookingId } });
        await this.p.document.deleteMany({ where: { bookingId } });
        await this.p.container.deleteMany({ where: { bookingId } });
        await this.p.booking.deleteMany({ where: { id: bookingId } });
      }
      if (ids.rateId) {
        await this.p.rateQuote.deleteMany({ where: { id: ids.rateId } });
      }
      if (ids.customerId || ids.agentId) {
        const orgIds = [ids.customerId, ids.agentId].filter((v): v is string => Boolean(v));
        if (orgIds.length) {
          await this.p.organization.deleteMany({ where: { id: { in: orgIds } } });
        }
      }
    };

    try {
      const customer = await step(
        '01 Create UAT customer',
        () => this.p.organization.create({
          data: {
            code: `${runId}-CUST`,
            name: `${runId} Customer`,
            roles: ['CUSTOMER'],
            countryCode: 'NL',
          },
        }),
        (x) => ({ id: x.id, code: x.code }),
      );
      ids.customerId = customer.id;

      const agent = await step(
        '02 Create UAT producing agent',
        () => this.p.organization.create({
          data: {
            code: `${runId}-AGT`,
            name: `${runId} Agent`,
            roles: ['AGENT'],
            countryCode: 'AE',
          },
        }),
        (x) => ({ id: x.id, code: x.code }),
      );
      ids.agentId = agent.id;

      const rate = await step(
        '03 Create and approve rate',
        async () => {
          const row = await this.p.rateQuote.create({
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
              status: 'VALID',
              source: 'UAT_RUNNER',
            },
          });
          return this.p.rateQuote.update({ where: { id: row.id }, data: { status: 'APPROVED' } });
        },
        (x) => ({ id: x.id, quoteNo: x.quoteNo, status: x.status }),
      );
      ids.rateId = rate.id;

      const booking = await step(
        '04 Create booking',
        () => this.p.booking.create({
          data: {
            bookingNo: `${runId}-BK`,
            customerId: customer.id,
            producingAgentId: agent.id,
            origin: 'CNSHA',
            destination: 'AEJEA',
            carrier: 'UAT CARRIER',
            vesselVoyage: 'UAT-V001',
            equipment: '40HC',
            currency: 'USD',
            status: 'DRAFT',
            creditStatus: 'Pending',
            slotStatus: 'Pending',
            equipmentStatus: 'Pending',
            notes: `Automated UAT ${runId}`,
          },
        }),
        (x) => ({ id: x.id, bookingNo: x.bookingNo, status: x.status }),
      );
      ids.bookingId = booking.id;

      await step('05 Verify confirmation control blocks uncleared booking', async () => {
        const b = await this.p.booking.findUniqueOrThrow({ where: { id: booking.id } });
        const blocked = !(
          b.creditStatus === 'Passed' &&
          b.slotStatus === 'Protected' &&
          b.equipmentStatus === 'Available'
        );
        if (!blocked) throw new Error('Expected booking confirmation controls to block');
        return {
          blocked,
          creditStatus: b.creditStatus,
          slotStatus: b.slotStatus,
          equipmentStatus: b.equipmentStatus,
        };
      });

      await step(
        '06 Clear credit slot equipment controls',
        () => this.p.booking.update({
          where: { id: booking.id },
          data: {
            creditStatus: 'Passed',
            slotStatus: 'Protected',
            equipmentStatus: 'Available',
            status: 'CONFIRMED',
          },
        }),
        (x) => ({
          status: x.status,
          credit: x.creditStatus,
          slot: x.slotStatus,
          equipment: x.equipmentStatus,
        }),
      );

      const container = await step(
        '07 Add booking container',
        () => this.p.container.create({
          data: {
            containerNo: `UAT${Date.now().toString().slice(-8)}`,
            bookingId: booking.id,
            type: '40HC',
            ownership: 'LEASED',
            status: 'ALLOCATED',
            location: 'CNSHA',
          },
        }),
        (x) => ({ id: x.id, containerNo: x.containerNo }),
      );
      ids.containerId = container.id;

      const document = await step(
        '08 Create and release booking document',
        async () => {
          const row = await this.p.document.create({
            data: {
              documentNo: `${runId}-BL`,
              bookingId: booking.id,
              type: 'SEA_WAYBILL',
              status: 'Draft',
              releaseControl: 'Clear',
            },
          });
          return this.p.document.update({ where: { id: row.id }, data: { status: 'Released' } });
        },
        (x) => ({ id: x.id, documentNo: x.documentNo, status: x.status }),
      );
      ids.documentId = document.id;

      const revenue = await step(
        '09 Create revenue line',
        () => this.p.financeLine.create({
          data: {
            bookingId: booking.id,
            type: 'REVENUE',
            chargeCode: 'OCEAN_FREIGHT',
            amount: 1250,
            finalAmount: 1250,
            currency: 'USD',
            status: 'FINAL',
            source: 'UAT_RUNNER',
            billingPartyId: customer.id,
          },
        }),
        (x) => ({ id: x.id, amount: String(x.amount), status: x.status }),
      );
      ids.revenueId = revenue.id;

      const cost = await step(
        '10 Create cost line',
        () => this.p.financeLine.create({
          data: {
            bookingId: booking.id,
            type: 'COST',
            chargeCode: 'SLOT_COST',
            amount: 900,
            finalAmount: 900,
            currency: 'USD',
            status: 'FINAL',
            source: 'UAT_RUNNER',
            serviceProviderId: agent.id,
          },
        }),
        (x) => ({ id: x.id, amount: String(x.amount), status: x.status }),
      );
      ids.costId = cost.id;

      await step('11 Validate booking P&L', async () => {
        const lines = await this.p.financeLine.findMany({ where: { bookingId: booking.id } });
        const revenueTotal = lines
          .filter((x) => x.type === 'REVENUE')
          .reduce((sum, x) => sum + Number(x.finalAmount ?? x.amount), 0);
        const costTotal = lines
          .filter((x) => x.type === 'COST')
          .reduce((sum, x) => sum + Number(x.finalAmount ?? x.amount), 0);
        const gp = revenueTotal - costTotal;
        if (revenueTotal !== 1250 || costTotal !== 900 || gp !== 350) {
          throw new Error(`Unexpected P&L ${revenueTotal}/${costTotal}/${gp}`);
        }
        return { revenue: revenueTotal, cost: costTotal, gp };
      });

      const task = await step(
        '12 Create and complete task',
        async () => {
          const row = await this.p.task.create({
            data: {
              bookingId: booking.id,
              title: `${runId} SI check`,
              ownerId: actorId,
              status: 'OPEN',
            },
          });
          return this.p.task.update({
            where: { id: row.id },
            data: { status: 'COMPLETED', slaState: 'Met' },
          });
        },
        (x) => ({ id: x.id, status: x.status, slaState: x.slaState }),
      );
      ids.taskId = task.id;

      const approval = await step(
        '13 Maker-checker approval',
        async () => {
          const row = await this.p.approval.create({
            data: {
              bookingId: booking.id,
              type: 'UAT_FINAL_APPROVAL',
              requesterId: `${actorId}:maker`,
              approverId: `${actorId}:checker`,
              status: 'PENDING',
            },
          });
          if (row.requesterId === row.approverId) {
            throw new Error('Maker-checker separation failed');
          }
          return this.p.approval.update({ where: { id: row.id }, data: { status: 'Approved' } });
        },
        (x) => ({ id: x.id, status: x.status }),
      );
      ids.approvalId = approval.id;

      const integration = await step(
        '14 Integration event processing',
        async () => {
          const row = await this.p.integrationEvent.create({
            data: {
              sourceSystem: 'UAT_RUNNER',
              eventType: 'BOOKING_STATUS',
              externalId: runId,
              objectType: 'Booking',
              objectId: booking.id,
              status: 'RECEIVED',
              payload: { bookingNo: booking.bookingNo, status: 'CONFIRMED' },
            },
          });
          return this.p.integrationEvent.update({
            where: { id: row.id },
            data: { status: 'COMPLETED', attemptCount: 1, completedAt: new Date() },
          });
        },
        (x) => ({ id: x.id, status: x.status, attemptCount: x.attemptCount }),
      );
      ids.integrationId = integration.id;

      const notification = await step(
        '15 Notification lifecycle',
        async () => {
          const row = await this.p.notification.create({
            data: {
              userId: actorId,
              category: 'UAT',
              title: 'UAT booking confirmed',
              message: booking.bookingNo,
              objectType: 'Booking',
              objectId: booking.id,
              status: 'UNREAD',
            },
          });
          return this.p.notification.update({
            where: { id: row.id },
            data: { status: 'READ', readAt: new Date() },
          });
        },
        (x) => ({ id: x.id, status: x.status }),
      );
      ids.notificationId = notification.id;

      await step('16 Audit trail verification', async () => {
        await this.p.auditEvent.createMany({
          data: [
            {
              bookingId: booking.id,
              actorId,
              action: 'UAT_BOOKING_CREATE',
              objectType: 'Booking',
              objectId: booking.id,
              detail: { runId },
            },
            {
              bookingId: booking.id,
              actorId,
              action: 'UAT_FINANCE_VALIDATE',
              objectType: 'Booking',
              objectId: booking.id,
              detail: { gp: 350 },
            },
            {
              bookingId: booking.id,
              actorId,
              action: 'UAT_APPROVAL_COMPLETE',
              objectType: 'Approval',
              objectId: approval.id,
              detail: { runId },
            },
          ],
        });
        const count = await this.p.auditEvent.count({ where: { bookingId: booking.id } });
        if (count < 3) throw new Error('Audit events missing');
        return { auditEvents: count };
      });

      await step('17 Portal visibility data query', async () => {
        const visible = await this.p.booking.findUnique({
          where: { id: booking.id },
          include: {
            customer: true,
            producingAgent: true,
            containers: true,
            documents: true,
          },
        });
        if (
          !visible ||
          visible.customerId !== customer.id ||
          visible.containers.length !== 1 ||
          visible.documents.length !== 1
        ) {
          throw new Error('Portal booking projection incomplete');
        }
        return {
          bookingNo: visible.bookingNo,
          customer: visible.customer.name,
          containers: visible.containers.length,
          documents: visible.documents.length,
        };
      });

      await step('18 Closeout readiness', async () => {
        const codes = [
          'OPS_COMPLETE',
          'DOCUMENTS_COMPLETE',
          'COSTS_CAPTURED',
          'REVENUE_POSTED',
          'EXCEPTIONS_CLOSED',
          'TASKS_CLOSED',
          'AGENT_SETTLED',
          'DND_RESOLVED',
        ];
        await this.p.jobCloseoutChecklist.createMany({
          data: codes.map((itemCode) => ({
            bookingId: booking.id,
            itemCode,
            itemLabel: itemCode.replace(/_/g, ' '),
            mandatory: true,
            completed: true,
            completedBy: actorId,
            completedAt: new Date(),
            note: `UAT ${runId}`,
          })),
        });

        const [openTasks, pendingApprovals, openFinance, checklist] = await Promise.all([
          this.p.task.count({
            where: { bookingId: booking.id, status: { notIn: ['COMPLETED', 'Completed'] } },
          }),
          this.p.approval.count({
            where: { bookingId: booking.id, status: 'PENDING' },
          }),
          this.p.financeLine.count({
            where: {
              bookingId: booking.id,
              status: { notIn: ['FINAL', 'CLEARED', 'CANCELLED'] },
            },
          }),
          this.p.jobCloseoutChecklist.findMany({ where: { bookingId: booking.id } }),
        ]);

        const ready =
          openTasks === 0 &&
          pendingApprovals === 0 &&
          openFinance === 0 &&
          checklist.every((x) => !x.mandatory || x.completed);
        if (!ready) throw new Error('Closeout should be ready');

        await this.p.booking.update({
          where: { id: booking.id },
          data: { status: 'FINANCIALLY_CLOSED' },
        });
        return {
          ready,
          checklist: checklist.length,
          openTasks,
          pendingApprovals,
          openFinance,
        };
      });

      await step('19 Final persistence verification', async () => {
        const final = await this.p.booking.findUnique({
          where: { id: booking.id },
          include: { financeLines: true, auditEvents: true },
        });
        if (!final || final.status !== 'FINANCIALLY_CLOSED') {
          throw new Error('Booking did not reach FINANCIALLY_CLOSED');
        }
        return {
          status: final.status,
          financeLines: final.financeLines.length,
          auditEvents: final.auditEvents.length,
        };
      });

      if (cleanup) {
        await step('20 Cleanup UAT data', async () => {
          await cleanupData();
          const remaining = await this.p.booking.count({ where: { id: booking.id } });
          if (remaining !== 0) throw new Error('UAT cleanup failed');
          return { removed: true };
        });
      }

      const finishedAt = new Date();
      return {
        runId,
        status: 'PASS',
        cleanup,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        summary: {
          passed: steps.filter((x) => x.status === 'PASS').length,
          failed: 0,
          total: steps.length,
        },
        steps,
      };
    } catch (e: any) {
      if (cleanup) {
        try {
          await cleanupData();
        } catch (cleanupError: any) {
          steps.push({
            name: '99 Emergency cleanup after failure',
            status: 'FAIL',
            durationMs: 0,
            error: cleanupError?.message || String(cleanupError),
          });
        }
      }

      const finishedAt = new Date();
      return {
        runId,
        status: 'FAIL',
        cleanup,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        summary: {
          passed: steps.filter((x) => x.status === 'PASS').length,
          failed: steps.filter((x) => x.status === 'FAIL').length,
          total: steps.length,
        },
        error: e?.message || String(e),
        steps,
      };
    }
  }
}
