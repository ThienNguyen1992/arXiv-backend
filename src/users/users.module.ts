import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { Topic } from '../topics/entities/topic.entity';
import { Paper } from '../papers/entities/paper.entity';
import { PapersModule } from '../papers/papers.module';
import { UserPaperHistory } from './entities/user-paper-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Topic, Paper, UserPaperHistory]), PapersModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
