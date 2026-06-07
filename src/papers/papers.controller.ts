import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request } from '@nestjs/common';
import { PapersService } from './papers.service';
import { CreatePaperDto } from './dto/create-paper.dto';
import { UpdatePaperDto } from './dto/update-paper.dto';
import { CreatePaperVersionDto } from './dto/create-paper-version.dto';
import { AddPaperTopicDto } from './dto/add-paper-topic.dto';
import { ArxivPapersQueryDto } from './dto/arxiv-papers-query.dto';
import { ArxivTimeQueryDto } from './dto/arxiv-time-query.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { PaperFilterDto } from './dto/paper-filter.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('papers')
@Controller('papers')
export class PapersController {
  constructor(private readonly papersService: PapersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new paper' })
  @ApiResponse({ status: 201, description: 'Paper created successfully.' })
  create(@Body() createPaperDto: CreatePaperDto) {
    return this.papersService.create(createPaperDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get papers from DB. Supports pagination, topic filter, and text search.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'size', required: false, example: 20 })
  @ApiQuery({ name: 'topics', required: false, isArray: true, example: ['cs.AI', 'cs.LG'], description: 'Filter by topic codes' })
  @ApiQuery({ name: 'q', required: false, example: 'deep learning', description: 'Search in both title and author' })
  @ApiQuery({ name: 'title', required: false, example: 'neural networks', description: 'Search only in title' })
  @ApiQuery({ name: 'author', required: false, example: 'Andrew Ng', description: 'Search only in author' })
  findAll(@Query() query: PaperFilterDto) {
    return this.papersService.findAll(query);
  }

  @Get('es/search')
  @ApiOperation({ summary: 'Get papers from Elasticsearch. Supports pagination, topic filter, and text search.' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'size', required: false, example: 20 })
  @ApiQuery({ name: 'topics', required: false, isArray: true, example: ['cs.AI', 'cs.LG'], description: 'Filter by topic codes' })
  @ApiQuery({ name: 'q', required: false, example: 'deep learning', description: 'Search in both title and author' })
  @ApiQuery({ name: 'title', required: false, example: 'neural networks', description: 'Search only in title' })
  @ApiQuery({ name: 'author', required: false, example: 'Andrew Ng', description: 'Search only in author' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['date', 'score'], description: 'Sort by date or score (default is date)' })
  searchElasticsearch(@Query() query: PaperFilterDto) {
    return this.papersService.searchElasticsearch(query);
  }

  @Get('arxiv/search')
  @ApiOperation({ summary: 'Fetch papers from arXiv by topic codes without saving to database' })
  @ApiQuery({ name: 'topics', required: true, example: 'cs.AI,cs.CV,cs.LG' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'size', required: false, example: 20 })
  searchArxivByTopics(@Query() query: ArxivPapersQueryDto) {
    return this.papersService.fetchArxivPapersByTopicsQuery(query);
  }

  @Get('arxiv/time-range')
  @ApiOperation({ summary: 'Fetch papers from arXiv within a specific time range' })
  @ApiQuery({ name: 'startDate', required: true, example: '2024-01-01', description: 'Start date in YYYY-MM-DD format' })
  @ApiQuery({ name: 'endDate', required: true, example: '2024-12-31', description: 'End date in YYYY-MM-DD format' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'size', required: false, example: 20 })
  searchArxivByTimeRange(@Query() query: ArxivTimeQueryDto) {
    return this.papersService.fetchArxivPapersByTimeRange(query);
  }

  @Get('arxiv/feed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fetch personalized arXiv feed using current user topics' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'size', required: false, example: 20 })
  getMyArxivFeed(@Request() req, @Query() query: PaginationQueryDto) {
    return this.papersService.fetchArxivFeedForUser(req.user.id, query);
  }

  @Post('calculate-scores')
  @ApiOperation({ summary: 'Calculate and update scores for all papers in the database' })
  @ApiResponse({ status: 200, description: 'Scores updated.' })
  calculateScoresForAll() {
    return this.papersService.calculateScoresForAllPapers();
  }

  @Post(':id/calculate-score')
  @ApiOperation({ summary: 'Calculate and update score for a specific paper' })
  @ApiResponse({ status: 200, description: 'Score calculated and updated.' })
  calculateScoreForOne(@Param('id') id: string) {
    return this.papersService.calculateScoreForPaper(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a paper by ID' })
  findOne(@Param('id') id: string) {
    return this.papersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a paper' })
  update(@Param('id') id: string, @Body() updatePaperDto: UpdatePaperDto) {
    return this.papersService.update(id, updatePaperDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a paper' })
  remove(@Param('id') id: string) {
    return this.papersService.remove(id);
  }

  // --- Versions ---
  @Post(':id/versions')
  @ApiOperation({ summary: 'Add a version to a paper' })
  @ApiResponse({ status: 201, description: 'Version added.' })
  addVersion(@Param('id') id: string, @Body() dto: CreatePaperVersionDto) {
    return this.papersService.addVersion(id, dto);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Get all versions of a paper' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'size', required: false, example: 20 })
  getVersions(@Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.papersService.getVersions(id, query);
  }

  // --- Topics ---
  @Post(':id/topics')
  @ApiOperation({ summary: 'Add a topic to a paper' })
  @ApiResponse({ status: 201, description: 'Topic linked.' })
  addTopic(@Param('id') id: string, @Body() dto: AddPaperTopicDto) {
    return this.papersService.addTopic(id, dto);
  }

  @Delete(':id/topics/:topicId')
  @ApiOperation({ summary: 'Remove a topic from a paper' })
  removeTopic(@Param('id') id: string, @Param('topicId') topicId: string) {
    return this.papersService.removeTopic(id, +topicId);
  }
}
