import { Module } from '@nestjs/common';
import { DataImportController } from './data-import.controller';
import { DataImportService } from './data-import.service';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { AiModule } from '../ai/ai.module';
import { CategoriesModule } from '../categories/categories.module';
import { PapersModule } from '../papers/papers.module';

@Module({
  imports: [
    CategoriesModule,
    PapersModule,
    AiModule,
    ElasticsearchModule.registerAsync({
      useFactory: () => ({
        node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
      }),
    }),
  ],
  controllers: [DataImportController],
  providers: [DataImportService],
})
export class DataImportModule {}
