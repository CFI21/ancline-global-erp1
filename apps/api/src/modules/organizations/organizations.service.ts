import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class OrganizationsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}

  list(){ return this.prisma.organization.findMany({orderBy:{name:'asc'}}); }
  get(id:string){ return this.prisma.organization.findUnique({where:{id}}); }
  create(body:any,user:ScopeUser){ this.scope.assertInternal(user); return this.prisma.organization.create({data:body}); }

  private text(v:any){return String(v??'').trim();}
  private admin(user:ScopeUser){if(String(user?.role||'').toUpperCase()!=='GLOBAL_ADMIN')throw new ForbiddenException('Global Admin approval is required');}
  private ref(prefix:string){return `${prefix}-${new Date().getUTCFullYear()}-${Date.now().toString().slice(-8)}`;}

  async registerCustomer(body:any){
    const legalName=this.text(body?.legalName||body?.companyName),countryCode=this.text(body?.countryCode).toUpperCase();
    const companyRegistrationNo=this.text(body?.companyRegistrationNo),taxId=this.text(body?.taxId||body?.vatNo);
    const registeredAddress=this.text(body?.registeredAddress),contactName=this.text(body?.contactName);
    const contactEmail=this.text(body?.contactEmail).toLowerCase(),contactPhone=this.text(body?.contactPhone);
    const businessType=this.text(body?.businessType),website=this.text(body?.website);
    const sanctionsDeclaration=body?.sanctionsDeclaration===true,termsAccepted=body?.termsAccepted===true,privacyAccepted=body?.privacyAccepted===true;
    const beneficialOwners=Array.isArray(body?.beneficialOwners)?body.beneficialOwners:[],directors=Array.isArray(body?.directors)?body.directors:[];
    const documents=Array.isArray(body?.documents)?body.documents:[];
    if(!legalName||!countryCode||!companyRegistrationNo||!registeredAddress||!contactName||!contactEmail||!contactPhone||!businessType)
      throw new BadRequestException('Legal name, country, company registration, address, contact person, email, phone and business type are required');
    if(!/^[A-Z]{2}$/.test(countryCode))throw new BadRequestException('Country code must be a 2-letter ISO code');
    if(!/^\S+@\S+\.\S+$/.test(contactEmail))throw new BadRequestException('A valid contact email is required');
    if(!beneficialOwners.length)throw new BadRequestException('At least one beneficial owner / UBO is required for KYC');
    if(!directors.length)throw new BadRequestException('At least one director / authorized signatory is required for KYC');
    if(!sanctionsDeclaration||!termsAccepted||!privacyAccepted)throw new BadRequestException('KYC declarations, terms and privacy acceptance are required');
    const existing=await this.prisma.organization.findFirst({where:{OR:[
      {registrationRef:companyRegistrationNo},
      {name:{equals:legalName,mode:'insensitive'}}
    ]}});
    if(existing&&existing.kycStatus!=='REJECTED')throw new BadRequestException('This company already has an ANC registration or KYC application');
    const registrationRef=this.ref('ANC-REG'),code=`REG${Date.now().toString().slice(-7)}`;
    const kycData={
      legalName,tradingName:this.text(body?.tradingName)||null,countryCode,companyRegistrationNo,taxId:taxId||null,
      registeredAddress,operatingAddress:this.text(body?.operatingAddress)||registeredAddress,
      contactName,contactEmail,contactPhone,businessType,website:website||null,
      beneficialOwners,directors,bankDetails:body?.bankDetails&&typeof body.bankDetails==='object'?body.bankDetails:null,
      expectedTradeLanes:Array.isArray(body?.expectedTradeLanes)?body.expectedTradeLanes:[],
      expectedMonthlyShipments:Number(body?.expectedMonthlyShipments||0)||null,
      dangerousGoods:Boolean(body?.dangerousGoods),
      sanctionsDeclaration,termsAccepted,privacyAccepted,documents,
      submittedTermsVersion:'ANC-CUSTOMER-KYC-2026.1'
    };
    const row=await this.prisma.organization.create({data:{
      code,name:legalName,roles:['CUSTOMER'],countryCode,registrationRef,kycStatus:'SUBMITTED',kycData,
      kycSubmittedAt:new Date(),active:false
    }});
    await this.audit.log({actorId:contactEmail,action:'CUSTOMER_KYC_SUBMIT',objectType:'Organization',objectId:row.id,detail:{registrationRef,legalName,countryCode,contactEmail}});
    return {registrationRef,kycStatus:row.kycStatus,companyName:row.name,submittedAt:row.kycSubmittedAt};
  }

  async registrationStatus(registrationRef:string){
    const ref=this.text(registrationRef).toUpperCase();
    const row=await this.prisma.organization.findFirst({where:{registrationRef:ref}});
    if(!row)throw new BadRequestException('Registration reference was not found');
    return {registrationRef:row.registrationRef,customerRef:row.customerRef,companyName:row.name,kycStatus:row.kycStatus,rejectionReason:row.kycStatus==='REJECTED'?row.kycRejectionReason:null,approvedAt:row.kycApprovedAt,submittedAt:row.kycSubmittedAt};
  }

  async kycQueue(user:ScopeUser){
    this.admin(user);
    return this.prisma.organization.findMany({
      where:{kycStatus:{in:['SUBMITTED','UNDER_REVIEW','REJECTED','APPROVED']}},
      select:{id:true,code:true,name:true,countryCode:true,registrationRef:true,customerRef:true,costCenterCode:true,kycStatus:true,kycData:true,kycSubmittedAt:true,kycApprovedAt:true,kycApprovedBy:true,kycRejectedAt:true,kycRejectionReason:true,active:true},
      orderBy:{kycSubmittedAt:'desc'},take:500
    });
  }

  async setKycReview(id:string,user:ScopeUser){
    this.admin(user);
    const row=await this.prisma.organization.findUnique({where:{id}});
    if(!row)throw new BadRequestException('Customer registration not found');
    if(!['SUBMITTED','UNDER_REVIEW'].includes(row.kycStatus))throw new BadRequestException('Only submitted KYC can be moved to review');
    const updated=await this.prisma.organization.update({where:{id},data:{kycStatus:'UNDER_REVIEW'}});
    await this.audit.log({actorId:user.sub,action:'CUSTOMER_KYC_REVIEW',objectType:'Organization',objectId:id,detail:{registrationRef:row.registrationRef}});
    return updated;
  }

  async approveKyc(id:string,body:any,user:ScopeUser){
    this.admin(user);
    const row=await this.prisma.organization.findUnique({where:{id}});
    if(!row)throw new BadRequestException('Customer registration not found');
    if(!['SUBMITTED','UNDER_REVIEW'].includes(row.kycStatus))throw new BadRequestException('Only submitted or under-review KYC can be approved');
    const costCenterCode=this.text(body?.costCenterCode).toUpperCase();
    if(!costCenterCode)throw new BadRequestException('Forwarding cost center is required before customer approval');
    const customerRef=row.customerRef||this.ref('ANC-CUS');
    const updated=await this.prisma.organization.update({where:{id},data:{
      customerRef,costCenterCode,kycStatus:'APPROVED',kycApprovedAt:new Date(),kycApprovedBy:user.sub,
      kycRejectedAt:null,kycRejectedBy:null,kycRejectionReason:null,active:true
    }});
    const kyc:any=row.kycData||{},email=this.text(kyc.contactEmail).toLowerCase(),displayName=this.text(kyc.contactName)||row.name;
    let provisioned=false;
    if(email){
      const existing=await this.prisma.userAccount.findUnique({where:{email}});
      if(!existing){
        await this.prisma.userAccount.create({data:{email,displayName,role:'CUSTOMER',customerId:id,costCenterCode,permissions:['FORWARDING_PORTAL','FORWARDING_QUOTES','FORWARDING_BOOKINGS'],active:true}});
        provisioned=true;
      }else if(existing.role==='CUSTOMER'){
        await this.prisma.userAccount.update({where:{id:existing.id},data:{customerId:id,costCenterCode,active:true}});
        provisioned=true;
      }
    }
    await this.audit.log({actorId:user.sub,action:'CUSTOMER_KYC_APPROVE',objectType:'Organization',objectId:id,detail:{registrationRef:row.registrationRef,customerRef,costCenterCode,loginProvisioned:provisioned}});
    return {id:updated.id,registrationRef:updated.registrationRef,customerRef:updated.customerRef,costCenterCode:updated.costCenterCode,kycStatus:updated.kycStatus,active:updated.active,loginProvisioned:provisioned};
  }

  async rejectKyc(id:string,body:any,user:ScopeUser){
    this.admin(user);
    const reason=this.text(body?.reason);if(!reason)throw new BadRequestException('KYC rejection reason is required');
    const row=await this.prisma.organization.findUnique({where:{id}});if(!row)throw new BadRequestException('Customer registration not found');
    const updated=await this.prisma.organization.update({where:{id},data:{kycStatus:'REJECTED',kycRejectedAt:new Date(),kycRejectedBy:user.sub,kycRejectionReason:reason,active:false}});
    await this.audit.log({actorId:user.sub,action:'CUSTOMER_KYC_REJECT',objectType:'Organization',objectId:id,detail:{registrationRef:row.registrationRef,reason}});
    return updated;
  }
}
