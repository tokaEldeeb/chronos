import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { JobAttemptEntity } from './JobAttemptEntity';


@Entity({ name: 'job' })
@Index(['tenantId', 'idempotencyKey'], { unique: true })
export class JobEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  tenantId!: string;

  @Column('varchar')
  type!: string;

  @Column('jsonb')
  payload!: unknown;

  @Column('int', { default: 0 })
  priority!: number;

  @Column('varchar', { nullable: true })
  idempotencyKey!: string | null;

  @Column('timestamptz', { nullable: true })
  runAt!: Date | null;

  @Column('varchar', { default: 'pending' })
  status!: string;

  @Column('boolean', { default: false })
  enqueued!: boolean;

  @Column('int', { default: 0 })
  attempts!: number;

  @Column('int', { default: 5 })
  maxAttempts!: number;

  @Column('varchar', { default: 'exponential' })
  backoffStrategy!: 'exponential' | 'fixed';

  @Column('int', { default: 5 })
  backoffSeconds!: number;

  @Column('timestamptz', { nullable: true })
  leasedUntil!: Date | null;

  @Column('varchar', { nullable: true })
  correlationId!: string | null;

  @Column('varchar', { nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => JobAttemptEntity, (a) => a.job)
  attemptsHistory!: JobAttemptEntity[];
}


