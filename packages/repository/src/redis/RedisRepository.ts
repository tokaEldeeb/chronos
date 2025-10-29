import Redis from 'ioredis';
import { RedisConnection } from '../redisConnection';

export const TENANTS_SET_KEY = 'tenants';
const GROUP_NAME = 'workers'; // all workers share this group name

export function tenantStreamKey(tenantId: string): string {
  return `tenant:${tenantId}:stream`;
}

export class RedisRepository {
  private readonly client: Redis;

  constructor() {
    this.client = RedisConnection.getInstance().getRedis();
  }

  async addTenant(tenantId: string): Promise<void> {
    await this.client.sadd(TENANTS_SET_KEY, tenantId);
    // Ensure stream and group exist
    const key = tenantStreamKey(tenantId);
    try {
      await this.client.xgroup('CREATE', key, GROUP_NAME, '0', 'MKSTREAM');
    } catch (err: any) {
      if (!String(err?.message).includes('BUSYGROUP')) {
        console.error('[Redis] Failed to create consumer group:', err);
      }
    }
  }

  async listTenants(): Promise<string[]> {
    return this.client.smembers(TENANTS_SET_KEY);
  }

  // Enqueue a job (add to stream)
  async enqueuePending(tenantId: string, jobId: string, ttl: number): Promise<string | null> {
    const key = tenantStreamKey(tenantId);
    return await this.client.xadd(key, '*', 'jobId', jobId);
    
  }

  // Worker reads next job (blocking or non-blocking)
  async fetchNextJob(tenantId: string, consumerName: string, blockMs = 5000): Promise<{ id: string, jobId: string } | null> {
    const key = tenantStreamKey(tenantId);
    const response = await this.client.xreadgroup(
      'GROUP', GROUP_NAME, consumerName,
      'COUNT', 1,
      'STREAMS', key, '>'
    );

    if (!response) return null;

    const [, messages] = response as [string, [string, [string, string]][]];
    const [id, fields] = messages[0] as [string, [string, string]];
    const jobId = fields[1];
    return { id, jobId };
  }

  // Acknowledge job success
  async ackJob(tenantId: string, messageId: string): Promise<void> {
    const key = tenantStreamKey(tenantId);
    await this.client.xack(key, GROUP_NAME, messageId);
  }

  async reclaimStuckJobs(tenantId: string, idleMs = 30000): Promise<string[]> {
    const key = `tenant:${tenantId}:stream`;
    const group = 'workers';
    const reclaimed: string[] = [];
  
    try {
      const pending = await this.client.xpending(key, group, '-', '+', 50);
      for (const [messageId, consumer, , idleTime] of pending as [string, string, string, number][]) {
        if (idleTime > idleMs) {
          console.warn(`[Redis] Reclaiming message ${messageId} from ${consumer}`);
          const claimed = await this.client.xclaim(key, group, 'reclaimer', 0, messageId);
          if (claimed.length > 0) {
            reclaimed.push(messageId);
          }
        }
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('NOGROUP')) {
        console.error(`[Redis] reclaimStuckJobs failed:`, err);
      }
    }
  
    return reclaimed;
  }
  
  public async getMessage(tenantId: string, messageId: string): Promise<[id: string, fields:string[]][]> {
    const key = `tenant:${tenantId}:stream`;
    return await this.client.xrange(key, messageId, messageId);
  }

  async trimStream(tenantId: string, maxLen = 1000): Promise<void> {
    const key = tenantStreamKey(tenantId);
    await this.client.xtrim(key, 'MAXLEN', '~', maxLen);
  }
}
