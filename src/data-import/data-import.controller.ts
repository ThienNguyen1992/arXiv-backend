import { Controller, Post, Body, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { DataImportService } from './data-import.service';
import { ImportLocalDataDto } from './dto/import-local-data.dto';
import { SummarizeBackfillDto } from './dto/summarize-backfill.dto';

@ApiTags('data-import')
@Controller('data-import')
export class DataImportController {
  constructor(private readonly dataImportService: DataImportService) {}

  @Post('elasticsearch/local')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Import papers from a local JSONL file into Elasticsearch (runs in background)',
    description:
      'Each line must be one JSON object (arXiv metadata format). Documents are indexed by arxiv_id; ' +
      're-importing the same id overwrites the existing document.',
  })
  @ApiBody({ type: ImportLocalDataDto })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'File validated. Elasticsearch import started in background.',
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid path or file does not exist.' })
  importElasticsearchLocalData(@Body() dto: ImportLocalDataDto) {
    return this.dataImportService.importElasticsearchLocalData(dto.path);
  }

  @Post('elasticsearch/summarize-backfill')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Generate description/key_points from abstract for existing Elasticsearch papers (Ollama)',
    description:
      'Runs in background per arXiv topic. Skips papers that already have description unless force=true. ' +
      'Server logs print arxiv_id for each paper while summarization is in progress.',
  })
  @ApiBody({ type: SummarizeBackfillDto })
  summarizeElasticsearchBackfill(@Body() dto: SummarizeBackfillDto) {
    return this.dataImportService.summarizeElasticsearchBackfill(dto);
  }

  @Post('elasticsearch/summarize/:arxivId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Summarize one Elasticsearch paper by arXiv ID (Ollama)',
    description:
      'Generates description/key_points for one paper. Server logs include arxiv_id while processing.',
  })
  summarizeElasticsearchPaper(@Param('arxivId') arxivId: string) {
    return this.dataImportService.summarizeElasticsearchPaper(arxivId);
  }
}
