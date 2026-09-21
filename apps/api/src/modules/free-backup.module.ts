import { Controller, Get, Header, Injectable, Module, Query, ServiceUnavailableException, StreamableFile, UnauthorizedException } from '@nestjs/common';
import { gzipSync } from 'zlib';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
class FreeBackupService {
  constructor(private readonly p: PrismaService) {}

  private assertEnabled(token?: string) {
    if (String(process.env.FREE_BACKUP_EXPORT_ENABLED || '').toLowerCase() !== 'true') {
      throw new ServiceUnavailableException('Free staging backup export is disabled');
    }
    const expected = String(process.env.FREE_BACKUP_EXPORT_TOKEN || '');
    if (!expected || token !== expected) {
      throw new UnauthorizedException('Invalid backup export token');
    }
  }

  async export(token?: string) {
    this.assertEnabled(token);

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
      format: 'ANCLINE_FREE_STAGING_LOGICAL_BACKUP_V1',
      generatedAt: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      database: 'ancline_staging_postgres',
      tableCount: tables.length,
      rowCounts,
      schema: columns,
      data
    };
    const json = JSON.stringify(payload, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
    return gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
  }
}

@Controller('free-backup')
class FreeBackupController {
  constructor(private readonly backup: FreeBackupService) {}

  @Get('export')
  @Header('Content-Type', 'application/gzip')
  @Header('Content-Disposition', 'attachment; filename="ANCLINE_Free_Staging_Postgres_Backup.json.gz"')
  async export(@Query('token') token?: string) {
    return new StreamableFile(await this.backup.export(token));
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [FreeBackupController],
  providers: [FreeBackupService],
})
export class FreeBackupModule {}
