import 'reflect-metadata';
import cron from 'node-cron';
import { RedisRepository, JobQueueRepository, Repositories } from '@chronos/repository';
import { JobStatus } from '@chronos/shared';
import parser from 'cron-parser';
import { getBackoffSeconds, getBackoffStrategy } from './config';

const repos = Repositories.getInstance();
const redisRepo = RedisRepository.getInstance();

async function tick() {
  const repo = await repos.jobRepository();
  const historyRepo = await repos.jobHistoryRepository();
  const schedRepo = new JobQueueRepository();
  const now = new Date();
  const due = await schedRepo.findDueJobs(Number(process.env.SCHEDULER_BATCH || 100), now);
  console.log('processing jobs', due.length);
  for (const job of due) {   
    console.log('processing job', job.id);
    const jobId = job.id;
    await redisRepo.enqueuePending(job.tenantId, jobId);
    await repo.update({ id: jobId }, { status: JobStatus.enqueued });
    await redisRepo.addTenant(job.tenantId);
    await historyRepo.save(historyRepo.create({ job: { id: jobId } as any, status: JobStatus.enqueued, note: 'scheduler enqueue' }));
  }
}

async function processSchedules(now: Date) {
  const repos = Repositories.getInstance();
  const schedRepo = new JobQueueRepository();
  const repo = await repos.jobRepository();
  const scheduleRepo = await repos.scheduleRepository();
  const ready = await schedRepo.findReadySchedules(Number(process.env.SCHEDULE_BATCH || 100), now);
  console.log('processing schedules', ready.length);
  for (const s of ready) {
    await repo.save(repo.create({
      tenantId: s.tenantId,
      type: s.type as any,
      payload: s.payload as any,
      priority: s.priority,
      runAt: now,
      status: JobStatus.pending,
      attempts: 0,
      maxAttempts: 5,
      backoffStrategy: getBackoffStrategy(),
      backoffSeconds: getBackoffSeconds(),
      enqueued: false,
    }));
    try {
      console.log('scheduling job', s.id, s.cron);
      const it = parser.parseExpression(s.cron, { currentDate: now });
      const next = it.next().toDate();
      await scheduleRepo.update({ id: s.id }, { nextRunAt: next });
    } catch {
      console.log('error scheduling job', s.id, s.cron);
      await scheduleRepo.update({ id: s.id }, { active: false });
    }
  }
}

async function reclaim() {
  const repo = await repos.jobRepository();
  const historyRepo = await repos.jobHistoryRepository();
  const schedRepo = new JobQueueRepository();
  const now = new Date();
  const expired = await schedRepo.findExpiredLeases(Number(process.env.RECLAIM_BATCH || 200), now);
  console.log('reclaiming jobs', expired.length);
  for (const j of expired) {
    console.log('reclaiming job', j.id);
    await redisRepo.reclaimToPending(j.tenantId, j.id);
    await repo.update({ id: j.id }, { status: JobStatus.enqueued, leasedUntil: null, leaseId: null });
    await historyRepo.save(historyRepo.create({ job: j as any, status: JobStatus.enqueued, note: 'reclaimed' }));
  }
}

async function normalize() {
  const repos = Repositories.getInstance();
  const repo = await repos.jobRepository();
  await repo.update({ status: JobStatus.enqueued }, { backoffStrategy: getBackoffStrategy(), backoffSeconds: getBackoffSeconds() });
}

async function main() {
  const tickCron = process.env.SCHEDULER_TICK_CRON || '* * * * * *'; // every second
  const reclaimCron = process.env.RECLAIM_CRON || '* * * * * *'; // every second
  // eslint-disable-next-line no-console
  console.log(`Scheduler started (cron tick='${tickCron}', reclaim='${reclaimCron}')`);
  cron.schedule(tickCron, () => tick().catch((err) => console.error('tick error', err)));
  cron.schedule(reclaimCron, () => reclaim().catch((err) => console.error('reclaim error', err)));
  const scheduleCron = process.env.SCHEDULE_CRON || '* * * * * *';
  cron.schedule(scheduleCron, () => processSchedules(new Date()).catch((err) => console.error('schedule error', err)));

  const normalizeCron = process.env.BACKOFF_NORMALIZE_CRON || '*/10 * * * * *';
  cron.schedule(normalizeCron, () => normalize().catch((err) => console.error('normalize error', err)));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});


