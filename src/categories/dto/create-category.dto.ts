import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'cs', description: 'Category code (unique)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  code: string;

  @ApiProperty({ example: 'Computer Science', description: 'Title of the category' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;
}
