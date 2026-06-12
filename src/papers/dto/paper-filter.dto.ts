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
    description: 'Search in abstract only (alias: use abstract param)',
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
    description: 'Search only in abstract',
    example: 'transformer architecture',
  })
  @IsOptional()
  @IsString()
  abstract?: string;

  @ApiPropertyOptional({
    description: 'Sort by field (date or score). Default is date.',
    enum: ['date', 'score'],
    example: 'score',
  })
  @IsOptional()
  @IsString()
  sortBy?: 'date' | 'score';
}
