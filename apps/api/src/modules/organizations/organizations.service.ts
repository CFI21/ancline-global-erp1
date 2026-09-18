import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class OrganizationsService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService,private storage:StorageService){}

  list(){ return this.prisma.organization.findMany({orderBy:{name:'asc'}}); }
  get(id:string){ return this.prisma.organization.findUnique({where:{id}}); }
  create(body:any,user:ScopeUser){ this.scope.assertInternal(user); return this.prisma.organization.create({data:body}); }

  private text(v:any){return String(v??'').trim();}
  private admin(user:ScopeUser){if(String(user?.role||'').toUpperCase()!=='GLOBAL_ADMIN')throw new ForbiddenException('Global Admin approval is required');}
  private ref(prefix:string){return `${prefix}-${new Date().getUTCFullYear()}-${Date.now().toString().slice(-8)}`;}
  private hash(v:string){return createHash('sha256').update(v).digest('hex');}
  private requiredKycDocs(){return ['Company registration certificate','Tax / VAT certificate','UBO identity document','Director / authorized signatory ID','Proof of registered address','Bank proof / account confirmation'];}
  private async issueUploadToken(organizationId:string){
    const token=randomBytes(32).toString('base64url'),hours=Math.max(1,Math.min(72,Number(process.env.KYC_UPLOAD_TOKEN_HOURS||24))),expiresAt=new Date(Date.now()+hours*3600000);
    await this.prisma.integrationEvent.create({data:{sourceSystem:'ANCLINE_KYC',eventType:'KYC_UPLOAD_AUTH_ISSUED',objectType:'KycUploadAuthorization',objectId:organizationId,status:'ACTIVE',completedAt:new Date(),payload:{tokenHash:this.hash(token),expiresAt:expiresAt.toISOString()}}});
    return {token,expiresAt};
  }
  private async validateUploadToken(row:any,tokenInput:any){
    const token=this.text(tokenInput);if(!token)throw new ForbiddenException('KYC upload authorization is required');
    const auth=await this.prisma.integrationEvent.findFirst({where:{sourceSystem:'ANCLINE_KYC',eventType:'KYC_UPLOAD_AUTH_ISSUED',objectType:'KycUploadAuthorization',objectId:row.id},orderBy:{createdAt:'desc'}});
    const p:any=auth?.payload||{};if(!auth||!p.tokenHash||p.tokenHash!==this.hash(token))throw new ForbiddenException('KYC upload authorization is invalid');
    if(!p.expiresAt||new Date(p.expiresAt).getTime()<Date.now())throw new ForbiddenException('KYC upload authorization has expired');
  }

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
      sanctionsDeclaration,termsAccepted,privacyAccepted,documentChecklist:documents,documents:[],
      submittedTermsVersion:'ANC-CUSTOMER-KYC-2026.1'
    };
    const row=await this.prisma.organization.create({data:{
      code,name:legalName,roles:['CUSTOMER'],countryCode,registrationRef,kycStatus:'SUBMITTED',kycData,
      kycSubmittedAt:new Date(),active:false
    }});
    const uploadAuth=await this.issueUploadToken(row.id);
    await this.audit.log({actorId:contactEmail,action:'CUSTOMER_KYC_SUBMIT',objectType:'Organization',objectId:row.id,detail:{registrationRef,legalName,countryCode,contactEmail}});
    return {registrationRef,kycStatus:row.kycStatus,companyName:row.name,submittedAt:row.kycSubmittedAt,kycUploadToken:uploadAuth.token,kycUploadTokenExpiresAt:uploadAuth.expiresAt,storage:this.storage.status()};
  }

  async registrationStatus(registrationRef:string){
    const ref=this.text(registrationRef).toUpperCase();
    const row=await this.prisma.organization.findFirst({where:{registrationRef:ref}});
    if(!row)throw new BadRequestException('Registration reference was not found');
    const kyc:any=row.kycData||{},uploaded=Array.isArray(kyc.documents)?kyc.documents:[];
    return {registrationRef:row.registrationRef,customerRef:row.customerRef,companyName:row.name,kycStatus:row.kycStatus,rejectionReason:row.kycStatus==='REJECTED'?row.kycRejectionReason:null,approvedAt:row.kycApprovedAt,submittedAt:row.kycSubmittedAt,documentsUploaded:uploaded.map((x:any)=>({documentType:x.documentType,filename:x.filename,uploadedAt:x.uploadedAt}))};
  }

  async createKycDocumentUpload(registrationRef:string,body:any){
    const ref=this.text(registrationRef).toUpperCase();
    const row=await this.prisma.organization.findFirst({where:{registrationRef:ref}});
    if(!row)throw new BadRequestException('Registration reference was not found');
    if(!['SUBMITTED','UNDER_REVIEW'].includes(row.kycStatus))throw new BadRequestException('KYC documents can only be uploaded while registration is under review');
    await this.validateUploadToken(row,body?.uploadToken);
    const documentType=this.text(body?.documentType),filename=this.text(body?.filename),contentType=this.text(body?.contentType).toLowerCase(),size=Number(body?.size||0);
    if(!this.requiredKycDocs().includes(documentType))throw new BadRequestException('Unsupported KYC document type');
    if(!filename||!['application/pdf','image/jpeg','image/png'].includes(contentType))throw new BadRequestException('KYC files must be PDF, JPG or PNG');
    if(!Number.isFinite(size)||size<=0||size>15*1024*1024)throw new BadRequestException('KYC file must be larger than 0 and no more than 15 MB');
    const storage=this.storage.status();if(!storage.configured)throw new BadRequestException('Secure KYC document storage is not configured yet');
    const upload=this.storage.createPresignedPut({scope:`kyc/${row.id}`,filename,contentType,expiresInSeconds:600});
    await this.prisma.integrationEvent.create({data:{sourceSystem:'ANCLINE_KYC',eventType:'KYC_DOCUMENT_UPLOAD_RESERVED',externalId:upload.key,objectType:'KycDocument',objectId:row.id,status:'PENDING',payload:{registrationRef:ref,documentType,filename,contentType,size,key:upload.key},completedAt:new Date()}});
    return {...upload,documentType,filename,maxBytes:15*1024*1024};
  }

  async completeKycDocumentUpload(registrationRef:string,body:any){
    const ref=this.text(registrationRef).toUpperCase(),key=this.text(body?.key);
    const row=await this.prisma.organization.findFirst({where:{registrationRef:ref}});
    if(!row)throw new BadRequestException('Registration reference was not found');
    await this.validateUploadToken(row,body?.uploadToken);
    const reserved=await this.prisma.integrationEvent.findFirst({where:{sourceSystem:'ANCLINE_KYC',eventType:'KYC_DOCUMENT_UPLOAD_RESERVED',objectType:'KycDocument',objectId:row.id,externalId:key},orderBy:{createdAt:'desc'}});
    const meta:any=reserved?.payload||{};if(!reserved||!meta.key)throw new BadRequestException('KYC upload reservation was not found');
    const verified=await this.storage.verifyObject(key);if(!verified.exists)throw new BadRequestException('Uploaded KYC object could not be verified');
    const verifiedSize=Number(verified.contentLength||0);
    if(verifiedSize<=0||verifiedSize>15*1024*1024)throw new BadRequestException('Uploaded KYC file size is invalid');
    if(meta.size&&Number(meta.size)!==verifiedSize)throw new BadRequestException('Uploaded KYC file size does not match the reserved file');
    const kyc:any=row.kycData||{},docs=Array.isArray(kyc.documents)?kyc.documents:[];
    const doc={documentType:meta.documentType,filename:meta.filename,contentType:verified.contentType||meta.contentType,size:verifiedSize,key,etag:verified.etag||null,uploadedAt:new Date().toISOString()};
    const next=[...docs.filter((x:any)=>x.documentType!==doc.documentType),doc];
    await this.prisma.organization.update({where:{id:row.id},data:{kycData:{...kyc,documents:next}}});
    await this.prisma.integrationEvent.create({data:{sourceSystem:'ANCLINE_KYC',eventType:'KYC_DOCUMENT_UPLOADED',externalId:key,objectType:'KycDocument',objectId:row.id,status:'COMPLETED',payload:{...doc,registrationRef:ref},completedAt:new Date()}});
    await this.audit.log({actorId:ref,action:'KYC_DOCUMENT_UPLOADED',objectType:'Organization',objectId:row.id,detail:{registrationRef:ref,documentType:doc.documentType,filename:doc.filename,size:doc.size}});
    return {ok:true,document:{documentType:doc.documentType,filename:doc.filename,uploadedAt:doc.uploadedAt}};
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
    const kycForApproval:any=row.kycData||{},uploadedDocs=Array.isArray(kycForApproval.documents)?kycForApproval.documents:[];
    const requireUploads=this.storage.status().configured||String(process.env.KYC_REQUIRE_DOCUMENT_UPLOAD||'false').toLowerCase()==='true';
    if(requireUploads){
      const missing=this.requiredKycDocs().filter(x=>!uploadedDocs.some((d:any)=>d.documentType===x));
      if(missing.length)throw new BadRequestException('KYC approval blocked: missing uploaded documents: '+missing.join(', '));
    }
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
