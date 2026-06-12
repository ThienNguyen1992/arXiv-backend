import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { Topic } from '../topics/entities/topic.entity';
import { PapersModule } from '../papers/papers.module';
import { CategoriesModule } from '../categories/categories.module';
import { UserPaperHistory } from './entities/user-paper-history.entity';
import { UserFavorite } from './entities/user-favorite.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Topic, UserPaperHistory, UserFavorite]),
    PapersModule,
    CategoriesModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
