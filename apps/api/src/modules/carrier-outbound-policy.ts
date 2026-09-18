import { BadRequestException } from '@nestjs/common';

const FORBIDDEN_KEYS=new Set([
  'customer','customerid','customerref','customerreference','customername','customeraddress','customeremail','customerphone',
  'registrationref','registrationreference','kyc','kycdata','kycstatus','ubos','ubo','beneficialowners',
  'housebl','hbl','housedocument','housedocuments','shipperreference','shipper','consignee','notifyparty'
]);

function norm(v:string){return String(v||'').replace(/[^a-z0-9]/gi,'').toLowerCase();}

export function assertAncCarrierOutboundPayload(payload:any){
  const visit=(value:any,path:string)=>{
    if(value==null)return;
    if(Array.isArray(value)){value.forEach((v,i)=>visit(v,`${path}[${i}]`));return;}
    if(typeof value!=='object')return;
    for(const [key,val] of Object.entries(value)){
      const nk=norm(key);
      if(FORBIDDEN_KEYS.has(nk)||nk.startsWith('kyc')||nk.startsWith('customerkyc'))
        throw new BadRequestException(`Carrier outbound privacy rule blocked private ANC customer/house field at ${path?path+'.':''}${key}`);
      visit(val,path?path+'.'+key:key);
    }
  };
  visit(payload,'');
  return payload;
}

export function ancCarrierReference(prefix:string,value:any){
  const clean=String(value??'').trim().replace(/[^A-Za-z0-9_-]/g,'').slice(0,48);
  if(!clean)throw new BadRequestException('ANC reference is required for carrier communication');
  return `ANC-${String(prefix||'REF').toUpperCase()}-${clean}`;
}
