import 'reflect-metadata';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { JobStatus } from '@chronos/shared';
import { JobEntity, JobAttemptEntity, Repositories, RedisRepository, RedisConnection, PGDataSource } from '@chronos/repository';

const redis = new RedisRepository();
const repos = new Repositories();
const CONSUMER_NAME = process.env.WORKER_NAME || `worker-${randomUUID()}`;

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
  if (rr.tenants.length === 0) {
    rr.tenants = await redis.listTenants();
    rr.idx = 0;
    if (rr.tenants.length === 0) return;
  }

  const tenant = rr.tenants[rr.idx % rr.tenants.length];
  rr.idx = (rr.idx + 1) % rr.tenants.length;

  // Read from Redis stream (consumer group)
  const msg = await redis.fetchNextJob(tenant, CONSUMER_NAME);
  if (!msg) return;

  const { id: messageId, jobId } = msg;
  const repo = await repos.jobRepository();
  const historyRepo = await repos.jobHistoryRepository();
  const job = await repo.findOneBy({ id: jobId });

  if (!job) {
    console.warn(`Job not found in DB: ${jobId}`);
    await redis.ackJob(tenant, messageId);
    return;
  }

  const correlationId = randomUUID();
  const leasedUntil = new Date(Date.now() + 30000);
  const updated = await repo.update(
    { id: job.id },
    { status: JobStatus.queued, correlationId, leasedUntil, attempts: job.attempts + 1 }
  );

  if (!updated.affected) {
    console.warn('Failed to lease job', jobId);
    await redis.ackJob(tenant, messageId);
    return;
  }

  await historyRepo.save(historyRepo.create({ job, status: JobStatus.leased, note: correlationId }));

  try {
    const result = await executeJob(job);
    await repo.update(
      { id: job.id, correlationId },
      { status: JobStatus.succeeded, correlationId: null, leasedUntil: null, lastError: null }
    );
    await (await repos.jobAttemptRepository())
      .createQueryBuilder()
      .insert()
      .into(JobAttemptEntity)
      .values({ id: randomUUID(), job: { id: job.id }, attemptNumber: job.attempts + 1, result })
      .execute();
    await historyRepo.save(historyRepo.create({ job, status: JobStatus.succeeded, note: 'ok' }));
    await redis.ackJob(tenant, messageId); // ✅ acknowledge stream message
  } catch (err: any) {
    const error = err?.message || String(err);
    const attempts = job.attempts + 1;
    await (await repos.jobAttemptRepository())
      .createQueryBuilder()
      .insert()
      .into(JobAttemptEntity)
      .values({ id: randomUUID(), job: { id: job.id }, attemptNumber: attempts, error })
      .execute();

    if (attempts >= job.maxAttempts) {
      await repo.update(
        { id: job.id, correlationId },
        { status: JobStatus.dead_lettered, correlationId: null, leasedUntil: null, lastError: error }
      );
      await historyRepo.save(historyRepo.create({ job, status: JobStatus.dead_lettered, note: error }));
      await redis.ackJob(tenant, messageId); // remove from stream
    } else {
      const delaySec = nextBackoffSeconds(job);
      await repo.update(
        { id: job.id, correlationId },
        {
          status: JobStatus.failed,
          attempts,
          correlationId: null,
          leasedUntil: null,
          lastError: error,
          runAt: new Date(Date.now() + delaySec * 1000),
          enqueued: false,
        }
      );
      await historyRepo.save(historyRepo.create({ job, status: JobStatus.failed, note: `retry in ${delaySec}s` }));
      await redis.ackJob(tenant, messageId);
    }
  }
}

async function main() {
  const rr = { idx: 0, tenants: [] as string[] };
  const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 200);
  console.log(`Worker ${CONSUMER_NAME} started (interval ${intervalMs}ms)`);

  setInterval(() => {
    processOnce(rr).catch((e) => console.error('worker error', e));
  }, intervalMs);

  process.on('SIGINT', async () => {
    await PGDataSource.getInstance().disconnect();
    await RedisConnection.getInstance().getRedis().quit();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
