import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Paper } from './paper.entity';

@Entity('article_versions')
@Unique(['article_id', 'version_number'])
export class PaperVersion {
  @ApiProperty({ example: 1, description: 'Version record ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'Paper ID' })
  @Column('uuid')
  article_id: string;

  @ApiProperty({ example: 1, description: 'Version number' })
  @Column()
  version_number: number;

  @ApiProperty({ example: 'Learning Transferable Visual Models', description: 'Title at this version' })
  @Column({ length: 500 })
  title: string;

  @ApiProperty({ example: 'State-of-the-art...', description: 'Abstract at this version' })
  @Column({ type: 'text' })
  abstract: string;

  @ApiProperty({ example: 'https://arxiv.org/pdf/2103.00020v1.pdf', description: 'PDF URL for this version' })
  @Column({ length: 512 })
  pdf_url: string;

  @ApiPropertyOptional({ example: 'https://arxiv.org/e-print/2103.00020v1', description: 'Source package URL' })
  @Column({ length: 512, nullable: true })
  source_pack_url: string;

  @ApiPropertyOptional({ example: 1048576, description: 'File size in bytes' })
  @Column({ type: 'bigint', nullable: true })
  size_bytes: number;

  @ApiPropertyOptional({ example: 'Updated results section', description: 'Change log' })
  @Column({ type: 'text', nullable: true })
  change_log: string;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Creation timestamp' })
  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Paper, (paper) => paper.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'article_id' })
  paper: Paper;
}
