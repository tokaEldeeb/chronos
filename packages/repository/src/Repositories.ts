import { DataSource, Repository } from 'typeorm';
import { createDataSourceFromEnv } from './pg';
import { JobEntity } from './entities/JobEntity';
import { JobHistoryEntity } from './entities/JobHistoryEntity';
import { JobAttemptEntity } from './entities/JobAttemptEntity';
import { ScheduleEntity } from './entities/ScheduleEntity';

export class Repositories {
  private static instance: Repositories | null = null;
  private readonly dsPromise: Promise<DataSource>;

  private constructor() {
    const ds = createDataSourceFromEnv();
    this.dsPromise = ds.isInitialized ? Promise.resolve(ds) : ds.initialize();
  }

  static getInstance(): Repositories {
    if (!this.instance) {
      this.instance = new Repositories();
    }
    return this.instance;
  }

  async getDataSource(): Promise<DataSource> {
    return this.dsPromise;
  }

  async jobRepository(): Promise<Repository<JobEntity>> {
    const ds = await this.dsPromise;
    return ds.getRepository(JobEntity);
  }

  async jobHistoryRepository(): Promise<Repository<JobHistoryEntity>> {
    const ds = await this.dsPromise;
    return ds.getRepository(JobHistoryEntity);
  }

  async jobAttemptRepository(): Promise<Repository<JobAttemptEntity>> {
    const ds = await this.dsPromise;
    return ds.getRepository(JobAttemptEntity);
  }

  async scheduleRepository(): Promise<Repository<ScheduleEntity>> {
    const ds = await this.dsPromise;
    return ds.getRepository(ScheduleEntity);
  }
}


