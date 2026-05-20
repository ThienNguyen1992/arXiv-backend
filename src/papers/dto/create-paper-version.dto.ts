import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsInt, Min } from 'class-validator';

export class CreatePaperVersionDto {
  @ApiProperty({ example: 2, description: 'Version number' })
  @IsInt()
  @Min(1)
  version_number: number;

  @ApiProperty({ example: 'Updated Title', description: 'Title at this version' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title: string;

  @ApiProperty({ example: 'Updated abstract...', description: 'Abstract at this version' })
  @IsString()
  @IsNotEmpty()
  abstract: string;

  @ApiProperty({ example: 'https://arxiv.org/pdf/2305.12345v2.pdf', description: 'PDF URL for this version' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  pdf_url: string;

  @ApiPropertyOptional({ example: 'https://arxiv.org/e-print/2305.12345v2', description: 'Source package URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  source_pack_url?: string;

  @ApiPropertyOptional({ example: 1048576, description: 'File size in bytes' })
  @IsOptional()
  @IsInt()
  size_bytes?: number;

  @ApiPropertyOptional({ example: 'Updated results section', description: 'Change log' })
  @IsOptional()
  @IsString()
  change_log?: string;
}
