export function round2(v:any){return Math.round((Number(v||0)+Number.EPSILON)*100)/100;}
export function periodOf(v:any){const d=new Date(v);if(Number.isNaN(d.getTime()))throw new Error('Invalid date');return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}
export function collectionPriority(daysOverdue:number,status:string,promiseBreached:boolean){
  if(promiseBreached||String(status).toUpperCase()==='DISPUTED'||daysOverdue>=60)return {priority:'CRITICAL',score:100+Math.max(0,daysOverdue)};
  if(daysOverdue>=30)return {priority:'HIGH',score:70+daysOverdue};
  if(daysOverdue>0)return {priority:'MEDIUM',score:40+daysOverdue};
  return {priority:'NORMAL',score:10};
}
export function paymentPriority(daysUntilDue:number,amount:number){
  const urgency=daysUntilDue<0?100+Math.min(60,Math.abs(daysUntilDue)):daysUntilDue<=7?80-daysUntilDue:daysUntilDue<=30?40-Math.floor(daysUntilDue/2):10;
  const value=Math.min(25,Math.log10(Math.max(1,Number(amount||0)))*5);
  return round2(urgency+value);
}
export function liquidityStatus(projected:number,minimumCash:number,overdraftLimit:number){
  if(projected+Number(overdraftLimit||0)<0)return 'BREACH';
  if(projected<Number(minimumCash||0))return 'LOW';
  return 'OK';
}
export function canonicalPair(a:string,b:string){return a<b?[a,b]:[b,a];}
