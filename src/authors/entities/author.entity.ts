import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Entity('authors')
export class Author {
  @ApiProperty({ example: 1, description: 'Author ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 'John Doe', description: 'Full name of the author' })
  @Column({ length: 150 })
  full_name: string;

  @ApiPropertyOptional({ example: 'john@example.com', description: 'Email address' })
  @Column({ length: 150, nullable: true })
  email: string;

  @ApiPropertyOptional({ example: 'Dai hoc Bach Khoa', description: 'University or research institute' })
  @Column({ length: 255, nullable: true })
  affiliation: string;

  @ApiPropertyOptional({ example: '0000-0001-2345-6789', description: 'ORCID identifier' })
  @Column({ length: 30, unique: true, nullable: true })
  orcid: string;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Creation timestamp' })
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Last update timestamp' })
  @UpdateDateColumn()
  updated_at: Date;
}
