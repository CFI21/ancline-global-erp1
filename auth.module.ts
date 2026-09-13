import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { ScopeService } from './scope.service';
import { OidcModule } from './oidc/oidc.module';

@Module({
  imports:[OidcModule,JwtModule.registerAsync({
    useFactory:()=>{
      const secret=String(process.env.JWT_SECRET||'');
      if(secret.length<32) throw new Error('JWT_SECRET must be configured with at least 32 characters');
      return {
        secret,
        signOptions:{expiresIn:'1h',issuer:'ancline-api',audience:'ancline-web'}
      };
    }
  })],
  controllers:[AuthController],
  providers:[AuthService,JwtAuthGuard,RolesGuard,ScopeService],
  exports:[AuthService,JwtAuthGuard,RolesGuard,ScopeService,JwtModule]
})
export class AuthModule {}
