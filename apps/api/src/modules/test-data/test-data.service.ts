import { ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeUser } from '../auth/scope';

const SOURCE='ANCLINE_TEST_DATA';
const TEST_PREFIX='ANC-TEST';
const TEST_JOB_REFS=['50001','50002','50003','50004','50005'] as const;
const LEGACY_TEST_BOOKING_REFS=[
  'ANC-TEST-FWD-BKG-STD-001',
  'ANC-TEST-FWD-BKG-DG-001',
  'ANC-TEST-FWD-BKG-REEFER-001',
  'ANC-TEST-FWD-BKG-OOG-001',
  'ANC-TEST-NVOCC-BKG-001'
] as const;

@Injectable()
export class TestDataService implements OnModuleInit {
  constructor(private prisma:PrismaService){}
  private get db():any{return this.prisma as any;}
  private admin(user?:ScopeUser){if(user&&String(user?.role||'').toUpperCase()!=='GLOBAL_ADMIN')throw new ForbiddenException('Global Admin access required');}
  private now(){return new Date();}
  private d(days:number,hour=12){const x=new Date();x.setUTCDate(x.getUTCDate()+days);x.setUTCHours(hour,0,0,0);return x;}
  private async event(objectType:string,objectId:string,eventType:string,payload:any,status='COMPLETED',sourceSystem=SOURCE,externalId?:string|null){
    await this.db.integrationEvent.deleteMany({where:{sourceSystem,objectType,objectId,eventType,...(externalId?{externalId}: {})}});
    return this.db.integrationEvent.create({data:{sourceSystem,objectType,objectId,eventType,externalId:externalId||null,status,completedAt:status==='COMPLETED'?this.now():null,payload}});
  }
  async onModuleInit(){
    if(String(process.env.ANCLINE_TEST_DATA_SEED||'false').toLowerCase()==='true'){
      try{
        if(String(process.env.ANCLINE_TEST_DATA_RESET_ON_SEED||'false').toLowerCase()==='true')await this.reset(undefined);
        const r=await this.seed(undefined);
        console.log('[ANCLINE TEST DATA]',JSON.stringify({summary:r.summary,bookings:r.bookings?.map((x:any)=>x.bookingNo)||[]}));
      }
      catch(e:any){console.error('[ANCLINE TEST DATA] seed failed',e?.message||e);}
    }
  }

