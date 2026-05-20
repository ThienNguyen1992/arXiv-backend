import { Module } from '@nestjs/common';
import { DatabaseSchemaService } from './database-schema.service';

@Module({
  providers: [DatabaseSchemaService],
})
export class DatabaseModule {}
