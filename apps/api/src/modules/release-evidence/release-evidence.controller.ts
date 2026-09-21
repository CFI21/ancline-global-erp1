import { Controller, Get } from '@nestjs/common';
import { ReleaseEvidenceService } from './release-evidence.service';

@Controller('release')
export class ReleaseEvidenceController {
  constructor(private readonly evidence: ReleaseEvidenceService) {}

  @Get('evidence')
  getEvidence() {
    return this.evidence.snapshot();
  }
}
