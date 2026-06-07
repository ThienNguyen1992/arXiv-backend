import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PapersService } from './papers.service';
import { PapersController } from './papers.controller';
import { Paper } from './entities/paper.entity';
import { PaperVersion } from './entities/paper-version.entity';
import { PaperTopic } from './entities/paper-topic.entity';
import { User } from '../users/entities/user.entity';
import { Topic } from '../topics/entities/topic.entity';
import { PaperFile } from './entities/file.entity';
import { Keyword } from './entities/keyword.entity';
import { PaperKeyword } from './entities/paper-keyword.entity';

import { ElasticsearchModule } from '@nestjs/elasticsearch';

@Module({
  imports: [
    TypeOrmModule.forFeature([Paper, PaperVersion, PaperTopic, User, Topic, PaperFile, Keyword, PaperKeyword]),
    ElasticsearchModule.registerAsync({
      useFactory: () => ({
        node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
      }),
    }),
  ],
  controllers: [PapersController],
  providers: [PapersService],
  exports: [PapersService],
})
export class PapersModule {}
