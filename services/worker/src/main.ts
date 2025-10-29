import 'reflect-metadata';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { JobStatus } from '@chronos/shared';
import { JobEntity, JobAttemptEntity, Repositories,RedisRepository, RedisConnection, PGDataSource } from '@chronos/repository';

const redis = new RedisRepository();
const repos = new Repositories();

function nextBackoffSeconds(job: JobEntity): number {
  const base = job.backoffSeconds || 5;
  if (job.backoffStrategy === 'fixed') return base;
  const factor = Math.pow(2, Math.max(0, job.attempts - 1));
  return Math.min(3600, base * factor);
}

async function executeJob(job: JobEntity): Promise<string> {
  if (job.type === 'compute') {
    const payload = job.payload as any;
    const arr = Array.isArray(payload?.numbers) ? payload.numbers : [];
    const sum = arr.reduce((a: number, b: number) => a + b, 0);
    return JSON.stringify({ sum });
  }
  if (job.type === 'http_call') {
    const { url, method, body } = (job.payload || {}) as any;
    const resp = await axios.request({ url, method: method || 'GET', data: body, timeout: 5000 });
    return JSON.stringify({ status: resp.status, data: resp.data });
  }
  throw new Error(`Unknown job type ${job.type}`);
}

async function processOnce(rr: { idx: number; tenants: string[] }) {
  console.log('processing once');
  if (rr.tenants.length === 0) {
    rr.tenants = await redis.listTenants();
    rr.idx = 0;
    if (rr.tenants.length === 0) return;
  }

  const tenant = rr.tenants[rr.idx % rr.tenants.length];
  rr.idx = (rr.idx + 1) % rr.tenants.length;

  console.log('moving pending to executing', tenant);
  const jobId = await redis.movePendingToExecuting(tenant);
  if (!jobId) return;

  console.log('moving pending to executing', tenant);
  const repo = await repos.jobRepository();
  const historyRepo = await repos.jobHistoryRepository();
  const job = await repo.findOneBy({ id: jobId });
  if (!job) {
    console.log('job not found', jobId);
    await redis.removeFromQueues(tenant, jobId);
    return;
  }

  console.log('job found', jobId);
  const correlationId = randomUUID();
  const visTimeoutSec = Number(process.env.VISIBILITY_TIMEOUT_SEC || 30);
  const leasedUntil = new Date(Date.now() + visTimeoutSec * 1000);
  const updated = await repo.update({ id: job.id }, { status: JobStatus.queued, correlationId: correlationId, leasedUntil, attempts: job.attempts + 1 });
  if (!updated.affected) {
    console.log('update failed', jobId);
    await redis.removeFromQueues(tenant, jobId);
    return;
  }
  console.log('update successful', jobId);
  await historyRepo.save(historyRepo.create({ job, status: JobStatus.leased, note: correlationId }));

  try {
    console.log('executing job', jobId);
    const result = await executeJob(job);
    await repo.update({ id: job.id }, { status: JobStatus.succeeded, correlationId: null, leasedUntil: null, lastError: null });
    await (await repos.jobAttemptRepository()).createQueryBuilder().insert().into(JobAttemptEntity).values({ id: randomUUID(), job: {id: job.id}, attemptNumber: job.attempts + 1, error: null, result }).execute();
    await historyRepo.save(historyRepo.create({ job, status: JobStatus.succeeded, note: 'ok' }));
    await redis.removeFromQueues(tenant, jobId);
    console.log('removed from queues as succeeded', jobId);
  } catch (err: any) {
    console.log('error executing job', jobId);
    const attempts = job.attempts + 1;
    const error = err?.message || String(err);
    await (await repos.jobAttemptRepository()).createQueryBuilder().insert().into(JobAttemptEntity).values({ id: randomUUID(), job: {id: job.id}, attemptNumber: attempts, error, result: null }).execute();
    if (attempts >= job.maxAttempts) {
      console.log('dead lettered job', jobId);
      await repo.update({ id: job.id }, { status: JobStatus.dead_lettered, correlationId: null, leasedUntil: null, lastError: error });
      await historyRepo.save(historyRepo.create({ job, status: JobStatus.dead_lettered, note: error }));
      await redis.removeFromQueues(tenant, jobId);
    } else {
      console.log('retrying job', jobId);
      const delaySec = nextBackoffSeconds(job);
      console.log('retrying job', jobId, delaySec);
      await repo.update({ id: job.id }, { status: JobStatus.failed, attempts, correlationId: null, leasedUntil: null, lastError: error, runAt: new Date(Date.now() + delaySec * 1000), enqueued: false });
      await historyRepo.save(historyRepo.create({ job, status: JobStatus.failed, note: `retry in ${delaySec}s` }));
      await redis.removeFromQueues(tenant, jobId);
      console.log('removed from queues', jobId);
    }
  }
}

async function main() {
  const rr = { idx: 0, tenants: [] as string[] };
  const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 100);
  // eslint-disable-next-line no-console
  console.log(`Worker started (loop ${intervalMs}ms)`);
  setInterval(() => {
    processOnce(rr).catch((e) => console.error('worker error', e));
  }, intervalMs);
  process.on('SIGINT', async () => {
    await PGDataSource.getInstance().disconnect();
    await RedisConnection.getInstance().disconnect();
    process.exit(0);
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});


