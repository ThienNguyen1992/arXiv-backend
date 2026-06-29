import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncArxivTaxonomyResponseDto {
  @ApiProperty({
    example: 'https://arxiv.org/category_taxonomy',
    description: 'Data source used for the sync (live arXiv URL or bundled seed fallback)',
  })
  source: string;

  @ApiProperty({ example: 20, description: 'Number of categories processed' })
  categoriesImported: number;

  @ApiProperty({ example: 156, description: 'Number of topics upserted' })
  topicsImported: number;

  @ApiPropertyOptional({
    example: 'Could not fetch live arXiv taxonomy: network timeout',
    description: 'Present when live fetch failed and bundled seed was used',
  })
  warning?: string;
}
