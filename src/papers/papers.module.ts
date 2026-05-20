import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PapersService } from './papers.service';
import { PapersController } from './papers.controller';
import { Paper } from './entities/paper.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Paper])],
  controllers: [PapersController],
  providers: [PapersService],
  exports: [PapersService],
})
export class PapersModule {}
