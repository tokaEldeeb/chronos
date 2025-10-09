## Chronos Monorepo

Chronos is a multi-tenant job system that schedules and runs background jobs with immediate, delayed, and recurring execution. It uses Postgres as the source of truth and Redis for lightweight per-tenant queues.

### Project Structure

- packages/
  - shared: shared types (e.g., `JobStatus`, request DTOs)
  - repository: DB/Redis access layer (TypeORM entities, query repositories, RedisRepository, DataSource init)
- services/
  - api: NestJS HTTP API (enqueue/cancel/status/schedules, metrics)
  - scheduler: cron-driven service to materialize schedules into `job`, enqueue due jobs, and reclaim expired leases
  - worker: executes jobs using round-robin across tenants

### Components and Flow

- Postgres (tables): `job`, `job_attempts`, `job_history`, `schedule`, `schedule_history`
- Redis (keys): `tenants` set, `tenant:<tenantId>:pending`, `tenant:<tenantId>:executing`, `lease:<tenantId>:<jobId>`

1) API
- POST `v1/jobs`: insert a `job` row (status `pending`), idempotent by `(tenantId, idempotencyKey)`
- POST `v1/schedules`: insert a `schedule` row
- GET `v1/jobs/:jobId`: fetch job with attempts
- POST `v1/jobs/:jobId/cancel`: mark cancelled and remove from Redis queues if present
- GET `v1/metrics`: aggregates from Postgres

2) Scheduler
- processSchedules: find ready schedules (by `nextRunAt`), create `job` rows with status `pending`, advance `nextRunAt`
- tick: find due jobs in Postgres (`status = pending`, `runAt <= now`, not leased) and push jobIds to Redis `tenant:<id>:pending`; set status to `enqueued`
- reclaim: detect expired leases in Postgres (`status = leased`, `leasedUntil < now`), move to pending queue, set status `enqueued`

3) Worker (round-robin pulling)
- Keeps a list of tenants from Redis `tenants` set
- For each tick:
  - Pick next tenant in round-robin
  - Move a job id via `RPOPLPUSH` from `tenant:<id>:pending` to `tenant:<id>:executing`
  - Lease the job in Postgres (set `status = leased`, `correlationId`, `leasedUntil`), else remove from executing if stale
  - Execute job types:
    - `compute`: deterministic compute (e.g. sum numbers)
    - `http_call`: perform HTTP request
  - On success: set `status = succeeded`, write attempt + history, remove from executing
  - On failure: write attempt; if attempts >= max → `dead_lettered`; else set `status = pending` and `runAt = now + backoff`

### Backoff & Visibility Timeout

- Backoff policy is configured centrally in Scheduler via env (`BACKOFF_STRATEGY`, `BACKOFF_SECONDS`) and normalized periodically for queued jobs.
- Worker uses a visibility timeout (`VISIBILITY_TIMEOUT_SEC`) to set `leasedUntil`. Reclaim loop returns expired leases to pending.

### Run Locally (Docker)

```bash
# Ensure Docker Desktop is running
docker compose build
docker compose up -d

# API available at
curl http://localhost:3000/v1/metrics
```

### Example Requests

Immediate compute job:
```bash
curl -X POST http://localhost:3000/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "11111111-1111-1111-1111-111111111111",
    "type": "compute",
    "payload": { "numbers": [1,2,3,4,5] },
    "priority": 10,
    "idempotencyKey": "compute-1"
  }'
```

Delayed HTTP call (10s):
```bash
curl -X POST http://localhost:3000/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "11111111-1111-1111-1111-111111111111",
    "type": "http_call",
    "payload": { "url": "https://httpbin.org/get", "method": "GET" },
    "delaySeconds": 10,
    "priority": 5,
    "idempotencyKey": "http-1"
  }'
```

### Environment

- Set via `.env` or docker-compose: Postgres (`PG*`), Redis (`REDIS_*`), Scheduler crons, backoff, worker loop, `DB_SYNC=true` for dev auto schema.

### Notes

- Postgres is the source of truth (status/history). Redis holds ephemeral per-tenant queues.
- The repository package centralizes all DB/Redis access so services don’t manage connections directly.

