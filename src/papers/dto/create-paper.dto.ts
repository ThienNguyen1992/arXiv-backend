import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray, IsDateString, IsUrl } from 'class-validator';

export class CreatePaperDto {
  @ApiProperty({ example: '2103.00020', description: 'ArXiv ID' })
  @IsString()
  @IsNotEmpty()
  arxiv_id: string;

  @ApiProperty({ example: 'Learning Transferable Visual Models From Natural Language Supervision', description: 'Title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'State-of-the-art computer vision systems...', description: 'Abstract' })
  @IsString()
  @IsNotEmpty()
  abstract: string;

  @ApiPropertyOptional({ example: 'CLIP is a model...', description: 'Short Summary' })
  @IsString()
  @IsOptional()
  short_summary?: string;

  @ApiProperty({ example: ['Alec Radford', 'Jong Wook Kim'], description: 'Authors' })
  @IsArray()
  @IsString({ each: true })
  authors: string[];

  @ApiProperty({ example: '2021-02-26', description: 'Published Date' })
  @IsDateString()
  published_date: string;

  @ApiProperty({ example: 'https://arxiv.org/pdf/2103.00020.pdf', description: 'PDF URL' })
  @IsUrl()
  pdf_url: string;
}
