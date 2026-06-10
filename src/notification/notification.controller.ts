import { Controller, Post, Body, Get, Param, Patch, Query } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationCron } from './notification.cron';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Paper } from '../papers/entities/paper.entity';

@Controller('notifications')
export class NotificationController {
  constructor(
    private notificationService: NotificationService,
    private notificationCron: NotificationCron,
    @InjectRepository(Paper)
    private paperRepository: Repository<Paper>,
  ) {}

  // ─── TEST: Push WebSocket KHÔNG lưu DB ─────────────────────────────────
  @Post('test-push')
  async testPush(
    @Body() body?: { title?: string; message?: string; data?: any },
  ) {
    return this.notificationService.pushTestNotification(body);
  }

  // ─── Trigger manual (lưu DB + push WS) ─────────────────────────────────
  @Post('trigger')
  async triggerNotification(
    @Body() body: { startTime: string; endTime: string },
  ) {
    const startTime = new Date(body.startTime);
    const endTime = new Date(body.endTime);
    return this.notificationCron.runManual(startTime, endTime);
  }

  // ─── Lấy danh sách notifications của user ──────────────────────────────
  @Get()
  async getNotifications(
    @Query('userId') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const p = page ? Number(page) : 1;
    const l = limit ? Number(limit) : 5;
    return this.notificationService.getNotifications(userId, p, l);
  }

  // ─── Số thông báo chưa đọc ─────────────────────────────────────────────
  @Get('unread-count')
  async countUnread(@Query('userId') userId: string) {
    const count = await this.notificationService.countUnread(userId);
    return { userId, unreadCount: count };
  }

  // ─── Đánh dấu 1 notification đã đọc ───────────────────────────────────
  @Patch(':id/read')
  async markAsRead(@Param('id') id: string) {
    return this.notificationService.markAsRead(id);
  }

  // ─── Đánh dấu TẤT CẢ đã đọc (BE xử lý) ───────────────────────────────
  @Patch('mark-all-read')
  async markAllAsRead(@Query('userId') userId: string) {
    await this.notificationService.markAllAsRead(userId);
    return { success: true, message: `All notifications marked as read for user ${userId}` };
  }

  // ─── Debug: xem khoảng ngày thực tế trong DB ───────────────────────────
  @Get('debug/date-range')
  async debugDateRange() {
    const result = await this.paperRepository
      .createQueryBuilder('paper')
      .select('MIN(paper.published_at)', 'minDate')
      .addSelect('MAX(paper.published_at)', 'maxDate')
      .addSelect('COUNT(*)', 'totalCount')
      .getRawOne();

    return {
      message: 'Dùng khoảng ngày này để test trigger',
      ...result,
      exampleTrigger: {
        startTime: result.minDate,
        endTime: result.maxDate,
      },
    };
  }
}
