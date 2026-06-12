import { Controller, Post, Body } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ArxivTimeQueryDto } from '../papers/dto/arxiv-time-query.dto';

@Controller('scheduler')
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Post('trigger-arxiv')
  async triggerArxiv(@Body() body: { startTime: string; endTime: string }) {
    const dto = new ArxivTimeQueryDto();
    // Chuyển "2026-06-07T00:00:00Z" -> "2026-06-07"
    dto.startDate = body.startTime.substring(0, 10);
    dto.endDate = body.endTime.substring(0, 10);
    return this.schedulerService.runManual(dto);
  }
}
