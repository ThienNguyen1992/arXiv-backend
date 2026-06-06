import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetUserTopicsDto {
  @ApiProperty({ example: ['cs.AI', 'cs.LG', 'stat.ML'], description: 'Topic codes selected by this user' })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  topic_codes: string[];
}
