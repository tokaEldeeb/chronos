import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { JobsService } from '../services/jobs.service';
import { EnqueueJobDto, ScheduleDto } from '../services/dto';

@Controller()
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post('jobs')
  async enqueue(@Body() dto: EnqueueJobDto) {
    const job = await this.jobs.enqueue(dto);
    return { jobId: job.id, status: job.status };
  }

  @Get('jobs/:jobId')
  async get(@Param('jobId') jobId: string) {
    return this.jobs.get(jobId);
  }

  @Post('jobs/:jobId/cancel')
  async cancel(@Param('jobId') jobId: string) {
    const res = await this.jobs.cancel(jobId);
    return { ok: res };
  }

  @Post('schedules')
  async schedule(@Body() dto: ScheduleDto) {
    const s = await this.jobs.createSchedule(dto);
    return { scheduleId: s.id };
  }
}


