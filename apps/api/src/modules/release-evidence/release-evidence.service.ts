import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

type GateStatus = 'PENDING' | 'PASS' | 'FAIL' | 'SKIPPED';

type BackupEvidence = {
  sha256: string;
  encryptedBytes: number;
  gzipBytes: number;
  chunks: number;
  algorithm?: string;
  envelopeFormat?: string;
  publicKeySha256?: string;
  offPlatformArtifactReady?: boolean;
};

@Injectable()
export class ReleaseEvidenceService {
  private readonly bootId = randomUUID();
  private readonly startedAt = new Date().toISOString();
  private uat: any = { status: 'PENDING' as GateStatus };
  private backup: any = { status: 'PENDING' as GateStatus };

  private releaseCommit() {
    return process.env.ANCLINE_BUILD_COMMIT || process.env.ANCLINE_RELEASE_COMMIT || 'unknown';
  }

  recordUat(result: any) {
    this.uat = {
      status: result?.status === 'PASS' ? 'PASS' : 'FAIL',
      runId: result?.runId || null,
      cleanup: result?.cleanup !== false,
      summary: result?.summary || null,
      durationMs: Number(result?.durationMs || 0),
      finishedAt: result?.finishedAt || new Date().toISOString(),
      error: result?.status === 'PASS' ? null : (result?.error || 'UAT failed'),
    };
  }

  recordUatFailure(error: any) {
    this.uat = { status: 'FAIL', finishedAt: new Date().toISOString(), error: error?.message || String(error) };
  }

  skipUat(reason: string) {
    this.uat = { status: 'SKIPPED', reason, finishedAt: new Date().toISOString() };
  }

  recordBackup(meta: BackupEvidence) {
    this.backup = { status: 'PASS', ...meta, finishedAt: new Date().toISOString() };
  }

  recordBackupFailure(error: any) {
    this.backup = {
      status: 'FAIL',
      finishedAt: new Date().toISOString(),
      errorHash: createHash('sha256').update(error?.message || String(error)).digest('hex'),
    };
  }

  skipBackup(reason: string) {
    this.backup = { status: 'SKIPPED', reason, finishedAt: new Date().toISOString() };
  }

  snapshot() {
    const uatRequired = String(process.env.UAT_RUN_ON_STARTUP || '').toLowerCase() === 'true';
    const backupRequired = String(process.env.FREE_BACKUP_LOG_ON_STARTUP || '').toLowerCase() === 'true';
    return {
      service: 'ANCLINE API',
      environment: process.env.NODE_ENV || 'unknown',
      deploymentTier: process.env.ANCLINE_DEPLOYMENT_TIER || 'unknown',
      releasePipeline: 'smart-release-hardened-v4',
      releaseCommit: this.releaseCommit(),
      bootId: this.bootId,
      startedAt: this.startedAt,
      requirements: { uatOnStartup: uatRequired, backupOnStartup: backupRequired },
      uat: this.uat,
      backup: this.backup,
      ready: (!uatRequired || this.uat.status === 'PASS') && (!backupRequired || this.backup.status === 'PASS'),
    };
  }
}
