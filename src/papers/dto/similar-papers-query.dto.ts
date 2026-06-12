import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class SimilarPapersQueryDto {
  @ApiPropertyOptional({
    example: 10,
    default: 10,
    minimum: 1,
    maximum: 50,
    description: 'Max items to return. No pagination (no page/size).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
}
