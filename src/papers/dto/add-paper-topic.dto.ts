import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class AddPaperTopicDto {
  @ApiProperty({ example: 1, description: 'Topic ID' })
  @IsInt()
  @IsNotEmpty()
  topic_id: number;

  @ApiProperty({ example: false, description: 'Is this the primary topic?' })
  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}
