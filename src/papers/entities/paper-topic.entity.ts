import { Entity, Column, ManyToOne, JoinColumn, PrimaryColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Paper } from './paper.entity';
import { Topic } from '../../topics/entities/topic.entity';

@Entity('article_topics')
@Index('idx_article_topics_topic', ['topic_id'])
@Index('idx_unique_primary_topic', ['article_id'], {
  unique: true,
  where: '"is_primary" = true',
})
export class PaperTopic {
  @ApiProperty({ description: 'Paper ID' })
  @PrimaryColumn('uuid')
  article_id: string;

  @ApiProperty({ description: 'Topic ID' })
  @PrimaryColumn()
  topic_id: number;

  @ApiProperty({ example: false, description: 'Whether this is the primary topic' })
  @Column({ default: false })
  is_primary: boolean;

  @ManyToOne(() => Paper, (paper) => paper.paperTopics, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'article_id' })
  paper: Paper;

  @ManyToOne(() => Topic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'topic_id' })
  topic: Topic;
}
