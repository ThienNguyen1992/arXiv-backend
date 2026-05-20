import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Entity('topics')
export class Topic {
  @ApiProperty({ example: 'uuid', description: 'Topic ID' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Machine Learning', description: 'Name of the topic' })
  @Column({ unique: true })
  name: string;

  @ApiPropertyOptional({ example: 'All about Machine Learning', description: 'Topic description' })
  @Column({ type: 'text', nullable: true })
  description: string;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Creation timestamp' })
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Last update timestamp' })
  @UpdateDateColumn()
  updated_at: Date;
}
