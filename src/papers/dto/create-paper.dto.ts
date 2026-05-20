import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsInt, IsDateString, IsObject, Min } from 'class-validator';

export class CreatePaperDto {
  @ApiProperty({ example: '2305.12345', description: 'ArXiv ID' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  arxiv_id: string;

  @ApiProperty({ example: 'Learning Transferable Visual Models', description: 'Title' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title: string;

  @ApiProperty({ example: 'State-of-the-art computer vision...', description: 'Abstract' })
  @IsString()
  @IsNotEmpty()
  abstract: string;

  @ApiProperty({ example: 'https://arxiv.org/pdf/2305.12345.pdf', description: 'PDF URL' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  pdf_url: string;

  @ApiPropertyOptional({ example: 'https://arxiv.org/e-print/2305.12345', description: 'Source package URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  source_pack_url?: string;

  @ApiPropertyOptional({ example: 'CC BY 4.0', description: 'License type' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  license?: string;

  @ApiPropertyOptional({ example: 'Nature 2023', description: 'Journal reference' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  journal_ref?: string;

  @ApiPropertyOptional({ example: '10.1038/s41586-023-00001-1', description: 'DOI' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  doi?: string;

  @ApiPropertyOptional({ example: '12 pages, 4 figures', description: 'Author comments' })
  @IsOptional()
  @IsString()
  comments?: string;

  @ApiPropertyOptional({ example: 1, description: 'Current version number' })
  @IsOptional()
  @IsInt()
  @Min(1)
  current_version?: number;

  @ApiPropertyOptional({ example: 'pending', description: 'Status: pending, published, withdrawn' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @ApiPropertyOptional({ description: 'Flexible metadata (JSON)' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiProperty({ example: '2023-06-15T00:00:00.000Z', description: 'First publication date' })
  @IsDateString()
  @IsNotEmpty()
  published_at: string;
}
