import Redis from 'ioredis';

export class RedisConnection {
  private static instance: RedisConnection | null = null;
  private readonly redis: Redis;

  private constructor() {
    this.redis = this.createRedisFromEnv();
  }

  static getInstance(): RedisConnection {
    if (!this.instance) {
      this.instance = new RedisConnection();
    }
    return this.instance;
  }

  public getRedis(): Redis {
    return this.redis;
  }

  private createRedisFromEnv(): Redis {
    const redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      maxRetriesPerRequest: null, 
      enableReadyCheck: true,
    });
  
    redis.on('connect', () => console.log('[Redis] Connected'));
    redis.on('error', (err) => console.error('[Redis] Error:', err));
    redis.on('reconnecting', () => console.warn('[Redis] Reconnecting...'));
  
    return redis;
  }
  
  public async disconnect(): Promise<void> {
    await this.redis.quit();
  }
  
}

