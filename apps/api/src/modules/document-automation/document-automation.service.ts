import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser, bookingScope } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const SOURCE='ANCLINE_DOCUMENT_AUTOMATION';
const COMM_STATUSES=new Set(['DRAFT','QUEUED','SENT','DELIVERED','FAILED','BOUNCED']);
const PACK_TYPES=new Set(['CUSTOMER_PACK','AGENT_PACK','CARRIER_PACK','CUSTOMS_PACK','CLOSEOUT_PACK']);

@Injectable()
export class DocumentAutomationService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private payload(e:any){return (e?.payload||{}) as any;}
  private id(prefix:string){return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;}
  private async events(){return this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE},orderBy:{createdAt:'asc'}});}
  private latest(rows:any[],objectType:string){const m=new Map<string,any>();for(const e of rows.filter((x:any)=>x.objectType===objectType))m.set(e.objectId,{...this.payload(e),objectId:e.objectId,eventType:e.eventType,updatedAt:e.createdAt});return [...m.values()];}
  private async write(objectType:string,eventType:string,objectId:string,payload:any,user:ScopeUser){this.scope.assertInternal(user);const row=await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType,objectType,objectId,status:'COMPLETED',completedAt:new Date(),payload:{...payload,updatedBy:user.sub}}});await this.audit.log({actorId:user.sub,action:eventType,objectType,objectId,bookingId:payload.bookingId||undefined,detail:payload});return row.payload;}
  private render(text:string,data:any){return String(text||'').replace(/{{\s*([\w.]+)\s*}}/g,(_m:string,path:string)=>{let v:any=data;for(const k of path.split('.'))v=v?.[k];return v==null?'':String(v);});}
  private async booking(bookingId:string,user:ScopeUser){if(!bookingId)throw new BadRequestException('Booking is required');await this.scope.assertBookingAccess(user,bookingId);const b=await this.db.booking.findUnique({where:{id:bookingId},include:{customer:true,containers:true,routingLegs:{orderBy:{sequence:'asc'}},documents:true}});if(!b)throw new BadRequestException('Booking not found');return b;}
  private templateData(b:any){return {booking:{id:b.id,bookingNo:b.bookingNo,shipmentNo:b.shipmentNo||'',origin:b.origin,destination:b.destination,etd:b.etd?new Date(b.etd).toISOString():'',eta:b.eta?new Date(b.eta).toISOString():'',houseBL:b.houseBL||'',masterBL:b.masterBL||'',commodity:b.commodity||'',grossWeight:b.grossWeight||'',volumeCbm:b.volumeCbm||'',carrier:b.carrier||'',vesselVoyage:b.vesselVoyage||''},customer:{id:b.customerId,name:b.customer?.name||'',code:b.customer?.code||''},containers:(b.containers||[]).map((c:any)=>({containerNo:c.containerNo,type:c.type,sealNo:c.sealNo||''})),routingLegs:b.routingLegs||[]};}

  async dashboard(user:ScopeUser){
    this.scope.assertInternal(user);
    const [rows,documents,bookings]=await Promise.all([
      this.events(),
      this.db.document.findMany({where:{booking:bookingScope(user)},include:{booking:{select:{id:true,bookingNo:true,customer:{select:{name:true}}}}},orderBy:{updatedAt:'desc'},take:200}),
      this.db.booking.findMany({where:bookingScope(user),select:{id:true,bookingNo:true,customerId:true,customer:{select:{name:true}},origin:true,destination:true,status:true},orderBy:{createdAt:'desc'},take:200})
    ]);
    const visibleIds=new Set(bookings.map((x:any)=>String(x.id)));
    const templates=this.latest(rows,'DocumentTemplate');
    const communications=this.latest(rows,'Communication').filter((x:any)=>visibleIds.has(String(x.bookingId||'')));
    const packs=this.latest(rows,'DocumentPack').filter((x:any)=>visibleIds.has(String(x.bookingId||'')));
    const generated=this.latest(rows,'GeneratedDocument').filter((x:any)=>visibleIds.has(String(x.bookingId||'')));
    const readiness=bookings.map((b:any)=>this.readinessRow(b,documents.filter((d:any)=>d.bookingId===b.id),communications.filter((x:any)=>x.bookingId===b.id)));
    return {
      summary:{
        templates:templates.filter((x:any)=>x.active!==false).length,
        generatedDocuments:generated.length,
        releasedDocuments:documents.filter((d:any)=>d.status==='Released').length,
        pendingReview:documents.filter((d:any)=>d.status==='Pending Review').length,
        communications:communications.length,
        failedCommunications:communications.filter((c:any)=>['FAILED','BOUNCED'].includes(c.status)).length,
        documentPacks:packs.length,
        blockedBookings:readiness.filter((x:any)=>x.state==='BLOCKED').length,
        readyBookings:readiness.filter((x:any)=>x.state==='READY').length
      },
      templates,
      communications:communications.slice().reverse().slice(0,100),
      packs:packs.slice().reverse().slice(0,100),
      generated:generated.slice().reverse().slice(0,100),
      documents,
      bookings,
      readiness
    };
  }

  private readinessRow(booking:any,documents:any[],communications:any[]){
    const reasons:any[]=[];
    const pending=documents.filter((d:any)=>d.status!=='Released');
    const blocked=documents.filter((d:any)=>String(d.releaseControl||'Clear').toUpperCase()!=='CLEAR');
    const failed=communications.filter((x:any)=>['FAILED','BOUNCED'].includes(String(x.status)));
    const queued=communications.filter((x:any)=>String(x.status)==='QUEUED');
    if(!documents.length)reasons.push({code:'NO_DOCUMENTS',severity:'WARNING',message:'No controlled documents exist for this booking.'});
    if(pending.length)reasons.push({code:'DOCUMENTS_NOT_RELEASED',severity:'BLOCKER',message:`${pending.length} document(s) are not released.`});
    if(blocked.length)reasons.push({code:'DOCUMENT_RELEASE_BLOCK',severity:'BLOCKER',message:`${blocked.length} document(s) have a release-control block.`});
    if(failed.length)reasons.push({code:'COMMUNICATION_FAILED',severity:'BLOCKER',message:`${failed.length} communication(s) failed or bounced.`});
    if(queued.length)reasons.push({code:'COMMUNICATION_QUEUED',severity:'INFO',message:`${queued.length} communication(s) are queued.`});
    const blockers=reasons.filter((x:any)=>x.severity==='BLOCKER');
    return {
      bookingId:booking.id,bookingNo:booking.bookingNo,customer:booking.customer?.name||null,
      origin:booking.origin,destination:booking.destination,bookingStatus:booking.status,
      state:blockers.length?'BLOCKED':documents.length?'READY':'OPEN',
      releasedCount:documents.filter((d:any)=>d.status==='Released').length,
      pendingCount:pending.length,blockedCount:blocked.length,failedCommunicationCount:failed.length,
      communicationCount:communications.length,reasons,
      actionHref:`/jobs/${booking.id}`,documentsHref:`/documents?bookingId=${booking.id}`
    };
  }

  async readiness(bookingId:string,user:ScopeUser){
    this.scope.assertInternal(user);
    const b=await this.booking(bookingId,user);
    const rows=await this.events();
    const communications=this.latest(rows,'Communication').filter((x:any)=>String(x.bookingId||'')===b.id);
    return this.readinessRow(b,b.documents||[],communications);
  }

  async setTemplate(body:any,user:ScopeUser){this.scope.assertInternal(user);if(!body?.name||!body?.templateType)throw new BadRequestException('Template name and type are required');const templateId=String(body.templateId||this.id('TPL'));const templateType=String(body.templateType).toUpperCase();return this.write('DocumentTemplate','DOCUMENT_TEMPLATE_SET',templateId,{templateId,name:String(body.name),templateType,documentType:body.documentType?String(body.documentType).toUpperCase():null,channel:String(body.channel||'DOCUMENT').toUpperCase(),subjectTemplate:body.subjectTemplate||null,bodyTemplate:body.bodyTemplate||'',active:body.active!==false,requiresApproval:body.requiresApproval!==false,notes:body.notes||null},user);}

  async generate(body:any,user:ScopeUser){this.scope.assertInternal(user);const b=await this.booking(String(body?.bookingId||''),user);const rows=await this.events();const templates=this.latest(rows,'DocumentTemplate');const template=templates.find((x:any)=>x.templateId===String(body?.templateId||'')&&x.active!==false);if(!template)throw new BadRequestException('Active template not found');if(String(template.channel||'DOCUMENT')!=='DOCUMENT')throw new BadRequestException('Selected template is not a document template');const data=this.templateData(b);const rendered=this.render(template.bodyTemplate,data);const documentType=String(body.documentType||template.documentType||template.templateType||'OTHER').toUpperCase();const documentNo=String(body.documentNo||`AUTO-${documentType}-${b.bookingNo}-${Date.now().toString().slice(-6)}`).toUpperCase();const exists=await this.db.document.findUnique({where:{documentNo}});if(exists)throw new BadRequestException('Generated document number already exists');const document=await this.db.document.create({data:{bookingId:b.id,documentNo,type:documentType,version:1,status:template.requiresApproval?'Draft':'Approved',releaseControl:String(body.releaseControl||'Clear'),fileKey:null}});if(documentType==='HOUSE_BL')await this.db.booking.update({where:{id:b.id},data:{houseBL:documentNo}});if(documentType==='MASTER_BL')await this.db.booking.update({where:{id:b.id},data:{masterBL:documentNo}});const generationId=this.id('GEN');await this.write('GeneratedDocument','DOCUMENT_GENERATED',generationId,{generationId,bookingId:b.id,bookingNo:b.bookingNo,templateId:template.templateId,templateName:template.name,documentId:document.id,documentNo,documentType,version:1,status:document.status,renderedContent:rendered,generatedAt:new Date().toISOString()},user);return {document,generationId,renderedContent:rendered};}

  async createCommunication(body:any,user:ScopeUser){this.scope.assertInternal(user);const bookingId=String(body?.bookingId||'');const b=await this.booking(bookingId,user);const rows=await this.events();const templates=this.latest(rows,'DocumentTemplate');const template=body?.templateId?templates.find((x:any)=>x.templateId===String(body.templateId)&&x.active!==false):null;if(body?.templateId&&!template)throw new BadRequestException('Active communication template not found');if(template&&String(template.channel||'EMAIL')==='DOCUMENT')throw new BadRequestException('Selected template is not a communication template');const data=this.templateData(b);const communicationId=this.id('COM');const subject=this.render(body.subject??template?.subjectTemplate??'',data),message=this.render(body.message??template?.bodyTemplate??'',data);const recipients=Array.isArray(body.recipients)?body.recipients.map((x:any)=>String(x).trim()).filter(Boolean):String(body.recipients||'').split(',').map((x:string)=>x.trim()).filter(Boolean);if(!recipients.length)throw new BadRequestException('At least one recipient is required');return this.write('Communication','COMMUNICATION_CREATED',communicationId,{communicationId,bookingId:b.id,bookingNo:b.bookingNo,customerName:b.customer?.name||null,channel:String(body.channel||template?.channel||'EMAIL').toUpperCase(),recipients,subject,message,templateId:template?.templateId||null,status:'DRAFT',documentIds:Array.isArray(body.documentIds)?body.documentIds:[],createdAt:new Date().toISOString(),deliveryReference:null,deliveryMessage:null},user);}

  async setCommunicationStatus(id:string,body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const rows=await this.events();
    const current=this.latest(rows,'Communication').find((x:any)=>x.communicationId===id);
    if(!current)throw new BadRequestException('Communication not found');
    await this.scope.assertBookingAccess(user,String(current.bookingId));
    const status=String(body?.status||'').toUpperCase();
    if(!COMM_STATUSES.has(status))throw new BadRequestException('Invalid communication status');
    return this.write('Communication','COMMUNICATION_STATUS_SET',id,{...current,status,deliveryReference:body?.deliveryReference??current.deliveryReference??null,deliveryMessage:body?.deliveryMessage??current.deliveryMessage??null,statusAt:new Date().toISOString()},user);
  }

  async retryCommunication(id:string,body:any,user:ScopeUser){
    this.scope.assertInternal(user);
    const rows=await this.events();
    const current=this.latest(rows,'Communication').find((x:any)=>x.communicationId===id);
    if(!current)throw new BadRequestException('Communication not found');
    await this.scope.assertBookingAccess(user,String(current.bookingId));
    const requestId=String(body?.requestId||'').trim()||`retry-${id}`;
    if(String(current.lastRetryRequestId||'')===requestId)return {...current,duplicate:true};
    if(!['FAILED','BOUNCED'].includes(String(current.status)))throw new BadRequestException('Only FAILED or BOUNCED communications can be retried');
    const attachedIds=Array.isArray(current.documentIds)?current.documentIds.map(String):[];
    if(attachedIds.length){
      const docs=await this.db.document.findMany({where:{id:{in:attachedIds},bookingId:String(current.bookingId)}});
      if(docs.length!==attachedIds.length)throw new BadRequestException('One or more attached documents no longer exist for this booking');
      const blocked=docs.filter((d:any)=>d.status!=='Released'||String(d.releaseControl||'Clear').toUpperCase()!=='CLEAR');
      if(blocked.length)throw new BadRequestException('Communication retry blocked until all attached documents are released and release-control clear');
    }
    const retryCount=Number(current.retryCount||0)+1;
    return this.write('Communication','COMMUNICATION_RETRY_QUEUED',id,{
      ...current,status:'QUEUED',retryCount,lastRetryRequestId:requestId,lastRetryAt:new Date().toISOString(),
      deliveryMessage:'Queued for controlled retry; live provider dispatch remains disabled.'
    },user);
  }

  async createPack(body:any,user:ScopeUser){this.scope.assertInternal(user);const b=await this.booking(String(body?.bookingId||''),user);const packType=String(body?.packType||'CUSTOMER_PACK').toUpperCase();if(!PACK_TYPES.has(packType))throw new BadRequestException('Invalid document pack type');const ids=Array.isArray(body.documentIds)?body.documentIds.map(String):[];let docs:any[]=ids.length?await this.db.document.findMany({where:{id:{in:ids},bookingId:b.id}}):b.documents||[];if(body.releasedOnly!==false)docs=docs.filter((d:any)=>d.status==='Released');if(!docs.length)throw new BadRequestException('No eligible documents found for pack');const packId=this.id('PACK');const manifest=docs.map((d:any)=>({documentId:d.id,documentNo:d.documentNo,type:d.type,version:d.version,status:d.status}));return this.write('DocumentPack','DOCUMENT_PACK_CREATED',packId,{packId,bookingId:b.id,bookingNo:b.bookingNo,customerName:b.customer?.name||null,packType,name:body.name||`${packType} · ${b.bookingNo}`,releasedOnly:body.releasedOnly!==false,documentCount:manifest.length,manifest,createdAt:new Date().toISOString()},user);}
}
