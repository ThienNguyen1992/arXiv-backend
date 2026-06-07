import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { PapersModule } from '../papers/papers.module';
import { ElasticsearchModule } from '@nestjs/elasticsearch';

@Module({
  imports: [
    PapersModule,
    ElasticsearchModule.registerAsync({
      useFactory: () => ({
        node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
      }),
    }),
  ],
  providers: [SchedulerService]
})
export class SchedulerModule {}
