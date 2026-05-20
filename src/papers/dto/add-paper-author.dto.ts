import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsBoolean, IsOptional, Min } from 'class-validator';

export class AddPaperAuthorDto {
  @ApiProperty({ example: 1, description: 'Author ID' })
  @IsInt()
  @IsNotEmpty()
  author_id: number;

  @ApiProperty({ example: 1, description: 'Author order' })
  @IsInt()
  @Min(1)
  author_order: number;

  @ApiPropertyOptional({ example: false, description: 'Is corresponding author?' })
  @IsOptional()
  @IsBoolean()
  is_corresponding?: boolean;
}
