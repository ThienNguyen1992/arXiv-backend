import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Topic } from '../../topics/entities/topic.entity';

@Entity('categories')
@Index('idx_categories_code', ['code'], { unique: true })
export class Category {
  @ApiProperty({ example: 1, description: 'Category ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 'cs', description: 'Category code' })
  @Column({ length: 50, unique: true })
  code: string;

  @ApiProperty({ example: 'Computer Science', description: 'Title of the category' })
  @Column({ length: 100 })
  title: string;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Creation timestamp' })
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Last update timestamp' })
  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => Topic, (topic) => topic.category)
  topics: Topic[];
}
