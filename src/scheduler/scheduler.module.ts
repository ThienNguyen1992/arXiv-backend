import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { PapersModule } from '../papers/papers.module';
import { DataImportModule } from '../data-import/data-import.module';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { NotificationModule } from '../notification/notification.module';

import { SchedulerController } from './scheduler.controller';

@Module({
  imports: [
    PapersModule,
    DataImportModule,
    ElasticsearchModule.registerAsync({
      useFactory: () => ({
        node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
      }),
    }),
    NotificationModule, // exports NotificationService + NotificationGateway
  ],
  controllers: [SchedulerController],
  providers: [SchedulerService],
})
export class SchedulerModule {}
