import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { StorageModule } from '../storage/storage.module';
@Module({imports:[StorageModule],controllers:[OrganizationsController],providers:[OrganizationsService]})
export class OrganizationsModule {}
