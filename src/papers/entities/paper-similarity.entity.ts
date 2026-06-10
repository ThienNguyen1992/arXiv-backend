import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('paper_similarities')
@Unique(['arxiv_id', 'similar_arxiv_id'])
@Index('idx_paper_similarities_arxiv', ['arxiv_id'])
@Index('idx_paper_similarities_similar', ['similar_arxiv_id'])
export class PaperSimilarity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 30 })
  arxiv_id: string;

  @Column({ length: 30 })
  similar_arxiv_id: string;

  @Column({ type: 'float' })
  similarity: number;

  @Column({ length: 20 })
  type: 'exact' | 'near' | 'similar' | 'related';

  @CreateDateColumn()
  created_at: Date;
}
