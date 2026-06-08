import { Controller, Get, Query } from '@nestjs/common';
import { StatisticsService } from './statistics.service';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';

@ApiTags('statistics')
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  // ==========================================
  // I. TRENDS DASHBOARD (Visualization)
  // ==========================================

  @Get('dashboard/topic-velocity')
  @ApiOperation({ summary: 'Biểu đồ đường: Tốc độ ra bài của các chủ đề (Topic Velocity)' })
  @ApiQuery({ name: 'topics', required: false, example: 'cs.AI,cs.CV', description: 'Comma separated topic codes' })
  @ApiQuery({ name: 'interval', required: false, example: 'month', description: 'day, week, month, or year' })
  getTopicVelocity(
    @Query('topics') topics?: string,
    @Query('interval') interval?: string
  ) {
    const topicCodes = topics ? topics.split(',') : [];
    return this.statisticsService.getTopicVelocity(topicCodes, interval || 'month');
  }

  @Get('dashboard/keywords-cloud')
  @ApiOperation({ summary: 'Word Cloud: Các từ khóa hot nhất từ abstract (Hot Keywords)' })
  @ApiQuery({ name: 'days', required: false, example: 30, description: 'Số ngày gần nhất' })
  @ApiQuery({ name: 'size', required: false, example: 50, description: 'Số lượng từ khóa' })
  getHotKeywordsCloud(
    @Query('days') days?: string,
    @Query('size') size?: string
  ) {
    return this.statisticsService.getHotKeywordsCloud(
      days ? parseInt(days, 10) : 30,
      size ? parseInt(size, 10) : 50
    );
  }

  @Get('dashboard/activity-heatmap')
  @ApiOperation({ summary: 'Heatmap: Bản đồ nhiệt giao thoa giữa các chủ đề (Activity Map)' })
  @ApiQuery({ name: 'limit', required: false, example: 10, description: 'Top N chủ đề' })
  getActivityHeatmap(@Query('limit') limit?: string) {
    return this.statisticsService.getActivityHeatmap(limit ? parseInt(limit, 10) : 10);
  }

  @Get('dashboard/topic-race')
  @ApiOperation({ summary: 'Bar Chart Race: Hoạt ảnh đua thứ hạng chủ đề qua các năm/tháng' })
  @ApiQuery({ name: 'interval', required: false, example: 'year', description: 'month or year' })
  getCategoryRace(@Query('interval') interval?: string) {
    return this.statisticsService.getCategoryRace(interval || 'year');
  }

  // ==========================================
  // II. LEADERBOARD
  // ==========================================

  @Get('leaderboard/trending-papers')
  @ApiOperation({ summary: 'Leaderboard: Top Papers có điểm số cao nhất' })
  @ApiQuery({ name: 'timeframe', required: false, example: 'month', description: 'today, week, month, all' })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  getTrendingPapers(
    @Query('timeframe') timeframe?: string,
    @Query('limit') limit?: string
  ) {
    return this.statisticsService.getTrendingPapers(
      timeframe || 'month',
      limit ? parseInt(limit, 10) : 10
    );
  }

  @Get('leaderboard/top-authors')
  @ApiOperation({ summary: 'Leaderboard: Top Tác giả có nhiều cống hiến nhất' })
  @ApiQuery({ name: 'timeframe', required: false, example: 'all', description: 'today, week, month, all' })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  getTopAuthors(
    @Query('timeframe') timeframe?: string,
    @Query('limit') limit?: string
  ) {
    return this.statisticsService.getTopAuthors(
      timeframe || 'all',
      limit ? parseInt(limit, 10) : 10
    );
  }

  @Get('leaderboard/rising-topics')
  @ApiOperation({ summary: 'Leaderboard: Top Chủ đề bứt phá (Tăng trưởng % nhanh nhất)' })
  @ApiQuery({ name: 'timeframe', required: false, example: 'month', description: 'week, month, year' })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  getRisingTopics(
    @Query('timeframe') timeframe?: string,
    @Query('limit') limit?: string
  ) {
    return this.statisticsService.getRisingTopics(
      timeframe || 'month',
      limit ? parseInt(limit, 10) : 10
    );
  }
}
