import { BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DataQualityService } from '../data-quality/data-quality.service';
import { WorkflowAutomationService } from '../workflow-automation/workflow-automation.service';

const bookingStates=['DRAFT','RATE_REQUESTED','RATE_RECEIVED','RATE_APPROVED','QUOTE_SENT','CUSTOMER_ACCEPTED','BOOKING_REQUESTED','CREDIT_CHECK','EQUIPMENT_CHECK','SLOT_CHECK','AGENT_ACCEPTANCE','CARRIER_CONFIRMATION','FINAL_APPROVAL','CONFIRMED','OPERATIONAL','COMPLETED','FINANCIALLY_CLOSED'];

type Plan={process:string;trigger:string;bookingId:string;objectType:string;objectId:string;gate:string;context:any;idempotencySuffix?:string}|null;

@Injectable()
export class ControlEnforcementInterceptor implements NestInterceptor {
  constructor(private prisma:PrismaService,private audit:AuditService,private dataQuality:DataQualityService,private workflow:WorkflowAutomationService){}

  async intercept(context:ExecutionContext,next:CallHandler):Promise<Observable<any>>{
    const req=context.switchToHttp().getRequest<any>();
    const user=req.user;
    if(!user)return next.handle();
    const plan=await this.before(context,req,user);
    return next.handle().pipe(mergeMap((result:any)=>from(this.after(plan,result,user).catch(async(e:any)=>{
      await this.audit.log({actorId:user.sub,action:'WORKFLOW_AUTOMATION_NATIVE_TRIGGER_FAILED',objectType:plan?.objectType||'ControlEnforcement',objectId:plan?.objectId||'unknown',bookingId:plan?.bookingId||undefined,detail:{trigger:plan?.trigger||null,error:e?.message||'Automation trigger failed'}});
    })).pipe(map(()=>result))));
  }

  private async enforce(bookingId:string,gate:string,user:any){
    const result=await this.dataQuality.checkBooking(bookingId,user,gate);
    if(result.clear)return result;
    const detail=result.blockers.map((x:any)=>x.message||x.code).join('; ');
    await this.audit.log({actorId:user.sub,action:'DATA_QUALITY_GATE_BLOCKED',objectType:'Booking',objectId:bookingId,bookingId,detail:{gate,blockers:result.blockers}});
    throw new BadRequestException(`Data quality blocked ${gate}: ${detail}`);
  }

  private async before(context:ExecutionContext,req:any,user:any):Promise<Plan>{
    const controller=context.getClass().name,handler=context.getHandler().name;
    if(controller==='BookingsController'&&handler==='advance'){
      const bookingId=String(req.params?.id||'');
      const b=await this.prisma.booking.findUnique({where:{id:bookingId},select:{id:true,bookingNo:true,status:true,owningBranchId:true,customerId:true}});
      if(!b)return null;
      const index=bookingStates.indexOf(String(b.status));
      const nextStatus=index>=0&&index<bookingStates.length-1?bookingStates[index+1]:null;
      if(nextStatus==='FINANCIALLY_CLOSED')throw new BadRequestException('Financial close must use the Finance finalization workflow');
      const gate=nextStatus==='CONFIRMED'?'CONFIRMATION':nextStatus==='OPERATIONAL'?'OPERATIONAL':nextStatus==='COMPLETED'?'COMPLETION':null;
      if(!gate)return null;
      await this.enforce(bookingId,gate,user);
      return {process:'BOOKING',trigger:`BOOKING_${nextStatus}`,bookingId,objectType:'Booking',objectId:bookingId,gate,context:{bookingNo:b.bookingNo,fromStatus:b.status,toStatus:nextStatus,gate,source:'NATIVE_CONTROL_ENFORCEMENT'}};
    }
    if(controller==='DocumentsController'&&handler==='release'){
      const documentId=String(req.params?.id||'');
      const d=await this.prisma.document.findUnique({where:{id:documentId},select:{id:true,bookingId:true,documentNo:true,type:true,version:true,status:true}});
      if(!d)return null;
      await this.enforce(d.bookingId,'DOCUMENT_RELEASE',user);
      return {process:'DOCUMENT',trigger:'DOCUMENT_RELEASED',bookingId:d.bookingId,objectType:'Document',objectId:d.id,gate:'DOCUMENT_RELEASE',idempotencySuffix:`V${d.version}`,context:{documentNo:d.documentNo,type:d.type,version:d.version,fromStatus:d.status,toStatus:'Released',gate:'DOCUMENT_RELEASE',source:'NATIVE_CONTROL_ENFORCEMENT'}};
    }
    if(controller==='FinanceController'&&handler==='status'&&String(req.body?.status||'').toUpperCase()==='POSTED'){
      const lineId=String(req.params?.id||'');
      const line=await this.prisma.financeLine.findUnique({where:{id:lineId},select:{id:true,bookingId:true,chargeCode:true,type:true,status:true,currency:true,amount:true}});
      if(!line)return null;
      await this.enforce(line.bookingId,'FINANCE_POSTING',user);
      return {process:'FINANCE',trigger:'FINANCE_LINE_POSTED',bookingId:line.bookingId,objectType:'FinanceLine',objectId:line.id,gate:'FINANCE_POSTING',context:{chargeCode:line.chargeCode,type:line.type,currency:line.currency,amount:String(line.amount),fromStatus:line.status,toStatus:'POSTED',gate:'FINANCE_POSTING',source:'NATIVE_CONTROL_ENFORCEMENT'}};
    }
    if(controller==='FinanceController'&&handler==='finalizeBooking'){
      const bookingId=String(req.params?.bookingId||'');
      const b=await this.prisma.booking.findUnique({where:{id:bookingId},select:{id:true,bookingNo:true,status:true}});
      if(!b)return null;
      await this.enforce(bookingId,'FINANCIAL_CLOSE',user);
      return {process:'FINANCE',trigger:'BOOKING_FINANCIALLY_CLOSED',bookingId,objectType:'Booking',objectId:bookingId,gate:'FINANCIAL_CLOSE',context:{bookingNo:b.bookingNo,fromStatus:b.status,toStatus:'FINANCIALLY_CLOSED',gate:'FINANCIAL_CLOSE',source:'NATIVE_CONTROL_ENFORCEMENT'}};
    }
    return null;
  }

  private async after(plan:Plan,result:any,user:any){
    if(!plan)return;
    const suffix=plan.idempotencySuffix||String(result?.status||plan.trigger);
    await this.workflow.trigger({process:plan.process,trigger:plan.trigger,bookingId:plan.bookingId,objectType:plan.objectType,objectId:plan.objectId,idempotencyKey:`NATIVE:${plan.trigger}:${plan.objectId}:${suffix}`,context:{...plan.context,resultStatus:result?.status||null}},user);
    await this.audit.log({actorId:user.sub,action:'NATIVE_CONTROL_ENFORCEMENT_EXECUTED',objectType:plan.objectType,objectId:plan.objectId,bookingId:plan.bookingId,detail:{gate:plan.gate,trigger:plan.trigger}});
  }
}