  async seed(user?:ScopeUser){
    this.admin(user);
    const branch=await this.db.branch.upsert({
      where:{code:'TEST-NL-BR'},
      update:{name:'TEST ANC Netherlands Branch',countryCode:'NL',active:true},
      create:{code:'TEST-NL-BR',name:'TEST ANC Netherlands Branch',countryCode:'NL',active:true}
    });

    const customers=[
      {
        code:'TEST-CUST-NL',name:'TEST NorthSea Trading B.V.',countryCode:'NL',customerRef:'ANC-TEST-CUS-NL-001',registrationRef:'ANC-TEST-REG-NL-001',costCenterCode:'TEST-FWD-NL',
        email:'test.customer.nl@ancline.invalid',contact:'Test Customer Netherlands',
        kycData:{legalName:'TEST NorthSea Trading B.V.',countryCode:'NL',companyRegistrationNo:'TEST-KVK-001',taxId:'TEST-NL-VAT-001',registeredAddress:'TEST Street 1, Rotterdam, Netherlands',contactName:'Test Customer Netherlands',contactEmail:'test.customer.nl@ancline.invalid',contactPhone:'+31-000-000-0000',businessType:'SHIPPER',beneficialOwners:[{name:'TEST UBO NL',country:'NL',ownershipPct:100,idRef:'TEST-ID-NL'}],directors:[{name:'TEST Director NL',country:'NL',idRef:'TEST-DIR-NL'}],documentChecklist:['Company registration certificate','Tax / VAT certificate','UBO identity document','Director / authorized signatory ID','Proof of registered address','Bank proof / account confirmation'],documents:[],sanctionsDeclaration:true,termsAccepted:true,privacyAccepted:true,testData:true}
      },
      {
        code:'TEST-CUST-AE',name:'TEST Gulf Import LLC',countryCode:'AE',customerRef:'ANC-TEST-CUS-AE-002',registrationRef:'ANC-TEST-REG-AE-002',costCenterCode:'TEST-FWD-AE',
        email:'test.customer.ae@ancline.invalid',contact:'Test Customer UAE',
        kycData:{legalName:'TEST Gulf Import LLC',countryCode:'AE',companyRegistrationNo:'TEST-AE-LIC-002',taxId:'TEST-AE-TRN-002',registeredAddress:'TEST Business District, Dubai, UAE',contactName:'Test Customer UAE',contactEmail:'test.customer.ae@ancline.invalid',contactPhone:'+971-00-000-0000',businessType:'IMPORTER',beneficialOwners:[{name:'TEST UBO AE',country:'AE',ownershipPct:100,idRef:'TEST-ID-AE'}],directors:[{name:'TEST Director AE',country:'AE',idRef:'TEST-DIR-AE'}],documentChecklist:['Company registration certificate','Tax / VAT certificate','UBO identity document','Director / authorized signatory ID','Proof of registered address','Bank proof / account confirmation'],documents:[],sanctionsDeclaration:true,termsAccepted:true,privacyAccepted:true,testData:true}
      },
      {
        code:'TEST-CUST-CN',name:'TEST Shanghai Export Co.',countryCode:'CN',customerRef:'ANC-TEST-CUS-CN-003',registrationRef:'ANC-TEST-REG-CN-003',costCenterCode:'TEST-FWD-CN',
        email:'test.customer.cn@ancline.invalid',contact:'Test Customer China',
        kycData:{legalName:'TEST Shanghai Export Co.',countryCode:'CN',companyRegistrationNo:'TEST-CN-USCC-003',taxId:'TEST-CN-TAX-003',registeredAddress:'TEST Pudong Road, Shanghai, China',contactName:'Test Customer China',contactEmail:'test.customer.cn@ancline.invalid',contactPhone:'+86-000-000-0000',businessType:'EXPORTER',beneficialOwners:[{name:'TEST UBO CN',country:'CN',ownershipPct:100,idRef:'TEST-ID-CN'}],directors:[{name:'TEST Director CN',country:'CN',idRef:'TEST-DIR-CN'}],documentChecklist:['Company registration certificate','Tax / VAT certificate','UBO identity document','Director / authorized signatory ID','Proof of registered address','Bank proof / account confirmation'],documents:[],sanctionsDeclaration:true,termsAccepted:true,privacyAccepted:true,testData:true}
      }
    ];
    const customerRows:any[]=[];
    for(const x of customers){
      const row=await this.db.organization.upsert({
        where:{code:x.code},
        update:{name:x.name,roles:['CUSTOMER'],countryCode:x.countryCode,costCenterCode:x.costCenterCode,customerRef:x.customerRef,registrationRef:x.registrationRef,kycStatus:'APPROVED',kycData:x.kycData,kycSubmittedAt:this.d(-30),kycApprovedAt:this.d(-29),kycApprovedBy:'SYSTEM_TEST_DATA',active:true},
        create:{code:x.code,name:x.name,roles:['CUSTOMER'],countryCode:x.countryCode,costCenterCode:x.costCenterCode,customerRef:x.customerRef,registrationRef:x.registrationRef,kycStatus:'APPROVED',kycData:x.kycData,kycSubmittedAt:this.d(-30),kycApprovedAt:this.d(-29),kycApprovedBy:'SYSTEM_TEST_DATA',active:true}
      });
      customerRows.push({...x,id:row.id});
      await this.db.userAccount.upsert({
        where:{email:x.email},
        update:{displayName:x.contact,role:'CUSTOMER',customerId:row.id,costCenterCode:x.costCenterCode,permissions:['FORWARDING_PORTAL','FORWARDING_QUOTES','FORWARDING_BOOKINGS'],active:true},
        create:{email:x.email,displayName:x.contact,role:'CUSTOMER',customerId:row.id,costCenterCode:x.costCenterCode,permissions:['FORWARDING_PORTAL','FORWARDING_QUOTES','FORWARDING_BOOKINGS'],active:true}
      });
      await this.event('CreditProfile',row.id,'CREDIT_PROFILE_SET',{partyId:row.id,partyName:x.name,creditLimit:x.countryCode==='NL'?50000:25000,creditCurrency:'USD',paymentTermsDays:x.countryCode==='NL'?30:14,overdueHoldDays:45,riskRating:'LOW',creditHold:false,customerPaymentMode:x.countryCode==='AE'?'PREPAID':'CREDIT',prepaidPct:x.countryCode==='AE'?100:0,updatedBy:'SYSTEM_TEST_DATA',testData:true},'COMPLETED','ANCLINE_CREDIT_CONTROL');
    }

    const agent=await this.db.organization.upsert({
      where:{code:'TEST-AGENT-SG'},
      update:{name:'TEST Asia Liner Agency Pte Ltd',roles:['AGENT'],countryCode:'SG',costCenterCode:'TEST-AGT-SG',active:true},
      create:{code:'TEST-AGENT-SG',name:'TEST Asia Liner Agency Pte Ltd',roles:['AGENT'],countryCode:'SG',costCenterCode:'TEST-AGT-SG',active:true}
    });
    await this.db.userAccount.upsert({
      where:{email:'test.agent.sg@ancline.invalid'},
      update:{displayName:'Test Liner Agent Singapore',role:'AGENT',agentId:agent.id,costCenterCode:'TEST-AGT-SG',agentMode:'LINER_AGENCY_ONLY',permissions:['NVOCC_PORTAL','NVOCC_RATES','NVOCC_DOCUMENTS','CARRIER_SPACE_CONTROL','FORWARDING_DIRECT_COLOAD_CROSS_TRADE'],active:true},
      create:{email:'test.agent.sg@ancline.invalid',displayName:'Test Liner Agent Singapore',role:'AGENT',agentId:agent.id,costCenterCode:'TEST-AGT-SG',agentMode:'LINER_AGENCY_ONLY',permissions:['NVOCC_PORTAL','NVOCC_RATES','NVOCC_DOCUMENTS','CARRIER_SPACE_CONTROL','FORWARDING_DIRECT_COLOAD_CROSS_TRADE'],active:true}
    });

    const carriers=[
      {code:'TEST-CARRIER-ATL',name:'TEST Atlantic Ocean Line',countryCode:'DE',providerCode:'TEST_ATLANTIC',accountCode:'ANC-TEST-ATL-ACCOUNT'},
      {code:'TEST-CARRIER-PAC',name:'TEST Pacific Container Line',countryCode:'SG',providerCode:'TEST_PACIFIC',accountCode:'ANC-TEST-PAC-ACCOUNT'},
      {code:'TEST-CARRIER-GULF',name:'TEST Gulf Marine Line',countryCode:'AE',providerCode:'TEST_GULF',accountCode:'ANC-TEST-GULF-ACCOUNT'}
    ];
    const carrierRows:any[]=[];
    for(const x of carriers){
      const row=await this.db.organization.upsert({
        where:{code:x.code},
        update:{name:x.name,roles:['CARRIER'],countryCode:x.countryCode,active:true},
        create:{code:x.code,name:x.name,roles:['CARRIER'],countryCode:x.countryCode,active:true}
      });
      carrierRows.push({...x,id:row.id});
      await this.db.integrationEvent.deleteMany({where:{sourceSystem:'ANCLINE_RATE_PROCUREMENT',objectType:'CarrierRateProvider',objectId:x.providerCode,eventType:'PROVIDER_PROFILE_SET'}});
      await this.db.integrationEvent.create({data:{
        sourceSystem:'ANCLINE_RATE_PROCUREMENT',eventType:'PROVIDER_PROFILE_SET',objectType:'CarrierRateProvider',objectId:x.providerCode,status:'COMPLETED',completedAt:this.now(),
        payload:{providerCode:x.providerCode,name:x.name+' TEST PROFILE',carrier:x.name,carrierOrgId:row.id,active:true,authMode:'NONE',endpoint:null,bookingEndpoint:null,capabilities:{RATES:'MANUAL',BOOKING:'MANUAL',AMENDMENT:'MANUAL',CANCELLATION:'MANUAL',VGM:'MANUAL',SHIPPING_INSTRUCTIONS:'MANUAL',BL_DRAFT:'MANUAL',TRACKING:'MANUAL'},optionalCapabilities:{ADDITIONAL_FREE_TIME:'DISABLED',GREEN_PRODUCT:'DISABLED',SHIPPING_GUARANTEE:'DISABLED',LIVE_REEFER:'DISABLED',INLAND_RATE:'DISABLED',LOCAL_CHARGES:'DISABLED'},carrierIdentity:{accountName:'ANC TEST ACCOUNT',accountCode:x.accountCode},dataProtection:{customerKycOutbound:false,customerReferenceOutbound:false,houseBlOutbound:false,housePartiesOutbound:false},notes:'SYNTHETIC TEST CARRIER — NEVER USE FOR REAL BOOKINGS'}
      }});
    }

    const trucker=await this.db.organization.upsert({
      where:{code:'TEST-TRUCKER-NL'},
      update:{name:'TEST ANC Trucking & Haulage B.V.',roles:['TRUCKER','VENDOR'],countryCode:'NL',costCenterCode:'TEST-TRUCK-NL',active:true},
      create:{code:'TEST-TRUCKER-NL',name:'TEST ANC Trucking & Haulage B.V.',roles:['TRUCKER','VENDOR'],countryCode:'NL',costCenterCode:'TEST-TRUCK-NL',active:true}
    });

    // Keep synthetic jobs on the same five-digit reference convention as live ANCLINE jobs.
    for(let i=0;i<LEGACY_TEST_BOOKING_REFS.length;i++){
      const legacyRef=LEGACY_TEST_BOOKING_REFS[i],targetRef=TEST_JOB_REFS[i];
      const [legacy,target]=await Promise.all([
        this.db.booking.findUnique({where:{bookingNo:legacyRef}}),
        this.db.booking.findUnique({where:{bookingNo:targetRef}})
      ]);
      if(legacy&&!target)await this.db.booking.update({where:{id:legacy.id},data:{bookingNo:targetRef}});
    }

    const bookingDefs=[
      {key:'STD',customer:customerRows[0],carrier:carrierRows[0],origin:'NLRTM',destination:'AEJEA',por:'NLRTM',pol:'NLRTM',pod:'AEJEA',pdel:'AEDXB',transshipment:'EGPSD',equipment:'40HC',qty:1,commodity:'Furniture and interior goods',packages:48,packageType:'PALLETS',gross:18200,net:17600,cbm:61.4,hs:'940360',incoterm:'CIF',freightTerms:'PREPAID',special:'NONE',throughBL:'YES',buy:1400,sell:1650,currency:'USD',tradeType:'STANDARD',jobType:'FCL',service:'PORT_TO_PORT',status:'BOOKING_REQUESTED',shipStatus:'CARRIER_PAYMENT_CONTROL_PENDING'},
      {key:'DG',customer:customerRows[0],carrier:carrierRows[1],origin:'NLRTM',destination:'SGSIN',por:'NLRTM',pol:'NLRTM',pod:'SGSIN',pdel:'SGSIN',transshipment:'MYPKG',equipment:'20GP',qty:1,commodity:'Paint related material',packages:80,packageType:'DRUMS',gross:15200,net:14600,cbm:28.2,hs:'320890',incoterm:'CFR',freightTerms:'PREPAID',special:'DG',throughBL:'YES',buy:2150,sell:2575,currency:'USD',tradeType:'STANDARD',jobType:'FCL_DG',service:'PORT_TO_PORT',status:'CONFIRMED',shipStatus:'CARRIER_CONFIRMED',dg:{un:'UN1263',imo:'3',pg:'II',psn:'PAINT, FLAMMABLE LIQUID'}},
      {key:'REEFER',customer:customerRows[2],carrier:carrierRows[1],origin:'CNSHA',destination:'NLRTM',por:'CNSHA',pol:'CNSHA',pod:'NLRTM',pdel:'NLRTM',transshipment:'SGSIN',equipment:'40RF',qty:2,commodity:'Frozen seafood',packages:1600,packageType:'CARTONS',gross:46800,net:45200,cbm:108.5,hs:'030389',incoterm:'FOB',freightTerms:'COLLECT',special:'REEFER',throughBL:'NO',buy:5200,sell:6050,currency:'USD',tradeType:'STANDARD',jobType:'FCL_REEFER',service:'PORT_TO_PORT',status:'OPERATIONAL',shipStatus:'EQUIPMENT_RELEASED',reefer:{temp:-18,vent:0,humidity:70}},
      {key:'OOG',customer:customerRows[1],carrier:carrierRows[2],origin:'AEJEA',destination:'NLRTM',por:'AEDXB',pol:'AEJEA',pod:'NLRTM',pdel:'NLRTM',transshipment:'OMSLL',equipment:'40FR',qty:1,commodity:'Industrial machinery',packages:1,packageType:'CRATE',gross:28600,net:28100,cbm:74.8,hs:'842890',incoterm:'DAP',freightTerms:'PREPAID',special:'OOG',throughBL:'YES',buy:6800,sell:7900,currency:'USD',tradeType:'CROSS_TRADE',jobType:'FCL_OOG',service:'DOOR_TO_DOOR',status:'CUSTOMER_ACCEPTED',shipStatus:'QUOTE_ACCEPTED_PAYMENT_CONTROL',oog:{l:1260,w:310,h:335,weight:28600}}
    ];
    const bookingRows:any[]=[];
    for(let idx=0;idx<bookingDefs.length;idx++){
      const x:any=bookingDefs[idx],quoteNo=`ANC-TEST-FWD-Q-${x.key}-001`,bookingNo=TEST_JOB_REFS[idx];
      const quote=await this.db.rateQuote.upsert({
        where:{quoteNo},
        update:{customerId:x.customer.id,trade:`${x.origin}-${x.destination}`,equipment:x.equipment,buyRate:x.buy,sellRate:x.sell,currency:x.currency,validFrom:this.d(-5),validTo:this.d(30),status:'Customer Accepted',source:`FORWARDING_CARRIER:${x.carrier.providerCode}`,customerRef:x.customer.customerRef,costCenterCode:x.customer.costCenterCode,carrierCode:x.carrier.providerCode,carrierQuoteRef:`TEST-CARRIER-QUOTE-${x.key}-7788`,termsVersion:'ANC-TEST-FWD-TERMS-2026.1',termsAcceptedAt:this.d(-2),termsAcceptedBy:x.customer.email,requestData:{testData:true,origin:x.origin,destination:x.destination,placeOfReceipt:x.por,portOfLoading:x.pol,portOfDischarge:x.pod,placeOfDelivery:x.pdel,transshipmentPort:x.transshipment,equipment:x.equipment,quantity:x.qty,serviceType:x.service,commodity:x.commodity,hsCode:x.hs,incoterm:x.incoterm,freightTerms:x.freightTerms,specialCargo:x.special},carrierOfferData:{testData:true,providerCode:x.carrier.providerCode,carrier:x.carrier.name,buy:x.buy,sell:x.sell,currency:x.currency,serviceName:'TEST SERVICE '+x.key,vessel:'TEST VESSEL '+(idx+1),voyage:'TV'+(100+idx),etd:this.d(7+idx*2,18),eta:this.d(28+idx*4,8),terminal:'TEST TERMINAL '+x.pol,freeTimeOriginDays:7,freeTimeDestinationDays:7}},
        create:{quoteNo,customerId:x.customer.id,trade:`${x.origin}-${x.destination}`,equipment:x.equipment,buyRate:x.buy,sellRate:x.sell,currency:x.currency,validFrom:this.d(-5),validTo:this.d(30),status:'Customer Accepted',source:`FORWARDING_CARRIER:${x.carrier.providerCode}`,customerRef:x.customer.customerRef,costCenterCode:x.customer.costCenterCode,carrierCode:x.carrier.providerCode,carrierQuoteRef:`TEST-CARRIER-QUOTE-${x.key}-7788`,termsVersion:'ANC-TEST-FWD-TERMS-2026.1',termsAcceptedAt:this.d(-2),termsAcceptedBy:x.customer.email,requestData:{testData:true,origin:x.origin,destination:x.destination,placeOfReceipt:x.por,portOfLoading:x.pol,portOfDischarge:x.pod,placeOfDelivery:x.pdel,transshipmentPort:x.transshipment,equipment:x.equipment,quantity:x.qty,serviceType:x.service,commodity:x.commodity,hsCode:x.hs,incoterm:x.incoterm,freightTerms:x.freightTerms,specialCargo:x.special},carrierOfferData:{testData:true,providerCode:x.carrier.providerCode,carrier:x.carrier.name,buy:x.buy,sell:x.sell,currency:x.currency,serviceName:'TEST SERVICE '+x.key,vessel:'TEST VESSEL '+(idx+1),voyage:'TV'+(100+idx),etd:this.d(7+idx*2,18),eta:this.d(28+idx*4,8),terminal:'TEST TERMINAL '+x.pol,freeTimeOriginDays:7,freeTimeDestinationDays:7}}
      });
      const booking=await this.db.booking.upsert({
        where:{bookingNo},
        update:{
          owningBranchId:branch.id,businessModel:'FORWARDING',bookingChannel:'CUSTOMER_PORTAL',shipmentNo:`ANC-TEST-SHP-${x.key}-001`,shipmentStatus:x.shipStatus,customerId:x.customer.id,customerRef:x.customer.customerRef,costCenterCode:x.customer.costCenterCode,jobType:x.jobType,forwardingTradeType:x.tradeType,producingAgentId:agent.id,rateQuoteId:quote.id,salesOwner:'TEST SALES MANAGER',operator:'TEST OPERATIONS EXECUTIVE',bookingType:'FCL',transportMode:'SEA',serviceType:x.service,bookingDate:this.d(-2),customerReference:`TEST-CUST-REF-${x.key}`,shipperReference:`TEST-SHIPPER-REF-${x.key}`,carrierBookingNo:`TEST-CARRIER-BKG-${x.key}-9911`,houseBL:`ANC-TEST-HBL-${x.key}-001`,masterBL:`TEST-MBL-${x.key}-001`,shipper:`TEST HOUSE SHIPPER ${x.customer.name}`,consignee:`TEST HOUSE CONSIGNEE ${x.destination}`,notifyParty:`TEST NOTIFY PARTY ${x.destination}`,origin:x.origin,destination:x.destination,placeOfReceipt:x.por,portOfLoading:x.pol,portOfDischarge:x.pod,placeOfDelivery:x.pdel,transshipmentPort:x.transshipment,terminal:`TEST TERMINAL ${x.pol}`,polAgent:'TEST ANC ORIGIN DESK',podAgent:'TEST ANC DESTINATION DESK',etd:this.d(7+idx*2,18),eta:this.d(28+idx*4,8),atd:x.status==='OPERATIONAL'?this.d(-1,19):this.d(7+idx*2,19),ata:x.status==='OPERATIONAL'?this.d(1,9):this.d(28+idx*4,9),cyClosing:this.d(5+idx*2,12),siCutoff:this.d(5+idx*2,8),vgmCutoff:this.d(6+idx*2,8),docCutoff:this.d(5+idx*2,10),portCutoff:this.d(6+idx*2,14),carrier:x.carrier.name,vesselVoyage:`TEST VESSEL ${idx+1} / TV${100+idx}`,equipment:x.equipment,quantity:x.qty,containerOwner:'CARRIER',throughBL:x.throughBL,commodity:x.commodity,packageCount:x.packages,packageType:x.packageType,grossWeight:x.gross,netWeight:x.net,volumeCbm:x.cbm,marksNumbers:`TEST MARKS ${x.key} 001-999`,hsCode:x.hs,cargoDescription:`SYNTHETIC TEST CARGO - ${x.commodity}`,incoterm:x.incoterm,freightTerms:x.freightTerms,currency:x.currency,status:x.status,creditStatus:x.customer.countryCode==='AE'?'Payment Required':'Passed',slotStatus:x.status==='CUSTOMER_ACCEPTED'?'REQUESTED':'CONFIRMED',equipmentStatus:x.status==='CUSTOMER_ACCEPTED'?'PENDING':'RELEASED',specialCargo:x.special,dgUnNo:x.dg?.un||null,dgImoClass:x.dg?.imo||null,dgPackingGroup:x.dg?.pg||null,dgProperShippingName:x.dg?.psn||null,reeferTemperatureC:x.reefer?.temp??null,reeferVentilation:x.reefer?.vent??null,reeferHumidityPct:x.reefer?.humidity??null,oogLengthCm:x.oog?.l??null,oogWidthCm:x.oog?.w??null,oogHeightCm:x.oog?.h??null,oogWeightKg:x.oog?.weight??null,notes:'SYNTHETIC TEST BOOKING — DO NOT SEND TO REAL CARRIER'
        },
        create:{
          owningBranchId:branch.id,bookingNo,businessModel:'FORWARDING',bookingChannel:'CUSTOMER_PORTAL',shipmentNo:`ANC-TEST-SHP-${x.key}-001`,shipmentStatus:x.shipStatus,customerId:x.customer.id,customerRef:x.customer.customerRef,costCenterCode:x.customer.costCenterCode,jobType:x.jobType,forwardingTradeType:x.tradeType,producingAgentId:agent.id,rateQuoteId:quote.id,salesOwner:'TEST SALES MANAGER',operator:'TEST OPERATIONS EXECUTIVE',bookingType:'FCL',transportMode:'SEA',serviceType:x.service,bookingDate:this.d(-2),customerReference:`TEST-CUST-REF-${x.key}`,shipperReference:`TEST-SHIPPER-REF-${x.key}`,carrierBookingNo:`TEST-CARRIER-BKG-${x.key}-9911`,houseBL:`ANC-TEST-HBL-${x.key}-001`,masterBL:`TEST-MBL-${x.key}-001`,shipper:`TEST HOUSE SHIPPER ${x.customer.name}`,consignee:`TEST HOUSE CONSIGNEE ${x.destination}`,notifyParty:`TEST NOTIFY PARTY ${x.destination}`,origin:x.origin,destination:x.destination,placeOfReceipt:x.por,portOfLoading:x.pol,portOfDischarge:x.pod,placeOfDelivery:x.pdel,transshipmentPort:x.transshipment,terminal:`TEST TERMINAL ${x.pol}`,polAgent:'TEST ANC ORIGIN DESK',podAgent:'TEST ANC DESTINATION DESK',etd:this.d(7+idx*2,18),eta:this.d(28+idx*4,8),atd:x.status==='OPERATIONAL'?this.d(-1,19):this.d(7+idx*2,19),ata:x.status==='OPERATIONAL'?this.d(1,9):this.d(28+idx*4,9),cyClosing:this.d(5+idx*2,12),siCutoff:this.d(5+idx*2,8),vgmCutoff:this.d(6+idx*2,8),docCutoff:this.d(5+idx*2,10),portCutoff:this.d(6+idx*2,14),carrier:x.carrier.name,vesselVoyage:`TEST VESSEL ${idx+1} / TV${100+idx}`,equipment:x.equipment,quantity:x.qty,containerOwner:'CARRIER',throughBL:x.throughBL,commodity:x.commodity,packageCount:x.packages,packageType:x.packageType,grossWeight:x.gross,netWeight:x.net,volumeCbm:x.cbm,marksNumbers:`TEST MARKS ${x.key} 001-999`,hsCode:x.hs,cargoDescription:`SYNTHETIC TEST CARGO - ${x.commodity}`,incoterm:x.incoterm,freightTerms:x.freightTerms,currency:x.currency,status:x.status,creditStatus:x.customer.countryCode==='AE'?'Payment Required':'Passed',slotStatus:x.status==='CUSTOMER_ACCEPTED'?'REQUESTED':'CONFIRMED',equipmentStatus:x.status==='CUSTOMER_ACCEPTED'?'PENDING':'RELEASED',specialCargo:x.special,dgUnNo:x.dg?.un||null,dgImoClass:x.dg?.imo||null,dgPackingGroup:x.dg?.pg||null,dgProperShippingName:x.dg?.psn||null,reeferTemperatureC:x.reefer?.temp??null,reeferVentilation:x.reefer?.vent??null,reeferHumidityPct:x.reefer?.humidity??null,oogLengthCm:x.oog?.l??null,oogWidthCm:x.oog?.w??null,oogHeightCm:x.oog?.h??null,oogWeightKg:x.oog?.weight??null,notes:'SYNTHETIC TEST BOOKING — DO NOT SEND TO REAL CARRIER'
        }
      });
      bookingRows.push({...x,id:booking.id,bookingNo,quoteNo});

      await this.db.bookingLeg.deleteMany({where:{bookingId:booking.id}});
      await this.db.bookingLeg.createMany({data:[{bookingId:booking.id,sequence:1,legType:'PRE_CARRIAGE',mode:'ROAD',origin:x.por,destination:x.pol,carrier:trucker.name,vessel:'TEST TRUCK',voyage:'TRK-'+bookingNo,terminal:'TEST TERMINAL '+x.pol,etd:this.d(3+idx,9),eta:this.d(3+idx,15),atd:this.d(3+idx,9),ata:this.d(3+idx,15),status:'COMPLETED',remarks:'SYNTHETIC TEST PRE-CARRIAGE LEG'},{bookingId:booking.id,sequence:2,legType:'MAIN',mode:'SEA',origin:x.pol,destination:x.pod,carrier:x.carrier.name,vessel:'TEST VESSEL '+(idx+1),voyage:'TV'+(100+idx),terminal:'TEST TERMINAL '+x.pol,etd:this.d(7+idx*2,18),eta:this.d(28+idx*4,8),atd:x.status==='OPERATIONAL'?this.d(-1,19):this.d(7+idx*2,19),ata:x.status==='OPERATIONAL'?this.d(1,9):this.d(28+idx*4,9),status:x.status==='OPERATIONAL'?'DEPARTED':'CONFIRMED',remarks:'SYNTHETIC TEST MAIN LEG VIA '+x.transshipment}]});
      await this.db.shipmentMilestone.deleteMany({where:{bookingId:booking.id}});
      await this.db.shipmentMilestone.createMany({data:[
        {bookingId:booking.id,code:'BOOKED',label:'ANC Booking Created',location:x.origin,plannedAt:this.d(-2),actualAt:this.d(-2),status:'ACTUAL',source:'TEST_DATA',remarks:'Synthetic booking milestone'},
        {bookingId:booking.id,code:'EMPTY_RELEASE',label:'Empty Equipment Released',location:'TEST DEPOT '+x.pol,plannedAt:this.d(2+idx),actualAt:this.d(2+idx),status:'ACTUAL',source:'TEST_DATA',remarks:'Synthetic equipment release'},
        {bookingId:booking.id,code:'PICKUP',label:'Cargo / Container Pickup',location:x.por,plannedAt:this.d(3+idx,9),actualAt:this.d(3+idx,9),status:'ACTUAL',source:'TEST_DATA',remarks:'Synthetic pickup'},
        {bookingId:booking.id,code:'CY_CLOSING',label:'CY Closing',location:x.pol,plannedAt:this.d(5+idx*2,12),actualAt:this.d(5+idx*2,11),status:'ACTUAL',source:'TEST_DATA',remarks:'Synthetic cutoff met'},
        {bookingId:booking.id,code:'SI_CUTOFF',label:'Shipping Instruction Cutoff',location:x.pol,plannedAt:this.d(5+idx*2,8),actualAt:this.d(5+idx*2,7),status:'ACTUAL',source:'TEST_DATA',remarks:'Synthetic SI submitted'},
        {bookingId:booking.id,code:'VGM_CUTOFF',label:'VGM Cutoff',location:x.pol,plannedAt:this.d(6+idx*2,8),actualAt:this.d(6+idx*2,7),status:'ACTUAL',source:'TEST_DATA',remarks:'Synthetic VGM submitted'},
        {bookingId:booking.id,code:'DEPARTURE',label:'Vessel Departure',location:x.pol,plannedAt:this.d(7+idx*2,18),actualAt:x.status==='OPERATIONAL'?this.d(-1,19):this.d(7+idx*2,19),status:x.status==='OPERATIONAL'?'ACTUAL':'PLANNED',source:'TEST_DATA',remarks:'Synthetic departure'},
        {bookingId:booking.id,code:'TRANSSHIPMENT',label:'Transshipment',location:x.transshipment,plannedAt:this.d(14+idx*2,12),actualAt:this.d(14+idx*2,14),status:'PLANNED',source:'TEST_DATA',remarks:'Synthetic transshipment'},
        {bookingId:booking.id,code:'ARRIVAL',label:'Vessel Arrival',location:x.pod,plannedAt:this.d(28+idx*4,8),actualAt:x.status==='OPERATIONAL'?this.d(1,9):this.d(28+idx*4,9),status:x.status==='OPERATIONAL'?'ACTUAL':'PLANNED',source:'TEST_DATA',remarks:'Synthetic arrival'}
      ]});
      await this.db.document.deleteMany({where:{bookingId:booking.id,documentNo:{startsWith:'ANC-TEST-'}}});
      await this.db.document.createMany({data:[
        {documentNo:`ANC-TEST-BC-${x.key}-001`,bookingId:booking.id,type:'BOOKING_CONFIRMATION',version:1,status:'ISSUED',releaseControl:'RELEASED',fileKey:`test-data/${bookingNo}/booking-confirmation-v1.pdf`},
        {documentNo:`ANC-TEST-SI-${x.key}-001`,bookingId:booking.id,type:'SHIPPING_INSTRUCTION',version:2,status:'SUBMITTED',releaseControl:'RELEASED',fileKey:`test-data/${bookingNo}/shipping-instruction-v2.pdf`},
        {documentNo:`ANC-TEST-HBL-${x.key}-001`,bookingId:booking.id,type:'HOUSE_BL',version:1,status:'APPROVED',releaseControl:'RELEASED',fileKey:`test-data/${bookingNo}/house-bl-v1.pdf`},
        {documentNo:`ANC-TEST-MBL-${x.key}-001`,bookingId:booking.id,type:'MASTER_BL',version:1,status:'PENDING_REVIEW',releaseControl:'HOLD',fileKey:`test-data/${bookingNo}/master-bl-v1.pdf`},
        {documentNo:`ANC-TEST-VGM-${x.key}-001`,bookingId:booking.id,type:'VGM_DECLARATION',version:1,status:'SUBMITTED',releaseControl:'RELEASED',fileKey:`test-data/${bookingNo}/vgm-v1.pdf`},
        {documentNo:`ANC-TEST-POD-${x.key}-001`,bookingId:booking.id,type:'PROOF_OF_DELIVERY',version:1,status:'DRAFT',releaseControl:'HOLD',fileKey:`test-data/${bookingNo}/pod-v1.pdf`}
      ]});
      await this.db.container.deleteMany({where:{bookingId:booking.id,containerNo:{startsWith:'TSTU'}}});
      for(let n=1;n<=x.qty;n++){
        await this.db.container.create({data:{containerNo:`TSTU${idx+1}${String(n).padStart(5,'0')}`,bookingId:booking.id,type:x.equipment,ownership:'CARRIER',status:x.status==='OPERATIONAL'?'RELEASED':'ALLOCATED',location:x.pol,sealNo:`TESTSEAL-${x.key}-${n}`,vgm:x.gross/x.qty,grossWeight:x.gross/x.qty,pickupDate:this.d(3+idx),emptyDepot:`TEST DEPOT ${x.pol}`,fullReturnTerminal:`TEST TERMINAL ${x.pol}`,equipmentProvider:x.carrier.name,allocationRef:`TEST-ALLOC-${x.key}-${n}`,allocationStatus:'ALLOCATED',emptyReleaseOrderNo:`TEST-ERO-${x.key}-${n}`,emptyReleaseValidUntil:this.d(6+idx)}});
      }
      await this.db.financeLine.deleteMany({where:{bookingId:booking.id,source:'TEST_DATA'}});
      await this.db.financeLine.createMany({data:[
        {bookingId:booking.id,type:'COST',chargeCode:'OCEAN_FREIGHT',description:'Synthetic carrier buy',serviceProviderId:x.carrier.id,quantity:x.qty,unitRate:x.buy/x.qty,amount:x.buy,currency:x.currency,status:'WIP',source:'TEST_DATA',reference:`TEST-BUY-${x.key}`,invoiceReady:false},
        {bookingId:booking.id,type:'REVENUE',chargeCode:'OCEAN_FREIGHT',description:'Synthetic ANC customer sell',billingPartyId:x.customer.id,quantity:x.qty,unitRate:x.sell/x.qty,amount:x.sell,currency:x.currency,status:'WIP',source:'TEST_DATA',reference:`TEST-SELL-${x.key}`,invoiceReady:true},
        {bookingId:booking.id,type:'REVENUE',chargeCode:'DOC_FEE',description:'Synthetic ANC documentation fee',billingPartyId:x.customer.id,quantity:1,unitRate:75,amount:75,currency:x.currency,status:'WIP',source:'TEST_DATA',reference:`TEST-DOC-${x.key}`,invoiceReady:true}
      ]});

      await this.db.task.deleteMany({where:{bookingId:booking.id,title:{startsWith:'TEST '}}});
      await this.db.task.createMany({data:[
        {bookingId:booking.id,title:'TEST Confirm carrier space and booking reference',ownerId:'test.ops@ancline.invalid',dueAt:this.d(2+idx),status:'OPEN',slaState:'ON_TRACK'},
        {bookingId:booking.id,title:'TEST Submit shipping instructions and VGM',ownerId:'test.docs@ancline.invalid',dueAt:this.d(5+idx),status:'OPEN',slaState:'ON_TRACK'},
        {bookingId:booking.id,title:'TEST Pre-departure readiness check',ownerId:'test.ops@ancline.invalid',dueAt:this.d(6+idx),status:'OPEN',slaState:'ON_TRACK'}
      ]});

      await this.db.approval.deleteMany({where:{bookingId:booking.id,requesterId:'SYSTEM_TEST_DATA'}});
      await this.db.approval.createMany({data:[
        {bookingId:booking.id,type:'RATE_APPROVAL',requesterId:'SYSTEM_TEST_DATA',approverId:'TEST COMMERCIAL MANAGER',status:'Approved',reason:'Synthetic test rate approval'},
        {bookingId:booking.id,type:'DOCUMENT_RELEASE',requesterId:'SYSTEM_TEST_DATA',approverId:'TEST DOCUMENT MANAGER',status:'Pending',reason:'Synthetic HBL/MBL release test'}
      ]});

      await this.db.auditEvent.deleteMany({where:{bookingId:booking.id,actorId:'SYSTEM_TEST_DATA'}});
      await this.db.auditEvent.createMany({data:[
        {bookingId:booking.id,actorId:'SYSTEM_TEST_DATA',action:'TEST_JOB_SEEDED',objectType:'Booking',objectId:booking.id,detail:{bookingNo,testData:true}},
        {bookingId:booking.id,actorId:'SYSTEM_TEST_DATA',action:'TEST_RATE_SELECTED',objectType:'RateQuote',objectId:quote.id,detail:{quoteNo,carrier:x.carrier.name,buy:x.buy,sell:x.sell,currency:x.currency,testData:true}}
      ]});

      await this.db.jobCloseoutChecklist.deleteMany({where:{bookingId:booking.id}});
      await this.db.jobCloseoutChecklist.createMany({data:[
        {bookingId:booking.id,itemCode:'DOCS_COMPLETE',itemLabel:'All operational documents complete',mandatory:true,completed:false},
        {bookingId:booking.id,itemCode:'COSTS_COMPLETE',itemLabel:'All vendor / carrier costs entered',mandatory:true,completed:false},
        {bookingId:booking.id,itemCode:'REVENUE_COMPLETE',itemLabel:'Customer revenue ready for invoicing',mandatory:true,completed:false},
        {bookingId:booking.id,itemCode:'POD_COMPLETE',itemLabel:'Delivery / POD evidence complete',mandatory:true,completed:false}
      ]});

      const scheduleNo=`TEST-SCH-${x.key}-001`;
      await this.db.vesselVoyageSchedule.upsert({
        where:{scheduleNo},
        update:{carrier:x.carrier.name,serviceName:`TEST SERVICE ${x.key}`,vessel:`TEST VESSEL ${idx+1}`,imoNo:`TESTIMO${100000+idx}`,voyage:`TV${100+idx}`,direction:'EASTBOUND',portOfLoading:x.pol,portOfDischarge:x.pod,terminal:`TEST TERMINAL ${x.pol}`,etd:this.d(7+idx*2,18),eta:this.d(28+idx*4,8),atd:x.status==='OPERATIONAL'?this.d(-1,19):this.d(7+idx*2,19),ata:x.status==='OPERATIONAL'?this.d(1,9):this.d(28+idx*4,9),cyClosing:this.d(5+idx*2,12),siCutoff:this.d(5+idx*2,8),vgmCutoff:this.d(6+idx*2,8),docCutoff:this.d(5+idx*2,10),capacityTeu:8500,status:'PLANNED',source:'TEST_DATA',remarks:`Synthetic schedule for Job ${bookingNo}`,createdBy:'SYSTEM_TEST_DATA'},
        create:{scheduleNo,carrier:x.carrier.name,serviceName:`TEST SERVICE ${x.key}`,vessel:`TEST VESSEL ${idx+1}`,imoNo:`TESTIMO${100000+idx}`,voyage:`TV${100+idx}`,direction:'EASTBOUND',portOfLoading:x.pol,portOfDischarge:x.pod,terminal:`TEST TERMINAL ${x.pol}`,etd:this.d(7+idx*2,18),eta:this.d(28+idx*4,8),atd:x.status==='OPERATIONAL'?this.d(-1,19):this.d(7+idx*2,19),ata:x.status==='OPERATIONAL'?this.d(1,9):this.d(28+idx*4,9),cyClosing:this.d(5+idx*2,12),siCutoff:this.d(5+idx*2,8),vgmCutoff:this.d(6+idx*2,8),docCutoff:this.d(5+idx*2,10),capacityTeu:8500,status:'PLANNED',source:'TEST_DATA',remarks:`Synthetic schedule for Job ${bookingNo}`,createdBy:'SYSTEM_TEST_DATA'}
      });

      await this.db.transportOrder.deleteMany({where:{bookingId:booking.id,orderNo:{startsWith:'TEST-TRN-'}}});
      await this.db.transportOrder.create({data:{
        orderNo:`TEST-TRN-${bookingNo}`,bookingId:booking.id,orderType:'EXPORT_PICKUP',providerName:'TEST ANC Trucking Partner',
        driverName:'Test Driver',driverPhone:'+31-000-000-0000',truckNo:`TEST-TRUCK-${idx+1}`,trailerNo:`TEST-TRL-${idx+1}`,
        pickupLocation:`TEST SHIPPER ${x.origin}`,deliveryLocation:`TEST TERMINAL ${x.pol}`,plannedPickupAt:this.d(3+idx,9),plannedDeliveryAt:this.d(3+idx,15),
        status:'PLANNED',customerReference:`TEST-TRN-CUST-${x.key}`,providerReference:`TEST-TRN-PROV-${x.key}`,instructions:'Synthetic transport order — testing only',createdBy:'SYSTEM_TEST_DATA'
      }});

      await this.event('CarrierBooking',`TEST-CBR-${x.key}`,'CARRIER_BOOKING_REQUESTED',{
        carrierOperationNo:`TEST-CBR-${x.key}`,bookingId:booking.id,bookingNo,carrierId:x.carrier.id,carrierCode:x.carrier.providerCode,
        carrierName:x.carrier.name,scheduleNo,serviceName:`TEST SERVICE ${x.key}`,vessel:`TEST VESSEL ${idx+1}`,voyage:`TV${100+idx}`,
        portOfLoading:x.pol,portOfDischarge:x.pod,terminal:`TEST TERMINAL ${x.pol}`,etd:this.d(7+idx*2,18),eta:this.d(28+idx*4,8),
        cyClosing:this.d(5+idx*2,12),siCutoff:this.d(5+idx*2,8),vgmCutoff:this.d(6+idx*2,8),docCutoff:this.d(5+idx*2,10),
        equipmentType:x.equipment,quantity:x.qty,spaceTeu:(String(x.equipment).includes('40')?2:1)*x.qty,
        carrierBookingNo:['CONFIRMED','OPERATIONAL'].includes(x.status)?`TEST-CARRIER-BKG-${x.key}-9911`:null,
        confirmationStatus:['CONFIRMED','OPERATIONAL'].includes(x.status)?'CONFIRMED':'REQUESTED',allocationStatus:'ALLOCATED',
        allocationRef:`TEST-ALLOC-${x.key}`,equipmentReleaseStatus:x.status==='OPERATIONAL'?'RELEASED':'PENDING',
        notes:'Synthetic carrier-space record — testing only',requestedBy:'SYSTEM_TEST_DATA',testData:true
      },'COMPLETED','ANCLINE_CARRIER_OPERATIONS');
      await this.event('CarrierPaymentInstruction',booking.id,'CARRIER_PAYMENT_INSTRUCTIONS_SET',{bookingId:booking.id,bookingNo,instructions:[
        {chargeGroup:'ORIGIN_PORT',term:'PREPAID_ORIGIN',applicable:true,payerType:'ANC_REGISTERED_OFFICE',payerName:'TEST ANC ORIGIN OFFICE',payerCountryCode:x.origin.slice(0,2),ancOfficeCountryValidated:true},
        {chargeGroup:'SEA_FREIGHT',term:'PREPAID_ORIGIN',applicable:true,payerType:'ANC_REGISTERED_OFFICE',payerName:'TEST ANC ORIGIN OFFICE',payerCountryCode:x.origin.slice(0,2),ancOfficeCountryValidated:true},
        {chargeGroup:'DESTINATION_PORT',term:'COLLECT',applicable:true,payerType:'ANC_REGISTERED_OFFICE',payerName:'TEST ANC DESTINATION OFFICE',payerCountryCode:x.destination.slice(0,2),ancOfficeCountryValidated:true},
        {chargeGroup:'ORIGIN_HAULAGE',term:x.service==='DOOR_TO_DOOR'?'PREPAID_ORIGIN':'NOT_APPLICABLE',applicable:x.service==='DOOR_TO_DOOR'},
        {chargeGroup:'DESTINATION_HAULAGE',term:x.service==='DOOR_TO_DOOR'?'COLLECT':'NOT_APPLICABLE',applicable:x.service==='DOOR_TO_DOOR'}
      ],customerDataOutbound:false,houseDataOutbound:false,testData:true},'COMPLETED','ANCLINE_CARRIER_PAYMENT');
      await this.event('CarrierRateOffer',booking.id,'RATE_OFFER_SELECTED',{bookingId:booking.id,providerCode:x.carrier.providerCode,externalQuoteRef:`TEST-CARRIER-QUOTE-${x.key}-7788`,buy:x.buy,currency:x.currency,testData:true},'COMPLETED','ANCLINE_RATE_PROCUREMENT',booking.id);
    }

    const nvCustomer=customerRows[0],nvBookingNo=TEST_JOB_REFS[4];
    const nv=await this.db.booking.upsert({
      where:{bookingNo:nvBookingNo},
      update:{owningBranchId:branch.id,businessModel:'NVOCC',bookingChannel:'AGENT_PORTAL',shipmentNo:'ANC-TEST-NVOCC-SHP-001',shipmentStatus:'OPERATIONAL',customerId:nvCustomer.id,customerRef:nvCustomer.customerRef,costCenterCode:'TEST-NVOCC-NL',jobType:'NVOCC_FCL',forwardingTradeType:null,producingAgentId:agent.id,salesOwner:'TEST NVOCC SALES',operator:'TEST NVOCC OPS',bookingType:'FCL',transportMode:'SEA',serviceType:'PORT_TO_PORT',bookingDate:this.d(-3),customerReference:'TEST-NVOCC-CUST-REF',shipperReference:'TEST-NVOCC-SHIPPER-REF',carrierBookingNo:'TEST-NVOCC-CARRIER-BKG-001',houseBL:'ANC-TEST-NVOCC-HBL-001',masterBL:'TEST-NVOCC-MBL-001',shipper:'TEST NVOCC HOUSE SHIPPER',consignee:'TEST NVOCC HOUSE CONSIGNEE',notifyParty:'TEST NVOCC NOTIFY',origin:'SGSIN',destination:'NLRTM',placeOfReceipt:'SGSIN',portOfLoading:'SGSIN',portOfDischarge:'NLRTM',placeOfDelivery:'NLRTM',terminal:'TEST PSA TERMINAL',polAgent:'TEST Liner Agent Singapore',podAgent:'TEST ANC Netherlands',etd:this.d(6,20),eta:this.d(31,8),cyClosing:this.d(4,12),siCutoff:this.d(4,8),vgmCutoff:this.d(5,8),docCutoff:this.d(4,10),portCutoff:this.d(5,14),carrier:carrierRows[0].name,vesselVoyage:'TEST NVOCC VESSEL / N001',equipment:'40HC',quantity:1,containerOwner:'CARRIER',throughBL:x.throughBL,commodity:'Consumer goods',packageCount:920,packageType:'CARTONS',grossWeight:22400,netWeight:21600,volumeCbm:64.5,marksNumbers:'TEST NVOCC MARKS',hsCode:'851762',cargoDescription:'SYNTHETIC TEST NVOCC CARGO',incoterm:'FOB',freightTerms:'PREPAID',currency:'USD',status:'OPERATIONAL',creditStatus:'Passed',slotStatus:'ALLOCATED',equipmentStatus:'RELEASED',notes:'SYNTHETIC TEST NVOCC BOOKING — NVOCC PORTAL ONLY'},
      create:{owningBranchId:branch.id,bookingNo:nvBookingNo,businessModel:'NVOCC',bookingChannel:'AGENT_PORTAL',shipmentNo:'ANC-TEST-NVOCC-SHP-001',shipmentStatus:'OPERATIONAL',customerId:nvCustomer.id,customerRef:nvCustomer.customerRef,costCenterCode:'TEST-NVOCC-NL',jobType:'NVOCC_FCL',producingAgentId:agent.id,salesOwner:'TEST NVOCC SALES',operator:'TEST NVOCC OPS',bookingType:'FCL',transportMode:'SEA',serviceType:'PORT_TO_PORT',bookingDate:this.d(-3),customerReference:'TEST-NVOCC-CUST-REF',shipperReference:'TEST-NVOCC-SHIPPER-REF',carrierBookingNo:'TEST-NVOCC-CARRIER-BKG-001',houseBL:'ANC-TEST-NVOCC-HBL-001',masterBL:'TEST-NVOCC-MBL-001',shipper:'TEST NVOCC HOUSE SHIPPER',consignee:'TEST NVOCC HOUSE CONSIGNEE',notifyParty:'TEST NVOCC NOTIFY',origin:'SGSIN',destination:'NLRTM',placeOfReceipt:'SGSIN',portOfLoading:'SGSIN',portOfDischarge:'NLRTM',placeOfDelivery:'NLRTM',terminal:'TEST PSA TERMINAL',polAgent:'TEST Liner Agent Singapore',podAgent:'TEST ANC Netherlands',etd:this.d(6,20),eta:this.d(31,8),cyClosing:this.d(4,12),siCutoff:this.d(4,8),vgmCutoff:this.d(5,8),docCutoff:this.d(4,10),portCutoff:this.d(5,14),carrier:carrierRows[0].name,vesselVoyage:'TEST NVOCC VESSEL / N001',equipment:'40HC',quantity:1,containerOwner:'CARRIER',throughBL:x.throughBL,commodity:'Consumer goods',packageCount:920,packageType:'CARTONS',grossWeight:22400,netWeight:21600,volumeCbm:64.5,marksNumbers:'TEST NVOCC MARKS',hsCode:'851762',cargoDescription:'SYNTHETIC TEST NVOCC CARGO',incoterm:'FOB',freightTerms:'PREPAID',currency:'USD',status:'OPERATIONAL',creditStatus:'Passed',slotStatus:'ALLOCATED',equipmentStatus:'RELEASED',notes:'SYNTHETIC TEST NVOCC BOOKING — NVOCC PORTAL ONLY'}
    });

    await this.event('TestSeed','ANCLINE_TEST_SEED','TEST_DATA_SEEDED',{seededAt:this.now().toISOString(),customers:customerRows.map(x=>x.customerRef),carriers:carrierRows.map(x=>x.providerCode),bookings:[...bookingRows.map(x=>x.bookingNo),nvBookingNo],jobRefRule:'EXACTLY_5_DIGITS',warning:'SYNTHETIC TEST DATA ONLY'});
    return this.summary(user);
  }

