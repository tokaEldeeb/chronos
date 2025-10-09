import { IsInt, IsISO8601, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class EnqueueJobDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsIn(['http_call', 'compute'])
  type!: 'http_call' | 'compute';

  @IsObject()
  payload!: unknown;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  delaySeconds?: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  runAt?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class ScheduleDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  cron!: string;

  @IsString()
  @IsIn(['http_call', 'compute'])
  type!: 'http_call' | 'compute';

  @IsObject()
  payload!: unknown;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}


