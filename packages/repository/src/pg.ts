import 'dotenv/config';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { JobEntity } from './entities/JobEntity';
import { JobAttemptEntity } from './entities/JobAttemptEntity';
import { ScheduleEntity } from './entities/ScheduleEntity';
import { JobHistoryEntity } from './entities/JobHistoryEntity';
import { ScheduleHistoryEntity } from './entities/ScheduleHistoryEntity';

export function createDataSourceFromEnv(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    username: process.env.PGUSER || 'chronos',
    password: process.env.PGPASSWORD || 'chronos',
    database: process.env.PGDATABASE || 'chronos',
    entities: [JobEntity, JobAttemptEntity, ScheduleEntity, JobHistoryEntity, ScheduleHistoryEntity],
    synchronize: (process.env.DB_SYNC ?? 'true') === 'true',
    logging: false,
  });
}

export function createRedisFromEnv(): Redis {
  return new Redis(Number(process.env.REDIS_PORT || 6379), process.env.REDIS_HOST || '127.0.0.1');
}


