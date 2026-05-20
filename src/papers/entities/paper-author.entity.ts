import { Entity, Column, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Paper } from './paper.entity';
import { Author } from '../../authors/entities/author.entity';

@Entity('article_authors')
export class PaperAuthor {
  @ApiProperty({ description: 'Paper ID' })
  @PrimaryColumn('uuid')
  article_id: string;

  @ApiProperty({ description: 'Author ID' })
  @PrimaryColumn()
  author_id: number;

  @ApiProperty({ example: 1, description: 'Author order in the paper' })
  @Column()
  author_order: number;

  @ApiProperty({ example: false, description: 'Whether this is the corresponding author' })
  @Column({ default: false })
  is_corresponding: boolean;

  @ManyToOne(() => Paper, (paper) => paper.paperAuthors, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'article_id' })
  paper: Paper;

  @ManyToOne(() => Author, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: Author;
}
