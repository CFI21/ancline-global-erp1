import { Global, Module } from '@nestjs/common';
import { ReleaseEvidenceController } from './release-evidence.controller';
import { ReleaseEvidenceService } from './release-evidence.service';

@Global()
@Module({
  controllers: [ReleaseEvidenceController],
  providers: [ReleaseEvidenceService],
  exports: [ReleaseEvidenceService],
})
export class ReleaseEvidenceModule {}
