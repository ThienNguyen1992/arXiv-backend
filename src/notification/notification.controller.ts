import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { NotificationCron } from './notification.cron';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationQueryDto } from './dto/notification-query.dto';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(
    private notificationService: NotificationService,
    private notificationCron: NotificationCron,
  ) {}

  @Post('test-push')
  async testPush(
    @Body() body?: { title?: string; message?: string; data?: any },
  ) {
    return this.notificationService.pushTestNotification(body);
  }

  @Post('trigger')
  async triggerNotification(
    @Body() body: { startTime: string; endTime: string },
  ) {
    const startTime = new Date(body.startTime);
    const endTime = new Date(body.endTime);
    return this.notificationCron.runManual(startTime, endTime);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List notifications (default 5, newest first)',
  })
  async getNotifications(@Request() req, @Query() query: NotificationQueryDto) {
    return this.notificationService.getNotifications(req.user.id, {
      page: query.page,
      size: query.size,
    });
  }

  @Get('unread')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List unread notifications only (default 5, newest first)',
  })
  async getUnreadNotifications(
    @Request() req,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationService.getNotifications(req.user.id, {
      page: query.page,
      size: query.size,
      unreadOnly: true,
    });
  }

  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Count remaining unread notifications' })
  async countUnread(@Request() req) {
    const count = await this.notificationService.countUnread(req.user.id);
    return { unreadCount: count };
  }

  @Patch('mark-all-read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async markAllAsRead(@Request() req) {
    await this.notificationService.markAllAsRead(req.user.id);
    return { success: true, message: 'All notifications marked as read' };
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async markAsRead(@Param('id') id: string) {
    await this.notificationService.markAsRead(id);
    return { success: true };
  }
}
