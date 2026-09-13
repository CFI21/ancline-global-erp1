import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule,{bufferLogs:true});
  app.enableCors({
    origin:(process.env.CORS_ORIGINS||'http://localhost:3000').split(','),
    credentials:true
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist:true, transform:true, forbidNonWhitelisted:true }));
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT || 4000,'0.0.0.0');
}
bootstrap();
