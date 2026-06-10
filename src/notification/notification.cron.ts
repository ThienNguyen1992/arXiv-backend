import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationCron {
  private readonly logger = new Logger(NotificationCron.name);

  constructor(private notificationService: NotificationService) {}

  // Chạy mỗi ngày lúc 6h sáng
  @Cron('0 6 * * *', {
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async handleDailyNotification() {
    this.logger.log('Starting daily notification job at 6 AM');

    // Ghim chính xác 06:00:00 để tránh lệch giây do độ trễ job
    const endTime = this.buildSixAM(new Date());       // 06:00:00 hôm nay
    const startTime = this.buildSixAM(new Date());      // 06:00:00 hôm qua
    startTime.setDate(startTime.getDate() - 1);

    await this.notificationService.processNotifications(startTime, endTime);
  }

  /** Trả về Date với giờ cố định 06:00:00.000 theo giờ server */
  private buildSixAM(base: Date): Date {
    const d = new Date(base);
    d.setHours(6, 0, 0, 0);
    return d;
  }

  // API để chạy manual với custom time (cho testing)
  async runManual(startTime: Date, endTime: Date) {
    this.logger.log(`Manual run: ${startTime} to ${endTime}`);
    await this.notificationService.processNotifications(startTime, endTime);
  }
}
