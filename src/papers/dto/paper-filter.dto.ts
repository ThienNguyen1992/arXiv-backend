import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString } from 'class-validator';
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
    // Handle single string with commas: "cs.AI,cs.LG"
    if (typeof value === 'string') {
      return value.split(',').map((v: string) => v.trim()).filter(Boolean);
    }
    // Handle array: ["cs.AI", "cs.LG"]
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
}