  async summary(user?:ScopeUser){
    this.admin(user);
    const [customers,carriers,bookings,users]=await Promise.all([
      this.db.organization.findMany({where:{code:{startsWith:'TEST-CUST-'}},orderBy:{code:'asc'}}),
      this.db.organization.findMany({where:{code:{startsWith:'TEST-CARRIER-'}},orderBy:{code:'asc'}}),
      this.db.booking.findMany({where:{OR:[{bookingNo:{in:[...TEST_JOB_REFS]}},{bookingNo:{startsWith:'ANC-TEST-'}}]},include:{rateQuote:true,containers:true,documents:true,financeLines:true,tasks:true,approvals:true,routingLegs:true,milestones:true,closeoutChecklist:true},orderBy:{bookingNo:'asc'}}),
      this.db.userAccount.findMany({where:{email:{endsWith:'@ancline.invalid'}},orderBy:{email:'asc'}})
    ]);
    return {
      warning:'SYNTHETIC TEST DATA ONLY — NEVER USE FOR REAL CUSTOMERS, CARRIERS OR SHIPMENTS.',
      summary:{customers:customers.length,carriers:carriers.length,bookings:bookings.length,testUsers:users.length},
      customers:customers.map((x:any)=>({id:x.id,code:x.code,name:x.name,countryCode:x.countryCode,customerRef:x.customerRef,registrationRef:x.registrationRef,costCenterCode:x.costCenterCode,kycStatus:x.kycStatus})),
      carriers:carriers.map((x:any)=>({id:x.id,code:x.code,name:x.name,countryCode:x.countryCode})),
      users:users.map((x:any)=>({email:x.email,displayName:x.displayName,role:x.role,customerId:x.customerId,agentId:x.agentId,permissions:x.permissions})),
      bookings:bookings.map((b:any)=>({id:b.id,bookingNo:b.bookingNo,businessModel:b.businessModel,channel:b.bookingChannel,status:b.status,shipmentStatus:b.shipmentStatus,customerRef:b.customerRef,carrier:b.carrier,carrierBookingNo:b.carrierBookingNo,route:`${b.origin} → ${b.destination}`,equipment:`${b.quantity||0} x ${b.equipment||'-'}`,specialCargo:b.specialCargo,quoteNo:b.rateQuote?.quoteNo||null,houseBL:b.houseBL,masterBL:b.masterBL,containers:b.containers.length,documents:b.documents.length,financeLines:b.financeLines.length,tasks:b.tasks.length,approvals:b.approvals.length,routingLegs:b.routingLegs.length,milestones:b.milestones.length,closeoutItems:b.closeoutChecklist.length}))
    };
  }

