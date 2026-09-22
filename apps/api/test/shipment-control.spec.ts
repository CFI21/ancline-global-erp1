import { ShipmentControlService } from '../src/modules/shipment-control/shipment-control.service';

const internalUser:any={sub:'ops-1',email:'ops@ancline.test',role:'GLOBAL_ADMIN'};

describe('Shipment and consol execution controls',()=>{
  function service(prisma:any={}){
    return new ShipmentControlService(prisma,{assertInternal:jest.fn(),assertBookingAccess:jest.fn()} as any,{log:jest.fn()} as any);
  }

  it('blocks FCL consol departure when allocated equipment is incomplete',()=>{
    const result=(service() as any).departureReadiness({
      shipments:[{
        shipmentNo:'SHP-10001',bookingType:'FCL',quantity:2,
        containers:[{containerNo:'MSCU0000001',status:'LOADED'}]
      }]
    });
    expect(result.ready).toBe(false);
    expect(result.missingFcl).toEqual(['SHP-10001']);
  });

  it('accepts departure readiness when all FCL equipment is loaded or beyond',()=>{
    const result=(service() as any).departureReadiness({
      shipments:[{
        shipmentNo:'SHP-10001',bookingType:'FCL',quantity:2,
        containers:[
          {containerNo:'MSCU0000001',status:'LOADED'},
          {containerNo:'MSCU0000002',status:'DEPARTED'}
        ]
      }]
    });
    expect(result).toEqual(expect.objectContaining({ready:true,containerCount:2,loadedCount:2,missingFcl:[],notLoaded:[]}));
  });

  it('rejects a consol whose ETA is not after ETD',async()=>{
    const s=service({consol:{findUnique:jest.fn()}});
    await expect(s.createConsol({
      origin:'NLRTM',destination:'AEJEA',
      etd:'2026-10-10T10:00:00.000Z',eta:'2026-10-09T10:00:00.000Z'
    },internalUser)).rejects.toThrow(/ETA must be after ETD/i);
  });

  it('rejects departure of an empty confirmed consol',async()=>{
    const prisma:any={
      consol:{findUnique:jest.fn().mockResolvedValue({
        id:'c-1',consolNo:'CNS-1',status:'CONFIRMED',shipments:[],
        portOfLoading:'NLRTM',portOfDischarge:'AEJEA'
      })}
    };
    await expect(service(prisma).transition('c-1','DEPARTED',internalUser)).rejects.toThrow(/empty consol/i);
  });

  it('rejects departure when a container is not loaded',async()=>{
    const prisma:any={
      consol:{findUnique:jest.fn().mockResolvedValue({
        id:'c-2',consolNo:'CNS-2',status:'CONFIRMED',portOfLoading:'NLRTM',portOfDischarge:'AEJEA',
        shipments:[{
          id:'b-1',bookingNo:'10001',shipmentNo:'SHP-10001',status:'CONFIRMED',
          bookingType:'FCL',quantity:1,containers:[{id:'ctr-1',containerNo:'MSCU0000001',status:'ALLOCATED'}]
        }]
      })}
    };
    await expect(service(prisma).transition('c-2','DEPARTED',internalUser)).rejects.toThrow(/containers not loaded/i);
  });
});
