import { Injectable } from '@nestjs/common';

@Injectable()
export class DiagnosticsService {
  readiness(){
    const checks=[
      ['DATABASE_URL',Boolean(process.env.DATABASE_URL)],
      ['REDIS_URL',Boolean(process.env.REDIS_URL)],
      ['OIDC_ISSUER',Boolean(process.env.OIDC_ISSUER)],
      ['OIDC_CLIENT_ID',Boolean(process.env.OIDC_CLIENT_ID)],
      ['OIDC_CLIENT_SECRET',Boolean(process.env.OIDC_CLIENT_SECRET)],
      ['OBJECT_STORAGE_BUCKET',Boolean(process.env.OBJECT_STORAGE_BUCKET)],
      ['OBJECT_STORAGE_REGION',Boolean(process.env.OBJECT_STORAGE_REGION)],
      ['CORS_ORIGINS',Boolean(process.env.CORS_ORIGINS)]
    ].map(([name,pass])=>({name,pass}));
    return {
      environment:process.env.NODE_ENV||'development',
      pass:checks.every(x=>x.pass),
      checks,
      timestamp:new Date().toISOString()
    };
  }
}
