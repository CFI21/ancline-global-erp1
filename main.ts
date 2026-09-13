import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule,{bufferLogs:true});
  const configured=(process.env.CORS_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);
  if(process.env.NODE_ENV==='production' && configured.length===0){
    throw new Error('CORS_ORIGINS must be configured in production');
  }
  const origins=configured.length?configured:['http://localhost:3000'];
  if(origins.includes('*')) throw new Error('Wildcard CORS origin is not permitted');
  app.enableCors({
    origin:origins,
    credentials:true,
    methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders:['Authorization','Content-Type','X-Request-Id']
  });
  app.use((req:any,res:any,next:any)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if(String(req.headers['x-forwarded-proto']||'').toLowerCase()==='https'){
      res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
    }
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist:true, transform:true, forbidNonWhitelisted:true }));
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT || 4000,'0.0.0.0');
}
bootstrap();
