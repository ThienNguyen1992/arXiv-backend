import { Controller, Post, Body, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { DataImportService } from './data-import.service';
import { ImportLocalDataDto } from './dto/import-local-data.dto';
import { ImportUrlDataDto } from './dto/import-url-data.dto';
import { SummarizeBackfillDto } from './dto/summarize-backfill.dto';

@ApiTags('data-import')
@Controller('data-import')
export class DataImportController {
  constructor(private readonly dataImportService: DataImportService) {}

  @Post('local')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Import data from a local JSON file (runs in background)' })
  @ApiBody({ type: ImportLocalDataDto })
  @ApiResponse({ status: HttpStatus.ACCEPTED, description: 'File validated successfully. Import started in background.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid path or file does not exist.' })
  async importLocalData(@Body() importLocalDataDto: ImportLocalDataDto) {
    return await this.dataImportService.importLocalData(importLocalDataDto.path);
  }

  @Post('url')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Import data from a remote URL (runs in background)' })
  @ApiBody({ type: ImportUrlDataDto })
  @ApiResponse({ status: HttpStatus.ACCEPTED, description: 'URL received successfully. Import started in background.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid URL format.' })
  async importUrlData(@Body() importUrlDataDto: ImportUrlDataDto) {
    return await this.dataImportService.importUrlData(importUrlDataDto.url);
  }
  @Post('elasticsearch/local')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Import data from a local JSON file specifically to Elasticsearch (runs in background)' })
  @ApiBody({ type: ImportLocalDataDto })
  @ApiResponse({ status: HttpStatus.ACCEPTED, description: 'File validated successfully. Elasticsearch import started in background.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid path or file does not exist.' })
  async importElasticsearchLocalData(@Body() importLocalDataDto: ImportLocalDataDto) {
    return await this.dataImportService.importElasticsearchLocalData(importLocalDataDto.path);
  }

  @Post('sync-topics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sync categories/topics from bundled arXiv taxonomy and Elasticsearch paper categories',
    description:
      'Use this after Elasticsearch-only import so UI can map tags like hep-th to database topics.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Topics synced successfully.' })
  async syncTopics() {
    return await this.dataImportService.syncTopicsFromElasticsearch();
  }

  @Post('elasticsearch/summarize-backfill')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Generate description/key_points from abstract for existing Elasticsearch papers (Ollama)',
    description:
      'Runs in background per arXiv topic: fetches up to papersPerTopic newest papers per topic (default 300), then summarizes via Ollama. Skips papers that already have description unless force=true. Omit topics to use all topic codes found in Elasticsearch.',
  })
  @ApiBody({ type: SummarizeBackfillDto })
  async summarizeElasticsearchBackfill(@Body() dto: SummarizeBackfillDto) {
    return this.dataImportService.summarizeElasticsearchBackfill(dto);
  }

  @Post('elasticsearch/summarize/:arxivId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Summarize one Elasticsearch paper by arXiv ID (Ollama)',
  })
  async summarizeElasticsearchPaper(@Param('arxivId') arxivId: string) {
    return this.dataImportService.summarizeElasticsearchPaper(arxivId);
  }
}
