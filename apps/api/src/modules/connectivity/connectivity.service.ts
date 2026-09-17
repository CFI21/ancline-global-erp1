import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

const SOURCE='ANCLINE_CONNECTIVITY';
const OUTBOUND_STATUSES=new Set(['DRAFT','QUEUED','SENT','ACKNOWLEDGED','DELIVERED','FAILED','DEAD_LETTER']);
const MAX_ATTEMPTS=5;

@Injectable()
export class ConnectivityService {
  constructor(private prisma:PrismaService,private scope:ScopeService,private audit:AuditService){}
  private get db():any{return this.prisma as any;}
  private payload(e:any){return (e?.payload||{}) as any;}
  private id(prefix:string){return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;}
  private async rows(){return this.db.integrationEvent.findMany({where:{sourceSystem:SOURCE},orderBy:{createdAt:'asc'}});}
  private latest(rows:any[],objectType:string){const m=new Map<string,any>();for(const e of rows.filter((x:any)=>x.objectType===objectType))m.set(e.objectId,{...this.payload(e),objectId:e.objectId,eventType:e.eventType,updatedAt:e.createdAt});return [...m.values()];}
  private async write(objectType:string,eventType:string,objectId:string,payload:any,user:ScopeUser){this.scope.assertInternal(user);const row=await this.db.integrationEvent.create({data:{sourceSystem:SOURCE,eventType,objectType,objectId,status:'COMPLETED',completedAt:new Date(),payload:{...payload,updatedBy:user.sub}}});await this.audit.log({actorId:user.sub,action:eventType,objectType,objectId,detail:payload});return row.payload;}

  async dashboard(user:ScopeUser){
    this.scope.assertInternal(user);
    const [rows,events]=await Promise.all([this.rows(),this.db.integrationEvent.findMany({where:{sourceSystem:{not:SOURCE}},orderBy:{createdAt:'desc'},take:500})]);
    const profiles=this.latest(rows,'PartnerProfile'),mappings=this.latest(rows,'MessageMapping'),webhooks=this.latest(rows,'WebhookSubscription'),outbound=this.latest(rows,'OutboundMessage'),acks=this.latest(rows,'Acknowledgement');
    const profileMap=new Map(profiles.map((p:any)=>[String(p.sourceSystem||p.partnerCode||'').toUpperCase(),p]));
    const now=Date.now();
    const slaBreaches=events.filter((e:any)=>{
      if(['COMPLETED'].includes(String(e.status))) return false;
      const p=profileMap.get(String(e.sourceSystem||'').toUpperCase());
      const sla=Math.max(1,Number(p?.slaMinutes||60));
      return now-new Date(e.createdAt).getTime()>sla*60000;
    }).slice(0,100).map((e:any)=>({id:e.id,sourceSystem:e.sourceSystem,eventType:e.eventType,status:e.status,createdAt:e.createdAt,attemptCount:e.attemptCount,externalId:e.externalId,slaMinutes:Number(profileMap.get(String(e.sourceSystem||'').toUpperCase())?.slaMinutes||60)}));
    const latencyRows=events.filter((e:any)=>e.completedAt).map((e:any)=>({sourceSystem:e.sourceSystem,minutes:Math.max(0,(new Date(e.completedAt).getTime()-new Date(e.createdAt).getTime())/60000)}));
    const latencyBySource=new Map<string,{sum:number,count:number}>();for(const r of latencyRows){const x=latencyBySource.get(r.sourceSystem)||{sum:0,count:0};x.sum+=r.minutes;x.count++;latencyBySource.set(r.sourceSystem,x);}
    const sourcePerformance=[...latencyBySource.entries()].map(([sourceSystem,x])=>({sourceSystem,averageMinutes:Math.round(x.sum/x.count*10)/10,messages:x.count,slaMinutes:Number(profileMap.get(String(sourceSystem).toUpperCase())?.slaMinutes||60)}));
    return {summary:{profiles:profiles.filter((x:any)=>x.active!==false).length,mappings:mappings.filter((x:any)=>x.active!==false).length,webhooks:webhooks.filter((x:any)=>x.active!==false).length,outboundQueued:outbound.filter((x:any)=>['DRAFT','QUEUED'].includes(x.status)).length,outboundFailed:outbound.filter((x:any)=>['FAILED','DEAD_LETTER'].includes(x.status)).length,acknowledged:acks.length,slaBreaches:slaBreaches.length},profiles,mappings,webhooks,outbound:outbound.slice().reverse().slice(0,150),acknowledgements:acks.slice().reverse().slice(0,100),slaBreaches,sourcePerformance};
  }

  async setProfile(body:any,user:ScopeUser){this.scope.assertInternal(user);if(!body?.partnerCode||!body?.name)throw new BadRequestException('Partner code and name are required');const id=String(body.profileId||this.id('PARTNER'));return this.write('PartnerProfile','PARTNER_PROFILE_SET',id,{profileId:id,partnerCode:String(body.partnerCode).toUpperCase(),name:String(body.name),partnerType:String(body.partnerType||'CARRIER').toUpperCase(),transport:String(body.transport||'API').toUpperCase(),sourceSystem:String(body.sourceSystem||body.partnerCode).toUpperCase(),endpoint:body.endpoint||null,authMode:String(body.authMode||'NONE').toUpperCase(),inboundEnabled:body.inboundEnabled!==false,outboundEnabled:body.outboundEnabled!==false,slaMinutes:Math.max(1,Number(body.slaMinutes||60)),ackRequired:Boolean(body.ackRequired),active:body.active!==false,notes:body.notes||null},user);}