  async reset(user?:ScopeUser){
    this.admin(user);
    const [bookings,testCustomers]=await Promise.all([
      this.db.booking.findMany({where:{OR:[{bookingNo:{in:[...TEST_JOB_REFS]}},{bookingNo:{startsWith:'ANC-TEST-'}}]},select:{id:true}}),
      this.db.organization.findMany({where:{code:{startsWith:'TEST-CUST-'}},select:{id:true}})
    ]);
    const ids=bookings.map((x:any)=>x.id),customerIds=testCustomers.map((x:any)=>x.id);
    if(ids.length){
      await this.db.jobCloseoutChecklist.deleteMany({where:{bookingId:{in:ids}}});
      await this.db.approval.deleteMany({where:{bookingId:{in:ids}}});
      await this.db.task.deleteMany({where:{bookingId:{in:ids}}});
      await this.db.financeLine.deleteMany({where:{bookingId:{in:ids}}});
      await this.db.container.deleteMany({where:{bookingId:{in:ids}}});
      await this.db.document.deleteMany({where:{bookingId:{in:ids}}});
      await this.db.shipmentMilestone.deleteMany({where:{bookingId:{in:ids}}});
      await this.db.bookingLeg.deleteMany({where:{bookingId:{in:ids}}});
      await this.db.auditEvent.deleteMany({where:{bookingId:{in:ids}}});
      await this.db.integrationEvent.deleteMany({where:{sourceSystem:'ANCLINE_CARRIER_PAYMENT',objectId:{in:ids}}});
      await this.db.integrationEvent.deleteMany({where:{sourceSystem:'ANCLINE_RATE_PROCUREMENT',objectType:'CarrierRateOffer',objectId:{in:ids}}});
      await this.db.booking.deleteMany({where:{id:{in:ids}}});
    }
    if(customerIds.length)await this.db.integrationEvent.deleteMany({where:{sourceSystem:'ANCLINE_CREDIT_CONTROL',objectType:'CreditProfile',objectId:{in:customerIds}}});
    await this.db.integrationEvent.deleteMany({where:{sourceSystem:'ANCLINE_RATE_PROCUREMENT',objectType:'CarrierRateProvider',objectId:{in:['TEST_ATLANTIC','TEST_PACIFIC','TEST_GULF']}}});
    await this.db.integrationEvent.deleteMany({where:{sourceSystem:'ANCLINE_CARRIER_OPERATIONS',objectType:'CarrierBooking',objectId:{startsWith:'TEST-CBR-'}}});
    await this.db.transportOrder.deleteMany({where:{orderNo:{startsWith:'TEST-TRN-'}}});
    await this.db.vesselVoyageSchedule.deleteMany({where:{scheduleNo:{startsWith:'TEST-SCH-'}}});
    await this.db.integrationEvent.deleteMany({where:{sourceSystem:SOURCE}});
    await this.db.rateQuote.deleteMany({where:{quoteNo:{startsWith:'ANC-TEST-'}}});
    await this.db.userAccount.deleteMany({where:{email:{endsWith:'@ancline.invalid'}}});
    await this.db.organization.deleteMany({where:{OR:[{code:{startsWith:'TEST-CUST-'}},{code:{startsWith:'TEST-CARRIER-'}},{code:'TEST-AGENT-SG'}]}});
    await this.db.branch.deleteMany({where:{code:'TEST-NL-BR'}});
    return {reset:true,deletedBookings:ids.length,deletedCustomers:customerIds.length};
  }
}
