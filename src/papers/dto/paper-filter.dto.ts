import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsIn } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class PaperFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by topic codes. Can be comma-separated string (cs.AI,cs.LG) or array (?topics[]=cs.AI&topics[]=cs.LG)',
    example: ['cs.AI', 'cs.LG'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (typeof value === 'string') {
      return value.split(',').map((v: string) => v.trim()).filter(Boolean);
    }
    if (Array.isArray(value)) {
      return value.flatMap((v: string) => v.split(',').map((s: string) => s.trim())).filter(Boolean);
    }
    return undefined;
  })
  topics?: string[];

  @ApiPropertyOptional({
    description: 'Search in both title and author',
    example: 'deep learning',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Search only in title',
    example: 'neural networks',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Search only in author',
    example: 'Andrew Ng',
  })
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    example: 'published_at',
    enum: ['published_at', 'created_at', 'updated_at', 'score'],
    default: 'published_at',
  })
  @IsOptional()
  @IsString()
  @IsIn(['published_at', 'created_at', 'updated_at', 'score'])
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort order',
    example: 'desc',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({
    description: 'Filter papers published after this date (ISO 8601, e.g. 2024-01-01)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Filter papers published before this date (ISO 8601, e.g. 2024-12-31)',
    example: '2024-12-31',
  })
  @IsOptional()
  @IsString()
  toDate?: string;
}
