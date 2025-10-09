import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { JobEntity } from './JobEntity';

@Entity({ name: 'job_attempts' })
export class JobAttemptEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => JobEntity, { onDelete: 'CASCADE' })
  job!: JobEntity;

  @Column('int')
  attemptNumber!: number;

  @Column('varchar', { nullable: true })
  error!: string | null;

  @Column('varchar', { nullable: true })
  result!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}


