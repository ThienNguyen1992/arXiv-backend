import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { PapersService } from './papers.service';
import { CreatePaperDto } from './dto/create-paper.dto';
import { UpdatePaperDto } from './dto/update-paper.dto';
import { CreatePaperVersionDto } from './dto/create-paper-version.dto';
import { AddPaperTopicDto } from './dto/add-paper-topic.dto';
import { AddPaperAuthorDto } from './dto/add-paper-author.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

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
  @ApiOperation({ summary: 'Get all papers' })
  findAll() {
    return this.papersService.findAll();
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
  getVersions(@Param('id') id: string) {
    return this.papersService.getVersions(id);
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

  // --- Authors ---
  @Post(':id/authors')
  @ApiOperation({ summary: 'Add an author to a paper' })
  @ApiResponse({ status: 201, description: 'Author linked.' })
  addAuthor(@Param('id') id: string, @Body() dto: AddPaperAuthorDto) {
    return this.papersService.addAuthor(id, dto);
  }

  @Delete(':id/authors/:authorId')
  @ApiOperation({ summary: 'Remove an author from a paper' })
  removeAuthor(@Param('id') id: string, @Param('authorId') authorId: string) {
    return this.papersService.removeAuthor(id, +authorId);
  }
}
