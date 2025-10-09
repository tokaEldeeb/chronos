import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'schedule' })
@Index(['tenantId', 'idempotencyKey'], { unique: true })
export class ScheduleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  tenantId!: string;

  @Column('varchar')
  cron!: string;

  @Column('varchar')
  type!: string;

  @Column('jsonb')
  payload!: unknown;

  @Column('int', { default: 0 })
  priority!: number;

  @Column('varchar', { nullable: true })
  idempotencyKey!: string | null;

  @Column('boolean', { default: true })
  active!: boolean;

  @Column('timestamptz', { nullable: true })
  nextRunAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}


