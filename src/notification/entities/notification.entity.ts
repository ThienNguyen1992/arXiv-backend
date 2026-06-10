import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column('text')
  message: string;

  // Dữ liệu hiển thị trên UI: paper info, matched topics, v.v.
  @Column('jsonb', { nullable: true })
  data: any;

  @Column({ default: false })
  isRead: boolean;

  @Column({ nullable: true, type: 'varchar' })
  userId: string | null; // null = broadcast to all

  @Column()
  type: string; // 'daily_report' | 'topic_match' | 'test'

  // Topic liên quan để FE filter/hiển thị
  @Column({ nullable: true, type: 'int' })
  topicId: number | null;

  @Column({ nullable: true, type: 'varchar' })
  topicCode: string | null; // e.g. 'cs.AI'

  // Nội dung tóm tắt ngắn để hiện trực tiếp trên notification UI
  @Column({ nullable: true, type: 'text' })
  content: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
