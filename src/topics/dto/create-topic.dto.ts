import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateTopicDto {
  @ApiProperty({ example: 'Machine Learning', description: 'The name of the topic' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'All about ML', description: 'Description of the topic' })
  @IsString()
  @IsOptional()
  description?: string;
}
