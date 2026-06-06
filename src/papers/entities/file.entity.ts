import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Paper } from './paper.entity';

@Entity('paper_files')
export class PaperFile {
  @ApiProperty({ example: 1, description: 'File ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'Paper ID' })
  @Column('uuid')
  paper_id: string;

  @ApiProperty({ example: 'PDF', description: 'Type of the file (e.g. PDF, SOURCE_CODE, DATASET)' })
  @Column({ length: 50 })
  file_type: string;

  @ApiProperty({ example: 'https://arxiv.org/pdf/2305.12345.pdf', description: 'URL or local path to the file' })
  @Column({ length: 512 })
  url_or_path: string;

  @ApiPropertyOptional({ example: 1048576, description: 'File size in bytes' })
  @Column({ type: 'bigint', nullable: true })
  size_bytes: number;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Creation timestamp' })
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Last update timestamp' })
  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Paper, (paper) => paper.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paper_id' })
  paper: Paper;
}
