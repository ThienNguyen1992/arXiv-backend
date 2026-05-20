import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToMany, JoinTable } from 'typeorm';
import { Topic } from '../../topics/entities/topic.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Entity('papers')
export class Paper {
  @ApiProperty({ example: 'uuid', description: 'Paper ID' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: '2103.00020', description: 'ArXiv ID' })
  @Column({ unique: true })
  arxiv_id: string;

  @ApiProperty({ example: 'Learning Transferable Visual Models', description: 'Title' })
  @Column({ type: 'text' })
  title: string;

  @ApiProperty({ example: 'State-of-the-art computer vision...', description: 'Abstract' })
  @Column({ type: 'text' })
  abstract: string;

  @ApiPropertyOptional({ example: 'CLIP is a model...', description: 'Short summary' })
  @Column({ type: 'text', nullable: true })
  short_summary: string;

  @ApiProperty({ example: ['Alec Radford'], description: 'List of authors' })
  @Column({ type: 'json' })
  authors: string[];

  @ApiProperty({ example: '2021-02-26', description: 'Published Date' })
  @Column({ type: 'date' })
  published_date: Date;

  @ApiProperty({ example: 'https://arxiv.org/pdf/2103.00020.pdf', description: 'PDF URL' })
  @Column()
  pdf_url: string;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Creation timestamp' })
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Last update timestamp' })
  @UpdateDateColumn()
  updated_at: Date;

  @ManyToMany(() => Topic)
  @JoinTable({
    name: 'papers_topics',
    joinColumn: { name: 'paper_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'topic_id', referencedColumnName: 'id' },
  })
  topics: Topic[];
}
