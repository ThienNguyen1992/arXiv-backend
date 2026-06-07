import { Controller, Get, Query } from '@nestjs/common';
import { StatisticsService } from './statistics.service';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';

@ApiTags('statistics')
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get overview statistics (total papers, top categories, date range)' })
  getOverview() {
    return this.statisticsService.getOverview();
  }

  @Get('topics')
  @ApiOperation({ summary: 'Get top popular topics' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  getTopTopics(@Query('limit') limit?: string) {
    return this.statisticsService.getTopTopics(limit ? parseInt(limit, 10) : 20);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Get temporal trends for specific topics' })
  @ApiQuery({ name: 'topics', required: false, example: 'cs.AI,cs.LG', description: 'Comma separated topic codes' })
  @ApiQuery({ name: 'interval', required: false, example: 'year', description: 'year or month' })
  @ApiQuery({ name: 'fromYear', required: false, example: 2019 })
  @ApiQuery({ name: 'toYear', required: false, example: 2024 })
  getTrends(
    @Query('topics') topics?: string,
    @Query('interval') interval?: string,
    @Query('fromYear') fromYear?: string,
    @Query('toYear') toYear?: string
  ) {
    const topicCodes = topics ? topics.split(',') : [];
    return this.statisticsService.getTrends(
      topicCodes,
      interval || 'year',
      fromYear ? parseInt(fromYear, 10) : undefined,
      toYear ? parseInt(toYear, 10) : undefined
    );
  }

  @Get('emerging')
  @ApiOperation({ summary: 'Detect emerging topics with high growth rate' })
  @ApiQuery({ name: 'threshold', required: false, example: 50, description: 'Minimum growth rate %' })
  @ApiQuery({ name: 'minPapers', required: false, example: 10, description: 'Minimum papers in recent years' })
  getEmergingTopics(
    @Query('threshold') threshold?: string,
    @Query('minPapers') minPapers?: string
  ) {
    return this.statisticsService.getEmergingTopics(
      threshold ? parseFloat(threshold) : 50,
      minPapers ? parseInt(minPapers, 10) : 10
    );
  }

  @Get('trending')
  @ApiOperation({ summary: 'Get overall trending topics based on recency, growth, and volume' })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  getTrendingScore(@Query('limit') limit?: string) {
    return this.statisticsService.getTrendingScore(limit ? parseInt(limit, 10) : 10);
  }
}
