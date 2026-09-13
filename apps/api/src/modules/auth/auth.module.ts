import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { ScopeService } from './scope.service';
import { OidcModule } from './oidc/oidc.module';

@Global()
@Module({
  imports:[OidcModule,JwtModule.register({
    secret: process.env.JWT_SECRET || 'dev-only-change-me',
    signOptions:{expiresIn:'8h'}
  })],
  controllers:[AuthController],
  providers:[AuthService,JwtAuthGuard,RolesGuard,ScopeService],
  exports:[AuthService,JwtAuthGuard,RolesGuard,ScopeService,JwtModule]
})
export class AuthModule {}
