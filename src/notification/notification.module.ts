import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationGateway } from './notification.gateway';
import { NotificationCron } from './notification.cron';
import { Notification } from './entities/notification.entity';
import { Paper } from '../papers/entities/paper.entity';
import { User } from '../users/entities/user.entity';
import { PaperTopic } from '../papers/entities/paper-topic.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, Paper, User, PaperTopic]),
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationGateway, NotificationCron],
  exports: [NotificationService, NotificationGateway],
})
export class NotificationModule {}
