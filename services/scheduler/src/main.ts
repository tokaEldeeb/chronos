import 'reflect-metadata';
import cron from 'node-cron';
import { RedisRepository, JobQueueRepository, Repositories, PGDataSource, RedisConnection } from '@chronos/repository';
import { JobStatus } from '@chronos/shared';
import parser from 'cron-parser';
import { getBackoffSeconds, getBackoffStrategy } from './config';

const repos = new Repositories();
const redisRepo = new RedisRepository();

async function tick() {
  const schedRepo = new JobQueueRepository();
  const now = new Date();
  const due = await schedRepo.findDueJobs(Number(process.env.SCHEDULER_BATCH || 100), now);

  console.log('processing jobs', due.length);
  for (const job of due) {
    const jobId = job.id;
    const tenantId = job.tenantId;
    await redisRepo.addTenant(tenantId); 
    const messageId = await redisRepo.enqueuePending(tenantId, jobId);

    console.log(`Scheduled job ${jobId} for tenant ${tenantId} (message ${messageId})`);
  }
}

async function processSchedules(now: Date) {
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
  const tenants = await redisRepo.listTenants();
  const idleMs = Number(process.env.VISIBILITY_TIMEOUT_MS || 30000);

  console.log(`[Reclaimer] Checking tenants (${tenants.length})`);

  for (const tenant of tenants) {
    const reclaimed = await redisRepo.reclaimStuckJobs(tenant, idleMs) as string[];
    console.log(`[Reclaimer] Tenant ${tenant}: reclaimed ${reclaimed.length} messages`);

    for (const messageId of reclaimed) {
      // you can read the message back to get the jobId
     
      const msg = await redisRepo.getMessage(tenant, messageId);
      if (msg.length > 0) {
        const [, fields] = msg[0];
        const jobIdIndex = fields.indexOf('jobId');
        const jobId = jobIdIndex !== -1 ? fields[jobIdIndex + 1] : null;
        if (jobId) {
          await repo.update(
            { id: jobId },
            { status: JobStatus.queued, leasedUntil: null, correlationId: null }
          );
          await historyRepo.save(
            historyRepo.create({ job: { id: jobId } as any, status: JobStatus.queued, note: 'reclaimed' })
          );
        }
      }
    }
  }
}


async function normalize() {
  const repo = await repos.jobRepository();
  await repo.update({ status: JobStatus.queued }, { backoffStrategy: getBackoffStrategy(), backoffSeconds: getBackoffSeconds() });
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
  process.on('SIGINT', async () => {
    await PGDataSource.getInstance().disconnect();
    await RedisConnection.getInstance().disconnect();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


