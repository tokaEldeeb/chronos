import { Injectable } from '@nestjs/common';
import { Repositories } from '@chronos/repository';
import { EnqueueJobDto, ScheduleDto } from './dto';
import { JobEntity, RedisRepository, ScheduleEntity, ScheduleHistoryEntity } from '@chronos/repository';
import { JobStatus } from '@chronos/shared';

@Injectable()
export class JobsService {
  private readonly repos = Repositories.getInstance();

  constructor() {}

  async enqueue(dto: EnqueueJobDto): Promise<JobEntity> {
    const runAt = dto.runAt ? new Date(dto.runAt) : dto.delaySeconds ? new Date(Date.now() + dto.delaySeconds * 1000) : null;
    const jobsRepo = await this.repos.jobRepository();
    const jobHistoryRepo = await this.repos.jobHistoryRepository();

    if (dto.idempotencyKey) {
      const existing = await jobsRepo.findOne({ where: { tenantId: dto.tenantId, idempotencyKey: dto.idempotencyKey } });
      if (existing) return existing;
    }

    const job = jobsRepo.create({
      tenantId: dto.tenantId,
      type: dto.type,
      payload: dto.payload,
      priority: dto.priority ?? 0,
      idempotencyKey: dto.idempotencyKey ?? null,
      runAt,
      status: JobStatus.pending,
      attempts: 0,
      maxAttempts: 5,
      backoffStrategy: process.env.BACKOFF_STRATEGY as 'exponential' | 'fixed' || 'exponential',
      backoffSeconds: Number(process.env.BACKOFF_SECONDS || 5),
      leasedUntil: null,
      leaseId: null,
      lastError: null,
    });

    const saved = await jobsRepo.save(job);
    await jobHistoryRepo.save(jobHistoryRepo.create({ job: saved, status: saved.status, note: 'enqueued' }));
    await RedisRepository.getInstance().addTenant(saved.tenantId);
    return saved;
  }

  async get(jobId: string) {
    const jobsRepo = await this.repos.jobRepository();
    const job = await jobsRepo.findOne({ where: { id: jobId }, relations: ['attemptsHistory'] });
    if (!job) return null;
    return {
      jobId: job.id,
      tenantId: job.tenantId,
      status: job.status,
      attempts: job.attempts,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      lastError: job.lastError ?? undefined,
      history: job.attemptsHistory?.map((a) => ({ attempt: a.attemptNumber, error: a.error ?? undefined, result: a.result ?? undefined, at: a.createdAt })) ?? [],
    };
  }

  async cancel(jobId: string): Promise<boolean> {
    const jobsRepo = await this.repos.jobRepository();
    const jobHistoryRepo = await this.repos.jobHistoryRepository();
    const job = await jobsRepo.findOne({ where: { id: jobId } });
    if (!job) return false;
    if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'dead_lettered') return true;
    job.status = 'cancelled';
    job.leasedUntil = null;
    job.leaseId = null;
    await jobsRepo.save(job);
    await jobHistoryRepo.save(jobHistoryRepo.create({ job, status: 'cancelled', note: 'api cancel' }));
    // also remove from Redis queues if present
    await RedisRepository.getInstance().removeFromQueues(job.tenantId, job.id);
    return true;
  }

  async createSchedule(dto: ScheduleDto): Promise<ScheduleEntity> {
    const scheduleRepo = await this.repos.scheduleRepository();
    const scheduleHistoryRepo = await this.repos.scheduleRepository();
    if (dto.idempotencyKey) {
      const existing = await scheduleRepo.findOne({ where: { tenantId: dto.tenantId, idempotencyKey: dto.idempotencyKey } });
      if (existing) return existing;
    }
    const s = scheduleRepo.create({
      tenantId: dto.tenantId,
      cron: dto.cron,
      type: dto.type,
      payload: dto.payload,
      priority: dto.priority ?? 0,
      idempotencyKey: dto.idempotencyKey ?? null,
      active: true,
    });
    const saved = await scheduleRepo.save(s);
    await scheduleHistoryRepo.save((await this.repos.getDataSource()).getRepository(ScheduleHistoryEntity).create({ schedule: saved, status: 'created', note: 'created via api' }));
    return saved;
  }
}


