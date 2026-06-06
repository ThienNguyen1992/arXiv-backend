import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { TopicsModule } from './topics/topics.module';
import { PapersModule } from './papers/papers.module';
import { AuthModule } from './auth/auth.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { AiModule } from './ai/ai.module';
import { CategoriesModule } from './categories/categories.module';
import { DatabaseModule } from './database/database.module';
import { DataImportModule } from './data-import/data-import.module';
import { HelloModule } from './hello/hello.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      uuidExtension: 'pgcrypto',
      autoLoadEntities: true,
      synchronize: false, // Warning: Set to false in production
    }),
    UsersModule,
    TopicsModule,
    PapersModule,
    AuthModule,
    SchedulerModule,
    AiModule,
    CategoriesModule,
    DatabaseModule,
    DataImportModule,
    HelloModule,
  ],
})
export class AppModule {}
