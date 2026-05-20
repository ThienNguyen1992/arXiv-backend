import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToMany, JoinTable } from 'typeorm';
import { Topic } from '../../topics/entities/topic.entity';

@Entity('papers')
export class Paper {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  arxiv_id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  abstract: string;

  @Column({ type: 'text', nullable: true })
  short_summary: string;

  @Column({ type: 'json' })
  authors: string[];

  @Column({ type: 'date' })
  published_date: Date;

  @Column()
  pdf_url: string;

  @CreateDateColumn()
  created_at: Date;

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
