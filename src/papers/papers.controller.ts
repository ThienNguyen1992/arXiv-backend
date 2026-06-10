import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request, Req } from '@nestjs/common';
import { PapersService } from './papers.service';
import { CreatePaperDto } from './dto/create-paper.dto';
import { UpdatePaperDto } from './dto/update-paper.dto';
import { CreatePaperVersionDto } from './dto/create-paper-version.dto';
import { AddPaperTopicDto } from './dto/add-paper-topic.dto';
import { ArxivPapersQueryDto } from './dto/arxiv-papers-query.dto';
import { ArxivTimeQueryDto } from './dto/arxiv-time-query.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { PaperFilterDto } from './dto/paper-filter.dto';
import { YouMightLikeQueryDto } from './dto/you-might-like-query.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

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
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get papers from Elasticsearch. Supports pagination, topic filter, and text search.',
    description:
      'With Bearer token and no topics query: uses the current user topics automatically. Multiple topics are interleaved (round-robin); single-topic feeds use daily randomized order. Explicit topics query overrides user topics.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'size', required: false, example: 20 })
  @ApiQuery({ name: 'topics', required: false, isArray: true, example: ['cs.AI', 'cs.LG'], description: 'Filter by topic codes. Overrides user topics when provided.' })
  @ApiQuery({ name: 'q', required: false, example: 'deep learning', description: 'Search in both title and author' })
  @ApiQuery({ name: 'title', required: false, example: 'neural networks', description: 'Search only in title' })
  @ApiQuery({ name: 'author', required: false, example: 'Andrew Ng', description: 'Search only in author' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['date', 'score'], description: 'Sort by date or score (default is date)' })
  searchElasticsearch(@Query() query: PaperFilterDto, @Req() req: { user?: { id: string } }) {
    return this.papersService.searchElasticsearch(query, req.user?.id);
  }

  @Get('you-might-like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'You might like — detail page recommendations',
    description:
      'Pass paperTopics from the opened paper (e.g. cs.AI,cs.AR). Finds peer users with overlapping interests, picks top 3 topics by frequency, returns 8 + 2 papers shuffled.',
  })
  @ApiQuery({ name: 'paperTopics', required: true, example: 'cs.AI,cs.AR' })
  @ApiQuery({ name: 'excludeArxivId', required: false, example: '2605.30019' })
  @ApiQuery({ name: 'size', required: false, example: 10 })
  @ApiQuery({ name: 'paperTopicSize', required: false, example: 8 })
  @ApiQuery({ name: 'userTopicSize', required: false, example: 2 })
  getYouMightLike(@Request() req, @Query() query: YouMightLikeQueryDto) {
    return this.papersService.getYouMightLike(req.user.id, query);
  }

  @Get('es/:arxivId/similar')
  @ApiOperation({
    summary: 'Get similar / duplicate papers for a paper detail page',
    description: 'Separate from detail API so the detail page can load fast and fetch similar papers in parallel.',
  })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  getSimilarPapers(@Param('arxivId') arxivId: string, @Query('limit') limit?: string) {
    return this.papersService.getSimilarPapers(arxivId, limit ? Number(limit) : 10);
  }

  @Get('es/:arxivId')
  @ApiOperation({
    summary: 'Get a paper from Elasticsearch by arXiv ID',
    description:
      'Looks up Elasticsearch first, then falls back to live arXiv. Returns similarCount only; use /papers/es/:arxivId/similar for the full similar-papers list.',
  })
  @ApiResponse({ status: 200, description: 'Paper found.' })
  @ApiResponse({ status: 404, description: 'Paper not found.' })
  findOneFromElasticsearch(@Param('arxivId') arxivId: string) {
    return this.papersService.findOneFromElasticsearch(arxivId);
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

  @Get('es/:arxivId/related')
  @ApiOperation({ summary: 'Gợi ý paper liên quan (Thuật toán 4: Cosine/TF-IDF)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 5 })
  findRelated(@Param('arxivId') arxivId: string, @Query('limit') limit?: number) {
    return this.papersService.findRelatedPapers(arxivId, limit ? Number(limit) : 5);
  }

  @Get('es/duplicates/list')
  @ApiOperation({ summary: 'Lấy danh sách các bài báo bị đánh dấu là duplicate. Tùy chọn lọc theo parentId' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'size', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'parentId', required: false, type: String, description: 'Lọc các bài duplicate của 1 arxiv_id cụ thể' })
  getDuplicates(
    @Query('page') page?: number,
    @Query('size') size?: number,
    @Query('parentId') parentId?: string
  ) {
    return this.papersService.getDuplicates(page || 1, size || 20, parentId);
  }

  @Post('es/check-duplicate')
  @ApiOperation({ summary: 'Phát hiện near-duplicate (Thuật toán 4: Cosine/TF-IDF với threshold > 85%)' })
  @ApiBody({ schema: { example: { title: 'Deep learning in medical imaging', abstract: 'We propose a CNN...' } } })
  checkFuzzyDuplicate(@Body() body: { title: string, abstract: string }) {
    return this.papersService.checkFuzzyDuplicate(body.title, body.abstract);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a paper by arXiv ID or database UUID',
    description:
      'Prefer arxiv_id from search/feed (e.g. 2605.30352). Version suffix is accepted (2605.30352v1). Falls back to Elasticsearch, then live arXiv.',
  })
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
