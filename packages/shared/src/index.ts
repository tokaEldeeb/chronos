export type UUID = string;

export type JobTrigger = 'immediate' | 'date' | 'interval' | 'cron';

export interface Tenant {
  id: UUID;
  name: string;
}

export enum JobStatus {
  pending = 'pending',
  queued = 'queued',
  leased = 'leased',
  succeeded = 'succeeded',
  failed = 'failed',
  cancelled = 'cancelled',
  dead_lettered = 'dead_lettered',
}

export interface JobPayload {
  task: string;
  args?: unknown[];
  kwargs?: Record<string, unknown>;
}

export interface IntervalSpec {
  seconds?: number;
  minutes?: number;
  hours?: number;
}

export interface CronSpec {
  second?: string;
  minute?: string;
  hour?: string;
  dayOfMonth?: string;
  month?: string;
  dayOfWeek?: string;
}

export interface EnqueueRequest {
  tenantId: UUID;
  trigger: JobTrigger;
  delaySeconds?: number; // for 'date'
  runAtIso?: string; // explicit ISO timestamp for 'date'
  interval?: IntervalSpec; // for 'interval'
  cron?: CronSpec; // for 'cron'
  payload: JobPayload;
  jobId?: UUID; // optional idempotency
}

export interface JobRecord {
  id: UUID;
  tenantId: UUID;
  status: JobStatus;
  trigger: JobTrigger;
  payload: JobPayload;
  queuedAt: string; // ISO
  scheduledAt?: string; // ISO
  startedAt?: string; // ISO
  finishedAt?: string; // ISO
  lastError?: string;
  attempts: number;
  maxAttempts: number;
}

export interface QueueKeys {
  pendingQueue: string;
  executingQueue: string;
}

export function tenantQueueKeys(tenantId: UUID): QueueKeys {
  return {
    pendingQueue: `tenant:${tenantId}:pending`,
    executingQueue: `tenant:${tenantId}:executing`,
  };
}


