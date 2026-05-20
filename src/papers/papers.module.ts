import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PapersService } from './papers.service';
import { PapersController } from './papers.controller';
import { Paper } from './entities/paper.entity';
import { PaperVersion } from './entities/paper-version.entity';
import { PaperTopic } from './entities/paper-topic.entity';
import { PaperAuthor } from './entities/paper-author.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Paper, PaperVersion, PaperTopic, PaperAuthor])],
  controllers: [PapersController],
  providers: [PapersService],
  exports: [PapersService],
})
export class PapersModule {}
