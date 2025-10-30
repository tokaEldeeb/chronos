import 'dotenv/config';
import { DataSource } from 'typeorm';
import { JobEntity } from './entities/JobEntity';
import { JobAttemptEntity } from './entities/JobAttemptEntity';
import { ScheduleEntity } from './entities/ScheduleEntity';
import { JobHistoryEntity } from './entities/JobHistoryEntity';
import { ScheduleHistoryEntity } from './entities/ScheduleHistoryEntity';

export class PGDataSource {
  private static instance: PGDataSource | null = null;
  private dataSource: DataSource;
  private initPromise: Promise<DataSource> | null = null;

  private constructor() {
    this.dataSource = this.createDataSourceFromEnv();
  }

  static getInstance(): PGDataSource {
    if (!this.instance) {
      this.instance = new PGDataSource();
    }
    return this.instance;
  }

  /** 
   * Returns a connected DataSource, initializing it lazily if needed.
   * Thread-safe and idempotent across async calls.
   */
  public async getDataSource(): Promise<DataSource> {
    if (this.dataSource.isInitialized) {
      return this.dataSource;
    }

    if (!this.initPromise) {
      this.initPromise = this.dataSource.initialize();
    }

    return this.initPromise;
  }

  private createDataSourceFromEnv(): DataSource {
    return new DataSource({
      type: 'postgres',
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      username: process.env.PGUSER || 'chronos',
      password: process.env.PGPASSWORD || 'chronos',
      database: process.env.PGDATABASE || 'chronos',
      entities: [
        JobEntity,
        JobAttemptEntity,
        ScheduleEntity,
        JobHistoryEntity,
        ScheduleHistoryEntity,
      ],
      synchronize: (process.env.DB_SYNC ?? 'true') === 'true',
      logging: false,
    });
  }

  public async disconnect(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
    }
  }
}
