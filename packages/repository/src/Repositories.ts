import { DataSource, Repository } from 'typeorm';
import { JobEntity } from './entities/JobEntity';
import { JobHistoryEntity } from './entities/JobHistoryEntity';
import { JobAttemptEntity } from './entities/JobAttemptEntity';
import { ScheduleEntity } from './entities/ScheduleEntity';
import { PGDataSource } from './databaseConnection';

export class Repositories {
  private readonly ds: Promise<DataSource>;

  constructor() {
    this.ds = Promise.resolve(PGDataSource.getInstance().getDataSource());
  }

  async jobRepository(): Promise<Repository<JobEntity>> {
    const ds = await this.ds;
    return ds.getRepository(JobEntity);
  }

  async jobHistoryRepository(): Promise<Repository<JobHistoryEntity>> {
    const ds = await this.ds;
    return ds.getRepository(JobHistoryEntity);
  }

  async jobAttemptRepository(): Promise<Repository<JobAttemptEntity>> {
    const ds = await this.ds;
    return ds.getRepository(JobAttemptEntity);
  }

  async scheduleRepository(): Promise<Repository<ScheduleEntity>> {
    const ds = await this.ds;
    return ds.getRepository(ScheduleEntity);
  }
}


