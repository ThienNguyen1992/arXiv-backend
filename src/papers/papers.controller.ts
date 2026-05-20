import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { PapersService } from './papers.service';
import { CreatePaperDto } from './dto/create-paper.dto';
import { UpdatePaperDto } from './dto/update-paper.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Paper } from './entities/paper.entity';

@ApiTags('papers')
@Controller('papers')
export class PapersController {
  constructor(private readonly papersService: PapersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new paper' })
  @ApiResponse({ status: 201, description: 'The paper has been successfully created.', type: Paper })
  create(@Body() createPaperDto: CreatePaperDto) {
    return this.papersService.create(createPaperDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all papers' })
  @ApiResponse({ status: 200, description: 'Return all papers.', type: [Paper] })
  findAll() {
    return this.papersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a paper by id' })
  @ApiParam({ name: 'id', description: 'Paper ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Return the paper.', type: Paper })
  findOne(@Param('id') id: string) {
    return this.papersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a paper' })
  @ApiParam({ name: 'id', description: 'Paper ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'The paper has been successfully updated.', type: Paper })
  update(@Param('id') id: string, @Body() updatePaperDto: UpdatePaperDto) {
    return this.papersService.update(id, updatePaperDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a paper' })
  @ApiParam({ name: 'id', description: 'Paper ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'The paper has been successfully deleted.' })
  remove(@Param('id') id: string) {
    return this.papersService.remove(id);
  }
}
