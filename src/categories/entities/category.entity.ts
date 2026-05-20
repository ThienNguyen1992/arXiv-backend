import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Topic } from '../../topics/entities/topic.entity';

@Entity('categories')
export class Category {
  @ApiProperty({ example: 1, description: 'Category ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 'cs', description: 'Category code' })
  @Column({ length: 10, unique: true })
  code: string;

  @ApiProperty({ example: 'Computer Science', description: 'Name of the category' })
  @Column({ length: 100 })
  name: string;

  @ApiPropertyOptional({ example: 'All about computer science', description: 'Category description' })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Creation timestamp' })
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Last update timestamp' })
  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => Topic, (topic) => topic.category)
  topics: Topic[];
}
