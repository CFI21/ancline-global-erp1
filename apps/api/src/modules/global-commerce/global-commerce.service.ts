import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const SOURCE='ANCLINE_GLOBAL_COMMERCE';

@Injectable()
export class GlobalCommerceService {
  constructor(private prisma:PrismaService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private admin(user:ScopeUser){if(String(user?.role||'').toUpperCase()!=='GLOBAL_ADMIN')throw new ForbiddenException('Global Admin access required');}
  private internal(user:ScopeUser){if(!['GLOBAL_ADMIN','CONTROL_TOWER','BRANCH_OPS','FINANCE'].includes(String(user?.role||'').toUpperCase()))throw new ForbiddenException('Internal ANC access required');}
  private text(v:any){return String(v??'').trim();}
  private upper(v:any){return this.text(v).toUpperCase();}
  private id(prefix:string,value?:string){const clean=this.upper(value).replace(/[^A-Z0-9_-]/g,'');return clean?prefix+'-'+clean:prefix+'-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();}
  private payload(e:any){return (e?.payload&&typeof e.payload==='object'?e.payload:{}) as any;}
  private async events(objectType:string){return this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE,objectType},orderBy:{createdAt:'asc'}});}
  private latest(rows:any[]){const m=new Map<string,any>();for(const e of rows)m.set(e.objectId,{...this.payload(e),objectId:e.objectId,eventType:e.eventType,updatedAt:e.createdAt});return [...m.values()];}
  private async write(objectType:string,eventType:string,objectId:string,payload:any,user:ScopeUser){
    const row=await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType,objectType,objectId,status:'COMPLETED',completedAt:new Date(),payload:{...payload,updatedBy:user.sub}}});
    await this.audit.log({actorId:user.sub,action:eventType,objectType,objectId,detail:payload});return row.payload;
  }
  private countryCode(v:any){const code=this.upper(v);if(!/^[A-Z]{2}$/.test(code))throw new BadRequestException('Country code must be ISO alpha-2');return code;}
  private currency(v:any){const code=this.upper(v);if(!/^[A-Z]{3}$/.test(code))throw new BadRequestException('Currency must be ISO alpha-3');return code;}
  private timezone(v:any){const z=this.text(v);if(!z||!z.includes('/'))throw new BadRequestException('Timezone must be an IANA timezone such as Europe/Amsterdam');return z;}

  async countries(user:ScopeUser){this.internal(user);return this.latest(await this.events('CountryProfile')).sort((a:any,b:any)=>String(a.countryCode).localeCompare(String(b.countryCode)));}
  async offices(user:ScopeUser){this.internal(user);return this.latest(await this.events('AncOfficeProfile')).sort((a:any,b:any)=>String(a.officeCode).localeCompare(String(b.officeCode)));}
  async locations(user:ScopeUser){this.internal(user);return this.latest(await this.events('LocationProfile')).sort((a:any,b:any)=>String(a.locationCode).localeCompare(String(b.locationCode)));}

  async setCountry(codeInput:string,body:any,user:ScopeUser){
    this.admin(user);const countryCode=this.countryCode(codeInput||body?.countryCode);const countryName=this.text(body?.countryName||body?.name);
    if(!countryName)throw new BadRequestException('Country name is required');
    const localCurrency=this.currency(body?.localCurrency||'USD'),timezone=this.timezone(body?.timezone||'Etc/UTC');
    const supportedLanguages=Array.isArray(body?.supportedLanguages)?body.supportedLanguages.map((x:any)=>this.text(x)).filter(Boolean):['en'];
    const customerPaymentMethods=Array.isArray(body?.customerPaymentMethods)?body.customerPaymentMethods.map((x:any)=>this.upper(x)).filter(Boolean):[];
    const payload={countryCode,countryName,serviceEnabled:body?.serviceEnabled!==false,customerRegistrationEnabled:body?.customerRegistrationEnabled!==false,forwardingEnabled:body?.forwardingEnabled!==false,nvoccEnabled:Boolean(body?.nvoccEnabled),customsEnabled:Boolean(body?.customsEnabled),haulageEnabled:Boolean(body?.haulageEnabled),carrierPayerAllowed:Boolean(body?.carrierPayerAllowed),localCurrency,timezone,supportedLanguages,defaultLanguage:this.text(body?.defaultLanguage||supportedLanguages[0]||'en'),customerPaymentMethods,taxRegime:this.upper(body?.taxRegime||'CONFIG_REQUIRED'),eInvoiceMode:this.upper(body?.eInvoiceMode||'CONFIG_REQUIRED'),dataRegion:this.upper(body?.dataRegion||'EU'),active:body?.active!==false,notes:this.text(body?.notes)||null};
    return this.write('CountryProfile','COUNTRY_PROFILE_SET','COUNTRY-'+countryCode,payload,user);
  }

  async setOffice(idInput:string|undefined,body:any,user:ScopeUser){
    this.admin(user);const officeCode=this.upper(body?.officeCode);if(!officeCode)throw new BadRequestException('Office code is required');
    const countryCode=this.countryCode(body?.countryCode),officeName=this.text(body?.officeName),legalEntityName=this.text(body?.legalEntityName),address=this.text(body?.address),city=this.text(body?.city);
    if(!officeName||!legalEntityName||!address||!city)throw new BadRequestException('Office name, legal entity, address and city are required');
    const countries=await this.countries(user);const country=countries.find((x:any)=>x.countryCode===countryCode&&x.active!==false);
    if(!country)throw new BadRequestException('Country must be configured and active in Global Commerce Master first');
    const officeId=this.upper(idInput||this.id('OFFICE',officeCode));
    const payload={officeId,officeCode,officeName,legalEntityName,countryCode,address,city,postalCode:this.text(body?.postalCode)||null,timezone:this.timezone(body?.timezone||country.timezone),currency:this.currency(body?.currency||country.localCurrency),registrationNo:this.text(body?.registrationNo)||null,taxRegistrationNo:this.text(body?.taxRegistrationNo)||null,registeredOffice:body?.registeredOffice!==false,carrierPayerEligible:body?.carrierPayerEligible===true&&country.carrierPayerAllowed===true,customerBillingEnabled:body?.customerBillingEnabled!==false,forwardingEnabled:body?.forwardingEnabled!==false,nvoccEnabled:Boolean(body?.nvoccEnabled),active:body?.active!==false,notes:this.text(body?.notes)||null};
    return this.write('AncOfficeProfile','ANC_OFFICE_PROFILE_SET',officeId,payload,user);
  }

  async setLocation(codeInput:string|undefined,body:any,user:ScopeUser){
    this.admin(user);const countryCode=this.countryCode(body?.countryCode),name=this.text(body?.name),type=this.upper(body?.type||'PORT');
    if(!name)throw new BadRequestException('Location name is required');
    if(!['PORT','TERMINAL','DEPOT','CITY','AIRPORT','RAIL_RAMP','WAREHOUSE'].includes(type))throw new BadRequestException('Unsupported location type');
    const unLocode=this.upper(body?.unLocode||body?.unlocode);if(unLocode&&!/^[A-Z]{2}[A-Z0-9]{3}$/.test(unLocode))throw new BadRequestException('UN/LOCODE must be 5 characters such as NLRTM');
    const locationCode=this.upper(codeInput||body?.locationCode||unLocode||this.id('LOC')).replace(/[^A-Z0-9_-]/g,'');
    const countries=await this.countries(user);const country=countries.find((x:any)=>x.countryCode===countryCode&&x.active!==false);if(!country)throw new BadRequestException('Country must be configured and active first');
    const carrierMappings=body?.carrierMappings&&typeof body.carrierMappings==='object'?body.carrierMappings:{};
    const payload={locationCode,name,type,countryCode,unLocode:unLocode||null,timezone:this.text(body?.timezone||country.timezone),portCode:this.upper(body?.portCode)||null,terminalCode:this.upper(body?.terminalCode)||null,postalCode:this.text(body?.postalCode)||null,carrierMappings,active:body?.active!==false,notes:this.text(body?.notes)||null};
    return this.write('LocationProfile','LOCATION_PROFILE_SET','LOCATION-'+locationCode,payload,user);
  }

  async readiness(user:ScopeUser){
    this.internal(user);
    const [countries,offices,locations]=await Promise.all([this.countries(user),this.offices(user),this.locations(user)]);
    const activeCountries=countries.filter((x:any)=>x.active!==false&&x.serviceEnabled!==false);
    const activeOffices=offices.filter((x:any)=>x.active!==false&&x.registeredOffice!==false);
    const payerOffices=activeOffices.filter((x:any)=>x.carrierPayerEligible===true);
    const activeLocations=locations.filter((x:any)=>x.active!==false);
    const blockers:string[]=[];
    if(!activeCountries.length)blockers.push('No active service countries configured');
    if(!activeOffices.length)blockers.push('No active registered ANC offices configured');
    if(!payerOffices.length)blockers.push('No carrier-payer eligible ANC offices configured');
    if(!activeLocations.length)blockers.push('No controlled global locations configured');
    return {ready:blockers.length===0,blockers,summary:{countries:activeCountries.length,registeredOffices:activeOffices.length,carrierPayerOffices:payerOffices.length,locations:activeLocations.length},countries:activeCountries,offices:activeOffices,locations:activeLocations};
  }

  async demo(user:ScopeUser){
    this.internal(user);
    const stages=[
      {step:1,code:'REGISTER',title:'Customer Registration',status:'COMPLETE',detail:'Demo Global Trading B.V. submits ANC registration and KYC. No carrier receives this data.'},
      {step:2,code:'KYC',title:'ANC KYC / Compliance',status:'COMPLETE',detail:'Synthetic demo is approved and receives ANC-CUS-DEMO-1001.'},
      {step:3,code:'RATE',title:'Global Carrier Rate Search',status:'COMPLETE',detail:'ANC carrier account searches NLRTM → AEJEA. Carrier returns a synthetic buy offer of USD 1,400.'},
      {step:4,code:'QUOTE',title:'ANC Quote',status:'COMPLETE',detail:'ANCLINE adds USD 250 margin and issues ANC-FWD-Q-DEMO-1001 at USD 1,650.'},
      {step:5,code:'ACCEPT',title:'Customer Acceptance',status:'COMPLETE',detail:'Customer accepts ANC terms and ANC quote only. Carrier quote reference remains internal.'},
      {step:6,code:'CUSTOMER_PAYMENT',title:'Customer → ANC Security',status:'PENDING',detail:'Demo customer is PREPAID 100%. ANCLINE requires USD 1,650 customer payment before release.'},
      {step:7,code:'ANC_BOOKING',title:'ANC Booking Created',status:'READY',detail:'ANC-FWD-BKG-DEMO-1001 is created; carrier submission waits for ANC payer control.'},
      {step:8,code:'CARRIER_PAYMENT',title:'ANC → Carrier Payer Control',status:'READY',detail:'Origin Port / Sea Freight / Destination Port settlement uses ANC office payer instructions only.'},
      {step:9,code:'CARRIER_BOOKING',title:'Carrier Booking',status:'READY',detail:'After payer validation ANCLINE sends ANC identity + operational cargo data to carrier. Customer KYC/HBL parties stay private.'},
      {step:10,code:'EXECUTION',title:'VGM → SI → MBL → Tracking',status:'FUTURE_CORE',detail:'Next automation batches connect carrier-specific execution while retaining the ANC privacy firewall.'}
    ];
    return {
      demoOnly:true,synthetic:true,warning:'DEMO ONLY — does not create a customer, booking, payment, carrier request or registered office.',
      scenario:{customer:'Demo Global Trading B.V.',ancCustomerRef:'ANC-CUS-DEMO-1001',origin:{code:'NLRTM',name:'Rotterdam',country:'NL'},destination:{code:'AEJEA',name:'Jebel Ali',country:'AE'},equipment:'1 x 40HC',commodity:'General Cargo',carrier:'DEMO OCEAN CARRIER',carrierBuy:{amount:1400,currency:'USD'},ancSell:{amount:1650,currency:'USD'},margin:{amount:250,currency:'USD',pct:17.86},customerPayment:{mode:'PREPAID',requiredPct:100,requiredAmount:1650,currency:'USD'},ancCarrierPayment:{originPort:'PREPAID_ORIGIN',seaFreight:'PREPAID_ORIGIN',destinationPort:'COLLECT'}},
      references:{customer:'ANC-CUS-DEMO-1001',quote:'ANC-FWD-Q-DEMO-1001',booking:'ANC-FWD-BKG-DEMO-1001',carrierQuote:'INTERNAL-DEMO-CQ-7788',carrierBooking:'INTERNAL-DEMO-CB-9911'},
      privacy:{customerKycOutbound:false,customerRefOutbound:false,houseBlOutbound:false,housePartiesOutbound:false,carrierBookingParty:'ANC ONLY'},stages
    };
  }
}
