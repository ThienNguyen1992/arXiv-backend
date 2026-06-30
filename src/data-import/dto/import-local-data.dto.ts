import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ImportLocalDataDto {
  @ApiProperty({
    description: 'Absolute local path to a JSONL file (one arXiv paper object per line)',
    example: 'C:/downloads/arxiv-metadata.json',
  })
  @IsString()
  @IsNotEmpty()
  path: string;
}
