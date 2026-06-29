import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToMany, JoinTable } from 'typeorm';
import { Topic } from '../../topics/entities/topic.entity';
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

  @ApiProperty({ example: true, description: 'Indicates if this is the user\'s first login' })
  @Column({ default: true })
  isFirstLogged: boolean;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Creation timestamp' })
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Last update timestamp' })
  @UpdateDateColumn()
  updated_at: Date;

  @ManyToMany(() => Topic)
  @JoinTable({
    name: 'users_topics',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'topic_id', referencedColumnName: 'id' },
  })
  topics: Topic[];
}
