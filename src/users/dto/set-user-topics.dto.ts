import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsString } from 'class-validator';
import { resolveArxivTopicCode } from '../../common/utils/arxiv-taxonomy.util';

export class SetUserTopicsDto {
  @ApiProperty({ example: ['cs.AI', 'cs.LG', 'stat.ML'], description: 'Topic codes selected by this user' })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!Array.isArray(value)) {
      return value;
    }

    return [
      ...new Set(
        value
          .flatMap((item: string) => String(item).split(','))
          .map((code: string) => code.trim())
          .filter(Boolean)
          .map((code: string) => resolveArxivTopicCode(code).code),
      ),
    ];
  })
  topic_codes: string[];
}
