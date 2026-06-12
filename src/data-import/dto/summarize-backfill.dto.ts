import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const DEFAULT_PAPERS_PER_TOPIC = 300;

export class SummarizeBackfillDto {
  @ApiPropertyOptional({
    description:
      'arXiv topic codes to process (e.g. cs.AI, cs.LG). If omitted, uses all topic codes found in Elasticsearch.',
    example: ['cs.AI', 'cs.LG', 'cs.CV'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
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
    description: 'How many newest papers to summarize per topic',
    example: DEFAULT_PAPERS_PER_TOPIC,
    default: DEFAULT_PAPERS_PER_TOPIC,
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  @Max(1000)
  papersPerTopic?: number;

  @ApiPropertyOptional({
    description: 'Parallel Ollama requests',
    example: 12,
    default: 8,
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  @Max(32)
  concurrency?: number;

  @ApiPropertyOptional({
    description: 'Re-summarize papers that already have description',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  force?: boolean;
}
