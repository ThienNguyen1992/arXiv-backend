import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ArxivPapersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'cs.AI,cs.CV,cs.LG',
    description: 'Comma-separated arXiv topic codes',
  })
  @IsOptional()
  @IsString()
  topics?: string;
}
