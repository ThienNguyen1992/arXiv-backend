import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength, IsInt, IsBoolean } from 'class-validator';

export class CreateTopicDto {
  @ApiProperty({ example: 1, description: 'Category ID this topic belongs to' })
  @IsInt()
  @IsNotEmpty()
  category_id: number;

  @ApiProperty({ example: 'cs.LG', description: 'Topic code (unique)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;

  @ApiProperty({ example: 'Machine Learning', description: 'Name of the topic' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: 'All about Machine Learning', description: 'Description of the topic' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: true, description: 'Whether the topic is active' })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
