import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../auth/scope.service';
import { ScopeUser } from '../auth/scope';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CommercialService {
  constructor(
    private prisma:PrismaService,
    private scope:ScopeService,
    private audit:AuditService
  ){}

  private internal(user:ScopeUser){ this.scope.assertInternal(user); }

  private required(value:any,name:string){
    const text=String(value??'').trim();
    if(!text) throw new BadRequestException(`${name} is required`);
    return text;
  }

  private date(value:any,name:string,required=true){
    if((value===undefined||value===null||value==='')&&!required) return null;
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) throw new BadRequestException(`${name} must be a valid date`);
    return d;
  }

  private money(value:any,name:string,required=false){
    if((value===undefined||value===null||value==='')&&!required) return null;
    const n=Number(value);
    if(!Number.isFinite(n)||n<0) throw new BadRequestException(`${name} must be a valid positive amount`);
    return n;
  }

  private margin(buy:any,sell:any){
    const b=Number(buy||0),s=Number(sell||0);
    return {grossProfit:s-b,marginPct:s>0?((s-b)/s)*100:0};
  }

  private displayStatus(row:any){
    const persisted=String(row.status||'DRAFT').toUpperCase();
    if(persisted==='SUSPENDED') return 'SUSPENDED';
    const end=new Date(row.validTo).getTime();
    if(end<Date.now()) return 'EXPIRED';
    if(['ACTIVE','EXPIRING'].includes(persisted)&&end<=Date.now()+30*24*60*60*1000) return 'EXPIRING';
    return persisted;
  }

  private decorate(row:any){
    const daysToExpiry=Math.ceil((new Date(row.validTo).getTime()-Date.now())/(24*60*60*1000));
    return {
      ...row,
      displayStatus:this.displayStatus(row),
      daysToExpiry,
      rateCount:row._count?.rates??row.rates?.length??0,
      rates:Array.isArray(row.rates)?row.rates.map((r:any)=>({...r,...this.margin(r.buyRate,r.sellRate)})):row.rates
    };
  }

  async dashboard(user:ScopeUser){
    this.internal(user);
    const rows=await this.prisma.serviceContract.findMany({
      include:{_count:{select:{rates:true}}}
    });
    const decorated=rows.map((r:any)=>this.decorate(r));
    const active=decorated.filter((r:any)=>['ACTIVE','EXPIRING'].includes(r.displayStatus));
    return {
      totalContracts:rows.length,
      activeContracts:active.length,
      expiring30d:decorated.filter((r:any)=>r.displayStatus==='EXPIRING').length,
      expiredContracts:decorated.filter((r:any)=>r.displayStatus==='EXPIRED').length,
      suspendedContracts:decorated.filter((r:any)=>r.displayStatus==='SUSPENDED').length,
      activeTariffLanes:active.reduce((sum:number,r:any)=>sum+Number(r.rateCount||0),0)
    };
  }

  async contracts(user:ScopeUser){
    this.internal(user);
    const rows=await this.prisma.serviceContract.findMany({
      include:{rates:{orderBy:{createdAt:'desc'}},_count:{select:{rates:true}}},
      orderBy:[{validTo:'asc'},{createdAt:'desc'}]
    });
    return rows.map((r:any)=>this.decorate(r));
  }

  async getContract(id:string,user:ScopeUser){
    this.internal(user);
    const row=await this.prisma.serviceContract.findUnique({
      where:{id},include:{rates:{orderBy:{createdAt:'desc'}},_count:{select:{rates:true}}}
    });
    if(!row) throw new NotFoundException('Commercial contract not found');
    return this.decorate(row);
  }

  async createContract(body:any,user:ScopeUser){
    this.internal(user);
    const contractNo=this.required(body?.contractNo,'Contract number').toUpperCase();
    const partyId=this.required(body?.partyId,'Contract party');
    const contractType=this.required(body?.contractType,'Contract type').toUpperCase();
    const validFrom=this.date(body?.validFrom,'Valid from');
    const validTo=this.date(body?.validTo,'Valid to');
    if(validTo<validFrom) throw new BadRequestException('Valid-to date must be on or after valid-from date');
    const party=await this.prisma.organization.findUnique({where:{id:partyId}});
    if(!party||!party.active) throw new BadRequestException('Contract party must be an active organization');
    const duplicate=await this.prisma.serviceContract.findUnique({where:{contractNo}});
    if(duplicate) throw new BadRequestException(`Contract ${contractNo} already exists`);

    const row=await this.prisma.serviceContract.create({data:{
      contractNo,
      partyId,
      partyType:String(body?.partyType||party.roles?.[0]||'CUSTOMER').trim().toUpperCase(),
      contractType,
      trade:body?.trade?String(body.trade).trim().toUpperCase():null,
      currency:String(body?.currency||'USD').trim().toUpperCase(),
      validFrom,
      validTo,
      minimumQuantity:this.money(body?.minimumQuantity,'Minimum quantity',false),
      quantityUnit:body?.quantityUnit?String(body.quantityUnit).trim().toUpperCase():null,
      status:'DRAFT',
      notes:body?.notes?String(body.notes).trim():null
    }});
    await this.audit.log({
      actorId:user.sub,action:'COMMERCIAL_CONTRACT_CREATE',objectType:'ServiceContract',objectId:row.id,
      detail:{contractNo:row.contractNo,partyId:row.partyId,contractType:row.contractType,validTo:row.validTo}
    });
    return row;
  }

  async addRate(contractId:string,body:any,user:ScopeUser){
    this.internal(user);
    const contract=await this.prisma.serviceContract.findUnique({where:{id:contractId}});
    if(!contract) throw new NotFoundException('Commercial contract not found');
    if(String(contract.status).toUpperCase()==='EXPIRED'&&new Date(contract.validTo).getTime()<Date.now())
      throw new BadRequestException('Extend the expired contract before adding new tariff lanes');

    const origin=this.required(body?.origin,'Origin').toUpperCase();
    const destination=this.required(body?.destination,'Destination').toUpperCase();
    if(origin===destination) throw new BadRequestException('Origin and destination must be different');
    const equipment=this.required(body?.equipment,'Equipment').toUpperCase();
    const chargeCode=this.required(body?.chargeCode,'Charge code').toUpperCase();
    const buyRate=this.money(body?.buyRate,'Buy rate',false);
    const sellRate=this.money(body?.sellRate,'Sell rate',false);
    if(buyRate===null&&sellRate===null) throw new BadRequestException('Enter a buy rate, sell rate, or both');

    const row=await this.prisma.contractRateLane.create({data:{
      contractId,
      origin,
      destination,
      equipment,
      chargeCode,
      buyRate,
      sellRate,
      currency:String(body?.currency||contract.currency||'USD').trim().toUpperCase(),
      dgPremium:this.money(body?.dgPremium,'DG premium',false),
      reeferPremium:this.money(body?.reeferPremium,'Reefer premium',false),
      oogRule:body?.oogRule?String(body.oogRule).trim():null,
      freeTimeOrigin:body?.freeTimeOrigin===''||body?.freeTimeOrigin==null?null:Math.max(0,Math.floor(Number(body.freeTimeOrigin))),
      freeTimeDestination:body?.freeTimeDestination===''||body?.freeTimeDestination==null?null:Math.max(0,Math.floor(Number(body.freeTimeDestination)))
    }});
    await this.audit.log({
      actorId:user.sub,action:'COMMERCIAL_TARIFF_ADD',objectType:'ContractRateLane',objectId:row.id,
      detail:{contractId,contractNo:contract.contractNo,origin,destination,equipment,chargeCode,buyRate,sellRate,currency:row.currency}
    });
    return {...row,...this.margin(row.buyRate,row.sellRate)};
  }

  async activate(id:string,user:ScopeUser){
    this.internal(user);
    const contract=await this.prisma.serviceContract.findUnique({where:{id},include:{_count:{select:{rates:true}}}});
    if(!contract) throw new NotFoundException('Commercial contract not found');
    if(contract._count.rates<1) throw new BadRequestException('Add at least one tariff lane before activating the contract');
    if(new Date(contract.validTo).getTime()<Date.now()) throw new BadRequestException('Expired contract must be extended before activation');
    const updated=await this.prisma.serviceContract.update({where:{id},data:{status:'ACTIVE'}});
    await this.audit.log({actorId:user.sub,action:'COMMERCIAL_CONTRACT_ACTIVATE',objectType:'ServiceContract',objectId:id,detail:{contractNo:contract.contractNo}});
    return updated;
  }

  async suspend(id:string,user:ScopeUser){
    this.internal(user);
    const contract=await this.prisma.serviceContract.findUnique({where:{id}});
    if(!contract) throw new NotFoundException('Commercial contract not found');
    const current=this.displayStatus(contract);
    if(!['ACTIVE','EXPIRING'].includes(current)) throw new BadRequestException(`Contract cannot be suspended from ${current}`);
    const updated=await this.prisma.serviceContract.update({where:{id},data:{status:'SUSPENDED'}});
    await this.audit.log({actorId:user.sub,action:'COMMERCIAL_CONTRACT_SUSPEND',objectType:'ServiceContract',objectId:id,detail:{contractNo:contract.contractNo}});
    return updated;
  }

  async extend(id:string,body:any,user:ScopeUser){
    this.internal(user);
    const contract=await this.prisma.serviceContract.findUnique({where:{id}});
    if(!contract) throw new NotFoundException('Commercial contract not found');
    const validTo=this.date(body?.validTo,'New valid-to date');
    if(validTo<=new Date(contract.validTo)) throw new BadRequestException('New valid-to date must extend the current validity');
    const status=String(contract.status).toUpperCase()==='SUSPENDED'?'SUSPENDED':'ACTIVE';
    const updated=await this.prisma.serviceContract.update({where:{id},data:{validTo,status}});
    await this.audit.log({
      actorId:user.sub,action:'COMMERCIAL_CONTRACT_EXTEND',objectType:'ServiceContract',objectId:id,
      detail:{contractNo:contract.contractNo,previousValidTo:contract.validTo,newValidTo:validTo,status}
    });
    return updated;
  }

  async matchTariffs(body:any,user:ScopeUser){
    this.internal(user);
    const partyId=this.required(body?.partyId,'Tariff party');
    const origin=this.required(body?.origin,'Origin').toUpperCase();
    const destination=this.required(body?.destination,'Destination').toUpperCase();
    const equipment=this.required(body?.equipment,'Equipment').toUpperCase();
    const at=this.date(body?.at||new Date(),'Rate date');
    const chargeCode=body?.chargeCode?String(body.chargeCode).trim().toUpperCase():undefined;
    const currency=body?.currency?String(body.currency).trim().toUpperCase():undefined;
    const rateWhere:any={origin,destination,equipment};
    if(chargeCode) rateWhere.chargeCode=chargeCode;
    if(currency) rateWhere.currency=currency;

    const contracts=await this.prisma.serviceContract.findMany({
      where:{
        partyId,
        status:{in:['ACTIVE','EXPIRING']},
        validFrom:{lte:at},
        validTo:{gte:at},
        rates:{some:rateWhere}
      },
      include:{rates:{where:rateWhere}},
      orderBy:{validTo:'asc'}
    });

    const results=contracts.flatMap((contract:any)=>contract.rates.map((rate:any)=>({
      ...rate,
      ...this.margin(rate.buyRate,rate.sellRate),
      contract:{
        id:contract.id,contractNo:contract.contractNo,partyId:contract.partyId,partyType:contract.partyType,
        contractType:contract.contractType,trade:contract.trade,currency:contract.currency,
        validFrom:contract.validFrom,validTo:contract.validTo,status:this.displayStatus(contract)
      },
      daysToExpiry:Math.ceil((new Date(contract.validTo).getTime()-at.getTime())/(24*60*60*1000))
    })));
    return results.sort((a:any,b:any)=>Number(a.sellRate??Number.MAX_SAFE_INTEGER)-Number(b.sellRate??Number.MAX_SAFE_INTEGER));
  }

  async createQuoteFromRate(rateId:string,body:any,user:ScopeUser){
    this.internal(user);
    const rate=await this.prisma.contractRateLane.findUnique({where:{id:rateId},include:{contract:true}});
    if(!rate) throw new NotFoundException('Tariff lane not found');
    const contract=rate.contract;
    const status=this.displayStatus(contract);
    if(!['ACTIVE','EXPIRING'].includes(status)) throw new BadRequestException(`Contract ${contract.contractNo} is not active`);
    if(rate.sellRate===null) throw new BadRequestException('Tariff lane requires a sell rate before a quote can be created');

    const customerId=this.required(body?.customerId,'Quote customer');
    const customer=await this.prisma.organization.findUnique({where:{id:customerId}});
    if(!customer||!customer.active||!customer.roles.includes('CUSTOMER')) throw new BadRequestException('Quote customer must be an active customer organization');
    if(String(contract.partyType).toUpperCase()==='CUSTOMER'&&contract.partyId!==customerId)
      throw new BadRequestException('Customer contract can only create a quote for its contracted customer');

    const now=new Date();
    const requestedTo=body?.validTo?this.date(body.validTo,'Quote valid-to date'):new Date(contract.validTo);
    const contractTo=new Date(contract.validTo);
    const validTo=requestedTo<contractTo?requestedTo:contractTo;
    if(validTo.getTime()<now.getTime()) throw new BadRequestException('Contract validity has expired');
    const validFrom=now>new Date(contract.validFrom)?now:new Date(contract.validFrom);
    const quoteNo=String(body?.quoteNo||`Q-${Date.now().toString().slice(-8)}${Math.floor(Math.random()*90+10)}`).trim().toUpperCase();

    const quote=await this.prisma.rateQuote.create({data:{
      quoteNo,
      customerId,
      trade:`${rate.origin}->${rate.destination}`,
      equipment:rate.equipment,
      buyRate:Number(rate.buyRate||0),
      sellRate:Number(rate.sellRate),
      currency:rate.currency,
      validFrom,
      validTo,
      status:'DRAFT',
      source:`CONTRACT:${contract.contractNo}:${rate.id}`
    }});
    await this.audit.log({
      actorId:user.sub,action:'COMMERCIAL_TARIFF_TO_QUOTE',objectType:'RateQuote',objectId:quote.id,
      detail:{quoteNo,contractId:contract.id,contractNo:contract.contractNo,rateId:rate.id,customerId,trade:quote.trade}
    });
    return {...quote,...this.margin(quote.buyRate,quote.sellRate),contractNo:contract.contractNo,rateId:rate.id};
  }
}
