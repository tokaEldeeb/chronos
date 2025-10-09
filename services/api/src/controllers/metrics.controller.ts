import { Controller, Get } from '@nestjs/common';
import { JobQueueRepository } from '@chronos/repository';

@Controller()
export class MetricsController {
  constructor() {}

  @Get('metrics')
  async metrics() {
    const jobRepo = new JobQueueRepository();
    const total = await jobRepo.countTotalJobs();
    const byStatus = await jobRepo.aggregateByStatus();
    const tenantIds = await jobRepo.listTenantIds();
    const perTenant = await jobRepo.aggregatePerTenantPendingExecuting(tenantIds);

    return { total, byStatus, perTenant };
  }
}


