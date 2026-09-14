import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeUser, bookingScope } from '../auth/scope';

type Risk={
  key:string;
  category:string;
  severity:'CRITICAL'|'WARNING'|'INFO';
  title:string;
  message:string;
  bookingId?:string;
};

@Injectable()
export class AlertEngineService {
  constructor(private prisma:PrismaService){}

  private hoursUntil(value:Date|string|null|undefined){
    if(!value) return null;
    return (new Date(value).getTime()-Date.now())/3600000;
  }

  private dueRisk(key:string,category:string,label:string,value:Date|string|null|undefined,bookingNo:string,bookingId:string,windowHours=48):Risk|null{
    const hours=this.hoursUntil(value);
    if(hours==null||hours>windowHours) return null;
    const overdue=hours<0;
    const severity:Risk['severity']=overdue?'CRITICAL':hours<=12?'WARNING':'INFO';
    const timing=overdue?`${Math.ceil(Math.abs(hours))}h overdue`:`due in ${Math.ceil(hours)}h`;
    return {key,category,severity,title:`${label}: ${bookingNo}`,message:`${label} is ${timing}. Review the booking and clear the operational risk.`,bookingId};
  }

  async scan(user:ScopeUser){
    const scope:any=bookingScope(user);
    const bookings=await this.prisma.booking.findMany({
      where:{...scope,status:{notIn:['CANCELLED','FINANCIALLY_CLOSED']}},
      include:{
        tasks:true,
        approvals:true,
        documents:true,
        containers:true,
        financeLines:true,
        milestones:true
      }
    });

    const risks:Risk[]=[];
    const push=(risk:Risk|null)=>{if(risk) risks.push(risk);};

    for(const b of bookings){
      const cutoffFields:[string,string,Date|null][]=[
        ['CY_CLOSING','CY Closing',b.cyClosing],
        ['SI_CUTOFF','SI Cut-off',b.siCutoff],
        ['VGM_CUTOFF','VGM Cut-off',b.vgmCutoff],
        ['DOC_CUTOFF','Document Cut-off',b.docCutoff],
        ['PORT_CUTOFF','Port Cut-off',b.portCutoff]
      ];
      for(const [code,label,value] of cutoffFields){
        push(this.dueRisk(`BOOKING:${b.id}:CUTOFF:${code}`,'CUTOFF',label,value,b.bookingNo,b.id,48));
      }

      for(const task of b.tasks){
        if(!task.dueAt||['COMPLETED','DONE','CLOSED','CANCELLED'].includes(String(task.status).toUpperCase())) continue;
        push(this.dueRisk(`TASK:${task.id}`,'TASK',`Task “${task.title}”`,task.dueAt,b.bookingNo,b.id,24));
      }

      for(const m of b.milestones){
        if(!m.plannedAt||m.actualAt||['COMPLETED','DONE'].includes(String(m.status).toUpperCase())) continue;
        push(this.dueRisk(`MILESTONE:${m.id}`,'MILESTONE',`Milestone “${m.label}”`,m.plannedAt,b.bookingNo,b.id,24));
      }

      for(const a of b.approvals){
        if(String(a.status).toUpperCase()!=='PENDING') continue;
        const ageHours=(Date.now()-new Date(a.createdAt).getTime())/3600000;
        const assigned=[a.approverId,user.sub,user.email].filter(Boolean).map(x=>String(x).toLowerCase());
        const isMine=assigned[0]===String(user.sub).toLowerCase()||assigned[0]===String(user.email).toLowerCase();
        const canSupervise=['GLOBAL_ADMIN','CONTROL_TOWER'].includes(user.role);
        if(!isMine&&!canSupervise) continue;
        risks.push({
          key:`APPROVAL:${a.id}`,
          category:'APPROVAL',
          severity:ageHours>=24?'WARNING':'INFO',
          title:`Approval pending: ${b.bookingNo}`,
          message:`${a.type} approval is pending${ageHours>=24?` for ${Math.floor(ageHours)}h`:''}. Review the approval queue.`,
          bookingId:b.id
        });
      }

      for(const d of b.documents){
        const hold=String(d.releaseControl||'').trim();
        if(hold&&hold.toUpperCase()!=='CLEAR'){
          risks.push({key:`DOCUMENT:${d.id}:HOLD`,category:'DOCUMENT',severity:'WARNING',title:`Document hold: ${b.bookingNo}`,message:`${d.type} ${d.documentNo} is blocked by “${hold}”. Clear the hold before release.`,bookingId:b.id});
        }
        if(String(d.status).toUpperCase()==='PENDING_REVIEW'){
          const ageHours=(Date.now()-new Date(d.updatedAt).getTime())/3600000;
          if(ageHours>=24) risks.push({key:`DOCUMENT:${d.id}:REVIEW`,category:'DOCUMENT',severity:'WARNING',title:`Document review overdue: ${b.bookingNo}`,message:`${d.type} ${d.documentNo} has been pending review for ${Math.floor(ageHours)}h.`,bookingId:b.id});
        }
      }

      for(const c of b.containers){
        if(c.emptyReturnDue&&!c.emptyReturnedAt) push(this.dueRisk(`CONTAINER:${c.id}:EMPTY_RETURN`,'CONTAINER',`Empty return ${c.containerNo}`,c.emptyReturnDue,b.bookingNo,b.id,48));
        if(c.detentionFreeUntil&&!c.emptyReturnedAt) push(this.dueRisk(`CONTAINER:${c.id}:DETENTION`,'DETENTION',`Detention free time ${c.containerNo}`,c.detentionFreeUntil,b.bookingNo,b.id,48));
        if(c.demurrageFreeUntil&&!c.fullGateInAt) push(this.dueRisk(`CONTAINER:${c.id}:DEMURRAGE`,'DEMURRAGE',`Demurrage free time ${c.containerNo}`,c.demurrageFreeUntil,b.bookingNo,b.id,48));
      }

      const activeFinance=b.financeLines.filter(x=>String(x.status).toUpperCase()!=='CANCELLED');
      for(const line of activeFinance.filter(x=>String(x.status).toUpperCase()==='DISPUTED')){
        risks.push({key:`FINANCE:${line.id}:DISPUTED`,category:'FINANCE',severity:'CRITICAL',title:`Disputed charge: ${b.bookingNo}`,message:`${line.type} ${line.chargeCode} is disputed and blocks financial completion.`,bookingId:b.id});
      }
      if(b.status==='COMPLETED'){
        const hasRevenue=activeFinance.some(x=>x.type==='REVENUE');
        const hasCost=activeFinance.some(x=>x.type==='COST');
        if(!hasRevenue||!hasCost) risks.push({key:`BOOKING:${b.id}:FINANCE:MISSING`,category:'FINANCE',severity:'WARNING',title:`Job costing incomplete: ${b.bookingNo}`,message:`${!hasRevenue?'Revenue':''}${!hasRevenue&&!hasCost?' and ':''}${!hasCost?'Cost':''} lines are missing before financial close.`,bookingId:b.id});
        const unfinished=activeFinance.filter(x=>!['FINAL','CLEARED','PAID'].includes(String(x.status).toUpperCase()));
        if(unfinished.length) risks.push({key:`BOOKING:${b.id}:FINANCE:UNFINISHED`,category:'FINANCE',severity:'WARNING',title:`Financial close blocked: ${b.bookingNo}`,message:`${unfinished.length} finance line(s) are not Final, Cleared or Paid.`,bookingId:b.id});
      }
    }

    const activeKeys=new Set(risks.map(r=>r.key));
    const existing=await this.prisma.notification.findMany({where:{userId:user.sub,objectType:'AUTO_RISK'}});
    const existingByKey=new Map(existing.map(n=>[n.objectId||'',n]));

    for(const risk of risks){
      const current=existingByKey.get(risk.key);
      const category=`${risk.severity} · ${risk.category}`;
      const message=`${risk.message}${risk.bookingId?` [booking:${risk.bookingId}]`:''}`;
      if(current){
        const changed=current.category!==category||current.title!==risk.title||current.message!==message||current.status==='RESOLVED';
        if(changed){
          await this.prisma.notification.update({where:{id:current.id},data:{category,title:risk.title,message,status:current.status==='RESOLVED'?'UNREAD':current.status,readAt:current.status==='RESOLVED'?null:current.readAt}});
        }
      }else{
        await this.prisma.notification.create({data:{userId:user.sub,category,title:risk.title,message,objectType:'AUTO_RISK',objectId:risk.key,status:'UNREAD'}});
      }
    }

    const stale=existing.filter(n=>n.objectId&&!activeKeys.has(n.objectId)&&n.status!=='RESOLVED');
    if(stale.length){
      await this.prisma.notification.updateMany({where:{id:{in:stale.map(x=>x.id)}},data:{status:'RESOLVED',readAt:new Date()}});
    }

    return {
      scannedBookings:bookings.length,
      activeRisks:risks.length,
      critical:risks.filter(r=>r.severity==='CRITICAL').length,
      warning:risks.filter(r=>r.severity==='WARNING').length,
      info:risks.filter(r=>r.severity==='INFO').length,
      resolved:stale.length
    };
  }
}
