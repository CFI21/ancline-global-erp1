import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  async createUpload(body:any){
    const provider=(process.env.OBJECT_STORAGE_PROVIDER||'stub').toLowerCase();
    const bucket=process.env.OBJECT_STORAGE_BUCKET||'';
    const key=`${body.scope||'general'}/${randomUUID()}-${body.filename||'file'}`;

    if(provider==='stub'){
      return {
        provider,
        key,
        uploadUrl:`https://object-storage.example.invalid/upload/${encodeURIComponent(key)}`,
        expiresInSeconds:900,
        warning:'Development stub only'
      };
    }

    if(provider==='s3'){
      // Staging adapter contract. Wire AWS SDK v3 or S3-compatible SDK with the
      // environment variables below before exposing externally.
      const required=[
        'OBJECT_STORAGE_BUCKET',
        'OBJECT_STORAGE_REGION',
        'OBJECT_STORAGE_ACCESS_KEY',
        'OBJECT_STORAGE_SECRET_KEY'
      ];
      const missing=required.filter(x=>!process.env[x]);
      if(missing.length) throw new InternalServerErrorException(`Missing storage config: ${missing.join(', ')}`);

      return {
        provider:'s3',
        bucket,
        region:process.env.OBJECT_STORAGE_REGION,
        key,
        uploadUrl:null,
        expiresInSeconds:900,
        readyForSdkBinding:true
      };
    }

    throw new InternalServerErrorException(`Unsupported object storage provider: ${provider}`);
  }
}