  async setMapping(body:any,user:ScopeUser){this.scope.assertInternal(user);if(!body?.name||!body?.partnerCode||!body?.externalMessageType)throw new BadRequestException('Mapping name, partner and external message type are required');const id=String(body.mappingId||this.id('MAP'));return this.write('MessageMapping','MESSAGE_MAPPING_SET',id,{mappingId:id,name:String(body.name),partnerCode:String(body.partnerCode).toUpperCase(),direction:String(body.direction||'INBOUND').toUpperCase(),externalMessageType:String(body.externalMessageType).toUpperCase(),anclineEventType:String(body.anclineEventType||body.externalMessageType).toUpperCase(),version:String(body.version||'1'),mapping:body.mapping||{},active:body.active!==false},user);}

  async setWebhook(body:any,user:ScopeUser){this.scope.assertInternal(user);if(!body?.name||!body?.partnerCode||!body?.eventType)throw new BadRequestException('Webhook name, partner and event type are required');const id=String(body.webhookId||this.id('WH'));return this.write('WebhookSubscription','WEBHOOK_SUBSCRIPTION_SET',id,{webhookId:id,name:String(body.name),partnerCode:String(body.partnerCode).toUpperCase(),eventType:String(body.eventType).toUpperCase(),targetUrl:body.targetUrl||null,secretRef:body.secretRef||null,active:body.active!==false,ackRequired:Boolean(body.ackRequired),timeoutSeconds:Math.max(1,Number(body.timeoutSeconds||30))},user);}

  async queueOutbound(body:any,user:ScopeUser){this.scope.assertInternal(user);if(!body?.partnerCode||!body?.messageType)throw new BadRequestException('Partner and message type are required');const id=this.id('OUT');return this.write('OutboundMessage','OUTBOUND_QUEUED',id,{messageId:id,partnerCode:String(body.partnerCode).toUpperCase(),messageType:String(body.messageType).toUpperCase(),externalId:body.externalId||null,bookingId:body.bookingId||null,payload:body.payload||{},status:'QUEUED',attemptCount:0,maxAttempts:MAX_ATTEMPTS,queuedAt:new Date().toISOString(),lastError:null,nextRetryAt:null,deliveryReference:null},user);}

  async setOutboundStatus(id:string,body:any,user:ScopeUser){this.scope.assertInternal(user);const rows=await this.rows();const current=this.latest(rows,'OutboundMessage').find((x:any)=>x.messageId===id);if(!current)throw new BadRequestException('Outbound message not found');const status=String(body?.status||'').toUpperCase();if(!OUTBOUND_STATUSES.has(status))throw new BadRequestException('Invalid outbound status');const attemptCount=Number(body?.attemptCount??current.attemptCount??0);return this.write('OutboundMessage','OUTBOUND_STATUS_SET',id,{...current,status,attemptCount,lastError:body?.lastError??current.lastError??null,nextRetryAt:body?.nextRetryAt??current.nextRetryAt??null,deliveryReference:body?.deliveryReference??current.deliveryReference??null,statusAt:new Date().toISOString()},user);}

  async retryOutbound(id:string,user:ScopeUser){this.scope.assertInternal(user);const rows=await this.rows();const current=this.latest(rows,'OutboundMessage').find((x:any)=>x.messageId===id);if(!current)throw new BadRequestException('Outbound message not found');const attempt=Number(current.attemptCount||0)+1;if(attempt>MAX_ATTEMPTS)return this.write('OutboundMessage','OUTBOUND_DEAD_LETTER',id,{...current,status:'DEAD_LETTER',attemptCount:Number(current.attemptCount||0),lastError:current.lastError||'Maximum retry attempts reached',deadLetteredAt:new Date().toISOString()},user);const delay=Math.min(30,Math.pow(2,Math.max(0,attempt-1)));return this.write('OutboundMessage','OUTBOUND_RETRY_QUEUED',id,{...current,status:'QUEUED',attemptCount:attempt,nextRetryAt:new Date(Date.now()+delay*60000).toISOString(),lastError:null},user);}

  async acknowledge(body:any,user:ScopeUser){this.scope.assertInternal(user);if(!body?.messageId||!body?.partnerCode)throw new BadRequestException('Message ID and partner are required');const id=this.id('ACK');const ack=await this.write('Acknowledgement','ACKNOWLEDGEMENT_RECORDED',id,{ackId:id,messageId:String(body.messageId),partnerCode:String(body.partnerCode).toUpperCase(),ackType:String(body.ackType||'FUNCTIONAL').toUpperCase(),status:String(body.status||'ACCEPTED').toUpperCase(),externalReference:body.externalReference||null,receivedAt:body.receivedAt||new Date().toISOString(),detail:body.detail||null},user);const rows=await this.rows();const current=this.latest(rows,'OutboundMessage').find((x:any)=>x.messageId===String(body.messageId));if(current)await this.write('OutboundMessage','OUTBOUND_ACKNOWLEDGED',String(body.messageId),{...current,status:'ACKNOWLEDGED',ackId:id,acknowledgedAt:new Date().toISOString()},user);return ack;}
}
