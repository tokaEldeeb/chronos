import Redis from 'ioredis';
import { createRedisFromEnv } from '../pg';

export const TENANTS_SET_KEY = 'tenants';

export function tenantPendingKey(tenantId: string): string {
  return `tenant:${tenantId}:pending`;
}

export function tenantExecutingKey(tenantId: string): string {
  return `tenant:${tenantId}:executing`;
}

function executingLeaseKey(tenantId: string, jobId: string): string {
  return `lease:${tenantId}:${jobId}`;
}

export class RedisRepository {
  private readonly client: Redis;
  private static instance: RedisRepository | null = null;

  private constructor() {
    this.client = createRedisFromEnv();
  }

  static getInstance(): RedisRepository {
    if (!RedisRepository.instance) {
      RedisRepository.instance = new RedisRepository();
    }
    return RedisRepository.instance;
  }

  async addTenant(tenantId: string): Promise<void> {
    await this.client.sadd(TENANTS_SET_KEY, tenantId);
  }

  async listTenants(): Promise<string[]> {
    return this.client.smembers(TENANTS_SET_KEY);
  }

  async enqueuePending(tenantId: string, jobId: string): Promise<void> {
    await this.client.lpush(tenantPendingKey(tenantId), jobId);
  }

  async movePendingToExecuting(tenantId: string, ttlSeconds?: number): Promise<string | null> {
    const jobId = await this.client.rpoplpush(tenantPendingKey(tenantId), tenantExecutingKey(tenantId));
    if (jobId && ttlSeconds && ttlSeconds > 0) {
      await this.client.setex(executingLeaseKey(tenantId, jobId), ttlSeconds, '1');
    }
    return jobId;
  }

  async removeFromQueues(tenantId: string, jobId: string): Promise<void> {
    await this.client.lrem(tenantPendingKey(tenantId), 0, jobId);
    await this.client.lrem(tenantExecutingKey(tenantId), 0, jobId);
    await this.client.del(executingLeaseKey(tenantId, jobId));
  }

  async reclaimToPending(tenantId: string, jobId: string): Promise<void> {
    await this.client.lrem(tenantExecutingKey(tenantId), 0, jobId);
    await this.client.lpush(tenantPendingKey(tenantId), jobId);
  }

  async pendingLength(tenantId: string): Promise<number> {
    return this.client.llen(tenantPendingKey(tenantId));
  }

  async executingLength(tenantId: string): Promise<number> {
    return this.client.llen(tenantExecutingKey(tenantId));
  }
}





