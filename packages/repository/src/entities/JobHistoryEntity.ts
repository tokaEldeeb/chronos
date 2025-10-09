import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { JobEntity } from './JobEntity';

@Entity({ name: 'job_history' })
export class JobHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => JobEntity, { onDelete: 'CASCADE' })
  job!: JobEntity;

  @Column('varchar')
  status!: string; // align with shared JobStatus strings

  @Column('varchar', { nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}


