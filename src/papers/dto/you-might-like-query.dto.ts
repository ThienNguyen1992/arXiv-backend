import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class YouMightLikeQueryDto {
  @ApiPropertyOptional({
    example: 10,
    default: 10,
    description: 'Total recommended papers on detail page',
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  @Max(20)
  size = 10;

  @ApiPropertyOptional({
    example: 8,
    default: 8,
    description: 'Papers from top-ranked topics of the current paper',
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(0)
  @Max(15)
  paperTopicSize = 8;

  @ApiPropertyOptional({
    example: 2,
    default: 2,
    description: 'Papers from user preferred topics',
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(0)
  @Max(10)
  userTopicSize = 2;

  @ApiPropertyOptional({
    example: 3,
    default: 3,
    description: 'How many paper topics to keep after ranking',
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  @Max(10)
  topPaperTopics = 3;

  @ApiPropertyOptional({
    example: '2605.30019',
    description: 'Exclude the paper currently open on detail page',
  })
  @IsOptional()
  @IsString()
  excludeArxivId?: string;

  @ApiProperty({
    description: 'Topics of the paper being viewed. Comma-separated string or array.',
    example: 'cs.AI,cs.AR',
    type: String,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return [];
    if (typeof value === 'string') {
      return value.split(',').map((item: string) => item.trim()).filter(Boolean);
    }
    if (Array.isArray(value)) {
      return value.flatMap((item: string) => item.split(',').map((part) => part.trim())).filter(Boolean);
    }
    return [];
  })
  paperTopics: string[];

  @ApiPropertyOptional({
    description: 'User preferred topics override. If omitted, uses topics from JWT user profile.',
    example: ['cs.AI', 'stat.ML'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (typeof value === 'string') {
      return value.split(',').map((item: string) => item.trim()).filter(Boolean);
    }
    if (Array.isArray(value)) {
      return value.flatMap((item: string) => item.split(',').map((part) => part.trim())).filter(Boolean);
    }
    return undefined;
  })
  userTopics?: string[];
}
