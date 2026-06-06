import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Category } from '../../categories/entities/category.entity';

@Entity('topics')
@Index('idx_topics_code', ['code'], { unique: true })
export class Topic {
  @ApiProperty({ example: 1, description: 'Topic ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 1, description: 'Category ID' })
  @Column()
  category_id: number;

  @ApiProperty({ example: 'cs.LG', description: 'Topic code' })
  @Column({ length: 50, unique: true })
  code: string;

  @ApiProperty({ example: 'Machine Learning', description: 'Title of the topic' })
  @Column({ length: 150 })
  title: string;

  @ApiPropertyOptional({ example: 'All about Machine Learning', description: 'Topic description' })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ApiProperty({ example: true, description: 'Whether the topic is active' })
  @Column({ default: true })
  is_active: boolean;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Creation timestamp' })
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Last update timestamp' })
  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Category, (category) => category.topics, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: Category;
}
