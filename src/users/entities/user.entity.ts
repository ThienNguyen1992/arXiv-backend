import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToMany, JoinTable } from 'typeorm';
import { Topic } from '../../topics/entities/topic.entity';
import { Paper } from '../../papers/entities/paper.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Entity('users')
export class User {
  @ApiProperty({ example: 'uuid', description: 'User ID' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'user@example.com', description: 'User email' })
  @Column({ unique: true })
  email: string;

  @ApiProperty({ example: 'password123', description: 'User password (hashed)' })
  @Column()
  password: string;

  @ApiPropertyOptional({ example: 'John Doe', description: 'User full name' })
  @Column({ nullable: true })
  full_name: string;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Creation timestamp' })
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Last update timestamp' })
  @UpdateDateColumn()
  updated_at: Date;

  @ApiPropertyOptional({ description: 'Token used for resetting password' })
  @Column({ type: 'varchar', nullable: true })
  reset_password_token: string | null;

  @ApiPropertyOptional({ description: 'Expiration date of the reset password token' })
  @Column({ type: 'timestamp', nullable: true })
  reset_password_expires: Date | null;

  @ApiPropertyOptional({ description: 'Hashed refresh token for session management' })
  @Column({ type: 'varchar', nullable: true })
  hashed_refresh_token: string | null;

  @ManyToMany(() => Topic)
  @JoinTable({
    name: 'users_topics',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'topic_id', referencedColumnName: 'id' },
  })
  topics: Topic[];

  @ManyToMany(() => Paper)
  @JoinTable({
    name: 'users_favorite_papers',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'article_id', referencedColumnName: 'id' },
  })
  favorite_papers: Paper[];
}
