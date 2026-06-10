import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PapersService } from './papers.service';
import { PapersController } from './papers.controller';
import { Paper } from './entities/paper.entity';
import { PaperVersion } from './entities/paper-version.entity';
import { PaperTopic } from './entities/paper-topic.entity';
import { User } from '../users/entities/user.entity';
import { UserFavorite } from '../users/entities/user-favorite.entity';
import { UserPaperHistory } from '../users/entities/user-paper-history.entity';
import { Topic } from '../topics/entities/topic.entity';
import { PaperFile } from './entities/file.entity';
import { Keyword } from './entities/keyword.entity';
import { PaperKeyword } from './entities/paper-keyword.entity';
import { PaperSimilarity } from './entities/paper-similarity.entity';
import { PaperDuplicatesService } from './paper-duplicates.service';

import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Paper,
      PaperVersion,
      PaperTopic,
      User,
      Topic,
      PaperFile,
      Keyword,
      PaperKeyword,
      PaperSimilarity,
      UserFavorite,
      UserPaperHistory,
    ]),
    ElasticsearchModule.registerAsync({
      useFactory: () => ({
        node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
      }),
    }),
  ],
  controllers: [PapersController],
  providers: [PapersService, PaperDuplicatesService, OptionalJwtAuthGuard],
  exports: [PapersService, PaperDuplicatesService],
})
export class PapersModule {}
