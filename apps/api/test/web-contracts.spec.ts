import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const read=(...parts:string[])=>readFileSync(resolve(__dirname,...parts),'utf8');

describe('Web navigation and API contract wiring',()=>{
  it('has a Next.js page for every static WorkspaceShell menu route',()=>{
    const shell=read('../../web/components/WorkspaceShell.tsx');
    const routes=[...shell.matchAll(/\['(\/[^']+)','[^']+'\]/g)].map(x=>x[1]);
    expect(routes.length).toBeGreaterThan(30);
    for(const route of new Set(routes)){
      const page=resolve(__dirname,'../../web/app',route.replace(/^\//,''),'page.tsx');
      expect({route,exists:existsSync(page)}).toEqual({route,exists:true});
    }
  });

  it('keeps the Forwarding Carrier Rate -> ANC Quote -> acceptance endpoints aligned between Web and API',()=>{
    const component=read('../../web/components/PortalRateBooking.tsx');
    const rateController=read('../src/modules/rate-procurement/rate-procurement.controller.ts');
    const portalController=read('../src/modules/portal/portal.controller.ts');

    expect(component).toContain("api('/rate-procurement/forwarding/search'");
    expect(component).toContain("api('/rate-procurement/forwarding/select/'");
    expect(component).toContain("api('/portal/forwarding/quotes/'+");
    expect(rateController).toContain("@Post('forwarding/search')");
    expect(rateController).toContain("@Post('forwarding/select/:requestId/:offerId')");
    expect(portalController).toContain("@Post('forwarding/quotes/:quoteId/accept')");
  });

  it('keeps Shipment Control dashboard/register endpoints aligned between Web and API',()=>{
    const page=read('../../web/app/shipment-control/page.tsx');
    const controller=read('../src/modules/shipment-control/shipment-control.controller.ts');
    for(const endpoint of ['/shipment-control/dashboard','/shipment-control/shipments','/shipment-control/consols']){
      expect(page).toContain(endpoint);
    }
    expect(controller).toContain("@Get('dashboard')");
    expect(controller).toContain("@Get('shipments')");
    expect(controller).toContain("@Get('consols')");
    expect(controller).toContain("@Post('consols')");
  });

  it('keeps the Forwarding shortcut anchored to the actual customer-portal booking workspace',()=>{
    const bookings=read('../../web/app/bookings/page.tsx');
    const customerPortal=read('../../web/app/customer-portal/page.tsx');
    expect(bookings).toContain('/customer-portal#new-booking');
    expect(customerPortal).toContain('id="new-booking"');
  });
  it('keeps the unified Job Flow navigation wired through core operational workspaces',()=>{
    const nav=read('../../web/components/JobFlowNav.tsx');
    for(const route of ['/schedules','/routing','/carrier-operations','/carrier-payment','/shipment-control','/container-control','/tracking','/exceptions','/documents','/finance','/tasks','/approvals']){
      expect(nav).toContain(route);
    }
    const pages=[
      '../../web/app/bookings/[id]/page.tsx',
      '../../web/app/schedules/page.tsx',
      '../../web/app/routing/page.tsx',
      '../../web/app/carrier-operations/page.tsx',
      '../../web/app/shipment-control/page.tsx',
      '../../web/app/documents/page.tsx',
      '../../web/app/container-control/page.tsx',
      '../../web/app/tracking/page.tsx',
      '../../web/app/exceptions/page.tsx',
      '../../web/app/finance/page.tsx',
      '../../web/app/tasks/page.tsx',
      '../../web/app/approvals/page.tsx',
      '../../web/app/carrier-payment/page.tsx'
    ];
    for(const page of pages){
      const source=read(page);
      expect(source).toContain('JobFlowNav');
      expect(source).toMatch(/active="(BOOKING|SCHEDULE|ROUTING|CARRIER|PAYMENT|SHIPMENT|CONTAINERS|TRACKING|EXCEPTIONS|DOCUMENTS|FINANCE|TASKS|APPROVALS)"/);
    }
  });

  it('keeps the Web CSP compatible with Next.js production hydration without enabling eval',()=>{
    const middleware=read('../../web/middleware.ts');
    expect(middleware).toContain("script-src 'self' 'unsafe-inline'");
    expect(middleware).not.toContain("'unsafe-eval'");
    expect(middleware).toContain("object-src 'none'");
    expect(middleware).toContain("frame-ancestors 'none'");
  });

});
