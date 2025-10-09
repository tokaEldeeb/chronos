import { Module } from '@nestjs/common';
import { MetricsController } from './controllers/metrics.controller';
import { JobsController } from './controllers/jobs.controller';
import { JobsService } from './services/jobs.service';

@Module({
  controllers: [MetricsController, JobsController],
  providers: [JobsService],
})
export class AppModule {}

