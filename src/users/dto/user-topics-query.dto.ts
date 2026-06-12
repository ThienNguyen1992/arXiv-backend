import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class UserTopicsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 500,
    default: 500,
    minimum: 1,
    maximum: 2000,
    description: 'Page size for user topics (default 500, not 20)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  size = 500;

  @ApiPropertyOptional({
    description: 'Return all selected topics and ignore pagination',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  all?: boolean;
}
