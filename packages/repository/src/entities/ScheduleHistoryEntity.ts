import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ScheduleEntity } from './ScheduleEntity';

@Entity({ name: 'schedule_history' })
export class ScheduleHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ScheduleEntity, { onDelete: 'CASCADE' })
  schedule!: ScheduleEntity;

  @Column('varchar')
  status!: 'created' | 'updated' | 'disabled' | 'triggered';

  @Column('varchar', { nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}


