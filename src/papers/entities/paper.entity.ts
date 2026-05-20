import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaperTopic } from './paper-topic.entity';
import { PaperAuthor } from './paper-author.entity';
import { PaperVersion } from './paper-version.entity';

@Entity('articles')
@Index('idx_articles_arxiv_id', ['arxiv_id'])
export class Paper {
  @ApiProperty({ example: 'uuid', description: 'Paper ID' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: '2305.12345', description: 'ArXiv ID' })
  @Column({ length: 30, unique: true })
  arxiv_id: string;

  @ApiProperty({ example: 'Learning Transferable Visual Models', description: 'Title' })
  @Column({ length: 500 })
  title: string;

  @ApiProperty({ example: 'State-of-the-art computer vision...', description: 'Abstract' })
  @Column({ type: 'text' })
  abstract: string;

  @ApiProperty({ example: 'https://arxiv.org/pdf/2305.12345.pdf', description: 'PDF URL' })
  @Column({ length: 512 })
  pdf_url: string;

  @ApiPropertyOptional({ example: 'https://arxiv.org/e-print/2305.12345', description: 'Source package URL' })
  @Column({ length: 512, nullable: true })
  source_pack_url: string;

  @ApiPropertyOptional({ example: 'CC BY 4.0', description: 'License type' })
  @Column({ length: 100, default: 'CC BY 4.0' })
  license: string;

  @ApiPropertyOptional({ example: 'Nature 2023', description: 'Journal reference' })
  @Column({ length: 255, nullable: true })
  journal_ref: string;

  @ApiPropertyOptional({ example: '10.1038/s41586-023-00001-1', description: 'DOI' })
  @Column({ length: 100, nullable: true })
  doi: string;

  @ApiPropertyOptional({ example: '12 pages, 4 figures', description: 'Author comments' })
  @Column({ type: 'text', nullable: true })
  comments: string;

  @ApiProperty({ example: 1, description: 'Current version number' })
  @Column({ default: 1 })
  current_version: number;

  @ApiProperty({ example: 'published', description: 'Paper status: pending, published, withdrawn' })
  @Column({ length: 20, default: 'pending' })
  status: string;

  @ApiPropertyOptional({ description: 'Flexible metadata (JSONB)' })
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Index('idx_articles_search_vector', { synchronize: false })
  @Column({ type: 'tsvector', nullable: true, select: false })
  search_vector: string;

  @ApiProperty({ example: '2023-06-15T00:00:00.000Z', description: 'First publication date' })
  @Column({ type: 'timestamptz' })
  published_at: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Creation timestamp' })
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Last update timestamp' })
  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => PaperTopic, (pt) => pt.paper)
  paperTopics: PaperTopic[];

  @OneToMany(() => PaperAuthor, (pa) => pa.paper)
  paperAuthors: PaperAuthor[];

  @OneToMany(() => PaperVersion, (pv) => pv.paper)
  versions: PaperVersion[];
}
