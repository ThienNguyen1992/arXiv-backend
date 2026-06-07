import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { DataImportService } from './data-import.service';
import { ImportLocalDataDto } from './dto/import-local-data.dto';
import { ImportUrlDataDto } from './dto/import-url-data.dto';

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
}
