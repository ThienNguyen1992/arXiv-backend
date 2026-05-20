import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { TopicsService } from './topics.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Topic } from './entities/topic.entity';

@ApiTags('topics')
@Controller('topics')
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new topic' })
  @ApiResponse({ status: 201, description: 'The topic has been successfully created.', type: Topic })
  create(@Body() createTopicDto: CreateTopicDto) {
    return this.topicsService.create(createTopicDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all topics' })
  @ApiResponse({ status: 200, description: 'Return all topics.', type: [Topic] })
  findAll() {
    return this.topicsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a topic by id' })
  @ApiParam({ name: 'id', description: 'Topic ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Return the topic.', type: Topic })
  findOne(@Param('id') id: string) {
    return this.topicsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a topic' })
  @ApiParam({ name: 'id', description: 'Topic ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'The topic has been successfully updated.', type: Topic })
  update(@Param('id') id: string, @Body() updateTopicDto: UpdateTopicDto) {
    return this.topicsService.update(id, updateTopicDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a topic' })
  @ApiParam({ name: 'id', description: 'Topic ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'The topic has been successfully deleted.' })
  remove(@Param('id') id: string) {
    return this.topicsService.remove(id);
  }
}
