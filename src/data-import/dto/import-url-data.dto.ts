import { ApiProperty } from '@nestjs/swagger';
import { IsUrl, IsNotEmpty } from 'class-validator';

export class ImportUrlDataDto {
  @ApiProperty({
    description: 'The URL to the Kaggle arXiv JSONL file',
    example: 'https://example.com/arxiv-metadata-oai-snapshot.json'
  })
  @IsUrl()
  @IsNotEmpty()
  url: string;
}
