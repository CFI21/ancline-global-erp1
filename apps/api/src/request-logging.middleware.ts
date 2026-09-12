import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  use(req:Request,res:Response,next:NextFunction){
    const requestId=(req.headers['x-request-id'] as string)||randomUUID();
    res.setHeader('x-request-id',requestId);
    const start=Date.now();
    res.on('finish',()=>{
      const log={
        level:'info',
        event:'http_request',
        requestId,
        method:req.method,
        path:req.originalUrl,
        status:res.statusCode,
        durationMs:Date.now()-start,
        timestamp:new Date().toISOString()
      };
      console.log(JSON.stringify(log));
    });
    next();
  }
}
