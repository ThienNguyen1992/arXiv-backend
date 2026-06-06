import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('keywords')
export class Keyword {
  @ApiProperty({ example: 1, description: 'Keyword ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 'machine-learning', description: 'Keyword name' })
  @Column({ length: 150, unique: true })
  name: string;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Creation timestamp' })
  @CreateDateColumn()
  created_at: Date;
}
