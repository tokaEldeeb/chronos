import { DataSource } from 'typeorm';
import { JobEntity } from '../entities/JobEntity';
import { ScheduleEntity } from '../entities/ScheduleEntity';
import { JobStatus } from '@chronos/shared';
import { createDataSourceFromEnv } from '../pg';

export class JobQueueRepository {
  private readonly ready: Promise<DataSource>;

  constructor() {
    const ds = createDataSourceFromEnv();
    this.ready = ds.isInitialized ? Promise.resolve(ds) : ds.initialize();
  }

  async findDueJobs(limit: number, now: Date): Promise<JobEntity[]> {
    const ds = await this.ready;
    const jobs = await ds
      .getRepository(JobEntity)
      .createQueryBuilder('j')
      .where("j.status = :status", { status: JobStatus.pending })
      .andWhere('(j.runAt IS NULL OR j.runAt <= :now)', { now })
      .orderBy('j.priority', 'DESC')
      .limit(limit)
      .getMany();
    return jobs;
  }

  async findReadySchedules(limit: number, now: Date): Promise<ScheduleEntity[]> {
    const ds = await this.ready;
    return ds
      .getRepository(ScheduleEntity)
      .createQueryBuilder('s')
      .where('s.active = true')
      .andWhere('(s.nextRunAt IS NULL OR s.nextRunAt <= :now)', { now })
      .limit(limit)
      .getMany();
  }

  async listTenantIds(): Promise<string[]> {
    const ds = await this.ready;
    const rows = await ds
      .getRepository(JobEntity)
      .createQueryBuilder('j')
      .select('DISTINCT j.tenantId', 'tenantId')
      .getRawMany();
    return rows.map((r: any) => r.tenantId);
  }

  async countTotalJobs(): Promise<number> {
    const ds = await this.ready;
    return ds.getRepository(JobEntity).count();
  }

  async aggregateByStatus(): Promise<Record<string, number>> {
    const ds = await this.ready;
    const rows = await ds
      .getRepository(JobEntity)
      .createQueryBuilder('j')
      .select('j.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('j.status')
      .getRawMany();
    return Object.fromEntries(rows.map((r: any) => [r.status as string, Number(r.count)]));
  }

  async aggregatePerTenantPendingExecuting(tenantIds?: string[]): Promise<Record<string, { pending: number; executing: number }>> {
    const ds = await this.ready;
    const qb = ds
      .getRepository(JobEntity)
      .createQueryBuilder('j')
      .select('j.tenantId', 'tenantId')
      .addSelect('j.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('j.tenantId')
      .addGroupBy('j.status');
    if (tenantIds && tenantIds.length > 0) {
      qb.where('j.tenantId IN (:...ids)', { ids: tenantIds });
    }
    const rows = await qb.getRawMany();
    const perTenant: Record<string, { pending: number; executing: number }> = {};
    for (const r of rows as any[]) {
      const t = r.tenantId as string;
      const status = r.status as JobStatus | string;
      const count = Number(r.count);
      if (!perTenant[t]) perTenant[t] = { pending: 0, executing: 0 };
      if (status === 'pending') perTenant[t].pending += count;
      if (status === 'executing' || status === 'leased') perTenant[t].executing += count;
    }
    return perTenant;
  }

  async findExpiredLeases(limit: number, now: Date): Promise<JobEntity[]> {
    const ds = await this.ready;
    return ds
      .getRepository(JobEntity)
      .createQueryBuilder('j')
      .where('j.status = :status', { status: JobStatus.queued })
      .andWhere('j.leasedUntil IS NOT NULL AND j.leasedUntil < :now', { now })
      .orderBy('j.leasedUntil', 'ASC')
      .limit(limit)
      .getMany();
  }
}


