import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { createHmac, createHash, randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  private provider(){return String(process.env.OBJECT_STORAGE_PROVIDER||'stub').toLowerCase();}
  private bucket(){return String(process.env.OBJECT_STORAGE_BUCKET||'');}
  private region(){return String(process.env.OBJECT_STORAGE_REGION||'');}
  private accessKey(){return String(process.env.OBJECT_STORAGE_ACCESS_KEY||'');}
  private secretKey(){return String(process.env.OBJECT_STORAGE_SECRET_KEY||'');}
  private endpoint(){return String(process.env.OBJECT_STORAGE_ENDPOINT||'');}
  private pathStyle(){return String(process.env.OBJECT_STORAGE_PATH_STYLE||'false').toLowerCase()==='true';}
  private hmac(key:Buffer|string,data:string){return createHmac('sha256',key).update(data).digest();}
  private sha(v:string){return createHash('sha256').update(v).digest('hex');}
  private enc(v:string){return encodeURIComponent(v).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());}
  private safeFile(name:any){const x=String(name||'file').trim().replace(/[^A-Za-z0-9._-]/g,'_').replace(/_+/g,'_').slice(0,120);return x||'file';}
  private key(scope:any,filename:any){const cleanScope=String(scope||'general').replace(/[^A-Za-z0-9/_-]/g,'').replace(/^\/+|\/+$/g,'')||'general';return `${cleanScope}/${randomUUID()}-${this.safeFile(filename)}`;}
  private assertS3(){
    if(this.provider()!=='s3')throw new InternalServerErrorException('Secure object storage is not configured');
    const req=['OBJECT_STORAGE_BUCKET','OBJECT_STORAGE_REGION','OBJECT_STORAGE_ACCESS_KEY','OBJECT_STORAGE_SECRET_KEY'];
    const missing=req.filter(x=>!process.env[x]);if(missing.length)throw new InternalServerErrorException(`Missing storage config: ${missing.join(', ')}`);
  }
  private baseUrl(key:string){
    const bucket=this.bucket(),region=this.region();
    if(this.endpoint()){
      const base=new URL(this.endpoint());
      if(this.pathStyle())base.pathname=`/${bucket}/${key.split('/').map(this.enc).join('/')}`;
      else{base.hostname=`${bucket}.${base.hostname}`;base.pathname=`/${key.split('/').map(this.enc).join('/')}`;}
      return base;
    }
    return new URL(`https://${bucket}.s3.${region}.amazonaws.com/${key.split('/').map(this.enc).join('/')}`);
  }
  private signingKey(date:string){
    const kDate=this.hmac('AWS4'+this.secretKey(),date);
    const kRegion=this.hmac(kDate,this.region());
    const kService=this.hmac(kRegion,'s3');
    return this.hmac(kService,'aws4_request');
  }
  private amzNow(){const d=new Date();const iso=d.toISOString().replace(/[:-]|\.\d{3}/g,'');return {amz:iso,day:iso.slice(0,8)};}

  status(){
    const provider=this.provider();
    const configured=provider==='s3'&&Boolean(this.bucket()&&this.region()&&this.accessKey()&&this.secretKey());
    return {provider,configured,bucket:configured?this.bucket():null,region:configured?this.region():null,endpoint:configured?(this.endpoint()||'AWS_S3'):null};
  }

  async createUpload(body:any){
    const provider=this.provider();
    const key=this.key(body.scope,body.filename);
    if(provider==='stub'){
      return {provider,key,uploadUrl:null,expiresInSeconds:0,ready:false,warning:'Secure object storage is not configured'};
    }
    this.assertS3();
    return this.createPresignedPut({...body,key});
  }

  createPresignedPut(body:any){
    this.assertS3();
    const key=String(body.key||this.key(body.scope,body.filename));
    const expires=Math.min(900,Math.max(60,Number(body.expiresInSeconds||600)));
    const url=this.baseUrl(key),{amz,day}=this.amzNow();
    const credential=`${this.accessKey()}/${day}/${this.region()}/s3/aws4_request`;
    const params:any={
      'X-Amz-Algorithm':'AWS4-HMAC-SHA256',
      'X-Amz-Credential':credential,
      'X-Amz-Date':amz,
      'X-Amz-Expires':String(expires),
      'X-Amz-SignedHeaders':'host'
    };
    const sorted=Object.keys(params).sort().map(k=>`${this.enc(k)}=${this.enc(params[k])}`).join('&');
    const canonical=`PUT\n${url.pathname}\n${sorted}\nhost:${url.host}\n\nhost\nUNSIGNED-PAYLOAD`;
    const scope=`${day}/${this.region()}/s3/aws4_request`;
    const stringToSign=`AWS4-HMAC-SHA256\n${amz}\n${scope}\n${this.sha(canonical)}`;
    const sig=createHmac('sha256',this.signingKey(day)).update(stringToSign).digest('hex');
    for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
    url.searchParams.set('X-Amz-Signature',sig);
    return {provider:'s3',key,uploadUrl:url.toString(),method:'PUT',expiresInSeconds:expires,ready:true,headers:{'content-type':String(body.contentType||'application/octet-stream')}};
  }

  private signedHeaders(method:string,key:string){
    this.assertS3();
    const url=this.baseUrl(key),{amz,day}=this.amzNow(),payloadHash=this.sha('');
    const canonicalHeaders=`host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amz}\n`;
    const signed='host;x-amz-content-sha256;x-amz-date';
    const canonical=`${method}\n${url.pathname}\n\n${canonicalHeaders}\n${signed}\n${payloadHash}`;
    const scope=`${day}/${this.region()}/s3/aws4_request`;
    const sts=`AWS4-HMAC-SHA256\n${amz}\n${scope}\n${this.sha(canonical)}`;
    const sig=createHmac('sha256',this.signingKey(day)).update(sts).digest('hex');
    const authorization=`AWS4-HMAC-SHA256 Credential=${this.accessKey()}/${scope}, SignedHeaders=${signed}, Signature=${sig}`;
    return {url,headers:{'x-amz-content-sha256':payloadHash,'x-amz-date':amz,authorization}};
  }

  async verifyObject(key:string){
    if(!key)throw new BadRequestException('Storage key is required');
    const {url,headers}=this.signedHeaders('HEAD',key);
    const r=await fetch(url.toString(),{method:'HEAD',headers});
    if(r.status===404)return {exists:false};
    if(!r.ok)throw new InternalServerErrorException(`Storage verification failed (${r.status})`);
    return {exists:true,etag:r.headers.get('etag'),contentLength:Number(r.headers.get('content-length')||0),contentType:r.headers.get('content-type')||null};
  }
}
