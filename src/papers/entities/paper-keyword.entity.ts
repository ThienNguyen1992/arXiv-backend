import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Paper } from './paper.entity';
import { Keyword } from './keyword.entity';

@Entity('paper_keywords')
export class PaperKeyword {
  @ApiProperty({ description: 'Paper ID' })
  @PrimaryColumn('uuid')
  paper_id: string;

  @ApiProperty({ description: 'Keyword ID' })
  @PrimaryColumn()
  keyword_id: number;

  @ManyToOne(() => Paper, (paper) => paper.paperKeywords, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paper_id' })
  paper: Paper;

  @ManyToOne(() => Keyword, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'keyword_id' })
  keyword: Keyword;
}
