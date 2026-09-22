import { Controller, Get, Header, Headers, Injectable, Logger, Module, OnApplicationBootstrap, ServiceUnavailableException, StreamableFile, UnauthorizedException } from '@nestjs/common';
import { constants, createCipheriv, createHash, publicEncrypt, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { gzipSync } from 'zlib';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ReleaseEvidenceService } from './release-evidence/release-evidence.service';

type OffPlatformEnvelope = {
  format: 'ANCLINE_OFFPLATFORM_BACKUP_ENVELOPE_V1';
  releaseCommit: string;
  generatedAt: string;
  algorithm: 'RSA-OAEP-SHA256+AES-256-GCM';
  publicKeySha256: string;
  gzipSha256: string;
  ciphertextSha256: string;
  gzipBytes: number;
  encryptedBytes: number;
  wrappedKey: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

@Injectable()
class FreeBackupService {
  private cachedEnvelope: OffPlatformEnvelope | null = null;

  constructor(private readonly p: PrismaService) {}

  private deploymentTier() {
    return String(process.env.ANCLINE_DEPLOYMENT_TIER || 'unknown').toLowerCase();
  }

  private assertManualExportEnabled(token?: string) {
    if (String(process.env.FREE_BACKUP_EXPORT_ENABLED || '').toLowerCase() !== 'true') {
      throw new ServiceUnavailableException('Free staging backup export is disabled');
    }
    const expected = String(process.env.FREE_BACKUP_EXPORT_TOKEN || '');
    if (!expected || token !== expected) {
      throw new UnauthorizedException('Invalid backup export token');
    }
  }

  private assertOffPlatformEnabled() {
    if (this.deploymentTier() !== 'staging') {
      throw new ServiceUnavailableException('Off-platform backup envelope is staging-only');
    }
    if (String(process.env.OFFPLATFORM_BACKUP_ENABLED || '').toLowerCase() !== 'true') {
      throw new ServiceUnavailableException('Off-platform backup envelope is disabled');
    }
  }

  async buildLogicalGzip() {
    const tables = await this.p.$queryRawUnsafe<any[]>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema='public' AND table_type='BASE TABLE'
       ORDER BY table_name`
    );
    const columns = await this.p.$queryRawUnsafe<any[]>(
      `SELECT table_name, column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema='public'
       ORDER BY table_name, ordinal_position`
    );

    const data: Record<string, any[]> = {};
    const rowCounts: Record<string, number> = {};
    for (const item of tables) {
      const name = String(item.table_name);
      const safe = name.replace(/"/g, '""');
      const rows = await this.p.$queryRawUnsafe<any[]>(`SELECT * FROM "${safe}"`);
      data[name] = rows;
      rowCounts[name] = rows.length;
    }

    const payload = {
      format: 'ANCLINE_FREE_STAGING_LOGICAL_BACKUP_V2',
      generatedAt: new Date().toISOString(),
      deploymentTier: this.deploymentTier(),
      database: 'ancline_staging_postgres',
      tableCount: tables.length,
      rowCounts,
      schema: columns,
      data
    };
    const json = JSON.stringify(payload, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
    return gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
  }

  async export(token?: string) {
    this.assertManualExportEnabled(token);
    return this.buildLogicalGzip();
  }

  createOffPlatformEnvelope(gzip: Buffer): OffPlatformEnvelope {
    this.assertOffPlatformEnabled();
    const publicKeyPath = resolve(process.cwd(), 'apps/api/config/offplatform-backup-public.pem');
    const publicKey = readFileSync(publicKeyPath, 'utf8');
    const publicKeySha256 = createHash('sha256').update(publicKey, 'utf8').digest('hex');

    const dataKey = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
    const ciphertext = Buffer.concat([cipher.update(gzip), cipher.final()]);
    const tag = cipher.getAuthTag();
    const wrappedKey = publicEncrypt({
      key: publicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    }, dataKey);

    const envelope: OffPlatformEnvelope = {
      format: 'ANCLINE_OFFPLATFORM_BACKUP_ENVELOPE_V1',
      releaseCommit: process.env.ANCLINE_BUILD_COMMIT || process.env.ANCLINE_RELEASE_COMMIT || 'unknown',
      generatedAt: new Date().toISOString(),
      algorithm: 'RSA-OAEP-SHA256+AES-256-GCM',
      publicKeySha256,
      gzipSha256: createHash('sha256').update(gzip).digest('hex'),
      ciphertextSha256: createHash('sha256').update(ciphertext).digest('hex'),
      gzipBytes: gzip.length,
      encryptedBytes: ciphertext.length,
      wrappedKey: wrappedKey.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
    this.cachedEnvelope = envelope;
    return envelope;
  }

  offPlatformEnvelope() {
    this.assertOffPlatformEnabled();
    if (!this.cachedEnvelope) {
      throw new ServiceUnavailableException('Off-platform backup envelope is not ready for this boot');
    }
    return this.cachedEnvelope;
  }
}

@Injectable()
class FreeBackupBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FreeBackupBootstrapService.name);

  constructor(
    private readonly backup: FreeBackupService,
    private readonly evidence: ReleaseEvidenceService,
  ) {}

  async onApplicationBootstrap() {
    if (String(process.env.FREE_BACKUP_LOG_ON_STARTUP || '').toLowerCase() !== 'true') {
      this.evidence.skipBackup('FREE_BACKUP_LOG_ON_STARTUP=false');
      return;
    }

    try {
      const gzip = await this.backup.buildLogicalGzip();
      const envelope = this.backup.createOffPlatformEnvelope(gzip);
      this.evidence.recordBackup({
        sha256: envelope.ciphertextSha256,
        encryptedBytes: envelope.encryptedBytes,
        gzipBytes: envelope.gzipBytes,
        chunks: 0,
        algorithm: envelope.algorithm,
        envelopeFormat: envelope.format,
        publicKeySha256: envelope.publicKeySha256,
        offPlatformArtifactReady: true,
      });

      this.logger.log(`[OFFPLATFORM_BACKUP] READY ${JSON.stringify({
        releaseCommit: envelope.releaseCommit,
        format: envelope.format,
        algorithm: envelope.algorithm,
        publicKeySha256: envelope.publicKeySha256,
        ciphertextSha256: envelope.ciphertextSha256,
        gzipBytes: envelope.gzipBytes,
        encryptedBytes: envelope.encryptedBytes,
      })}`);
    } catch (error: any) {
      this.evidence.recordBackupFailure(error);
      this.logger.error(`[OFFPLATFORM_BACKUP] CRASH ${error?.message || String(error)}`);
    }
  }
}

@Controller('free-backup')
class FreeBackupController {
  constructor(private readonly backup: FreeBackupService) {}

  @Get('export')
  @Header('Content-Type', 'application/gzip')
  @Header('Content-Disposition', 'attachment; filename="ANCLINE_Free_Staging_Postgres_Backup.json.gz"')
  async export(@Headers('x-ancline-backup-token') token?: string) {
    return new StreamableFile(await this.backup.export(token));
  }

  @Get('offplatform-envelope')
  offPlatformEnvelope() {
    return this.backup.offPlatformEnvelope();
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [FreeBackupController],
  providers: [FreeBackupService, FreeBackupBootstrapService],
})
export class FreeBackupModule {}
