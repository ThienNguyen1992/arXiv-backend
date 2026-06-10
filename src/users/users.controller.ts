import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetUserTopicsDto } from './dto/set-user-topics.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { User } from './entities/user.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { YouMightLikeQueryDto } from '../papers/dto/you-might-like-query.dto';
import { PapersService } from '../papers/papers.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly papersService: PapersService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'The user has been successfully created.', type: User })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'Return all users.', type: [User] })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'size', required: false, example: 20 })
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get('me/topics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get topics selected by the current user' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'size', required: false, example: 20 })
  getMyTopics(@Request() req, @Query() query: PaginationQueryDto) {
    return this.usersService.getTopics(req.user.id, query);
  }

  @Patch('me/topics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Replace topics selected by the current user' })
  setMyTopics(@Request() req, @Body() dto: SetUserTopicsDto) {
    return this.usersService.setTopics(req.user.id, dto.topic_codes);
  }

  @Post('me/topics/:topicId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add one topic to the current user' })
  addMyTopic(@Request() req, @Param('topicId') topicId: string) {
    return this.usersService.addTopic(req.user.id, +topicId);
  }

  @Delete('me/topics/:topicId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove one topic from the current user' })
  removeMyTopic(@Request() req, @Param('topicId') topicId: string) {
    return this.usersService.removeTopic(req.user.id, +topicId);
  }

  @Get('me/favorites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get favorite papers selected by the current user' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'size', required: false, example: 20 })
  getMyFavorites(@Request() req, @Query() query: PaginationQueryDto) {
    return this.usersService.getFavorites(req.user.id, query);
  }

  @Post('me/favorites/:paperId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a paper to the current user favorites' })
  addMyFavorite(@Request() req, @Param('paperId') paperId: string) {
    return this.usersService.addFavorite(req.user.id, paperId);
  }

  @Delete('me/favorites/:paperId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a paper from the current user favorites' })
  removeMyFavorite(@Request() req, @Param('paperId') paperId: string) {
    return this.usersService.removeFavorite(req.user.id, paperId);
  }

  @Get('me/you-might-like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Personalized paper recommendations for the current user',
    description: 'Alias of GET /papers/you-might-like. Requires paperTopics=cs.AI,cs.AR',
  })
  @ApiQuery({ name: 'paperTopics', required: true, example: 'cs.AI,cs.AR' })
  getMyYouMightLike(@Request() req, @Query() query: YouMightLikeQueryDto) {
    return this.papersService.getYouMightLike(req.user.id, query);
  }

  @Get('me/history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get reading history of the current user' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'size', required: false, example: 20 })
  getMyHistory(@Request() req, @Query() query: PaginationQueryDto) {
    return this.usersService.getHistory(req.user.id, query);
  }

  @Post('me/history/:paperId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a paper to reading history or update its viewed_at timestamp' })
  addMyHistory(@Request() req, @Param('paperId') paperId: string) {
    return this.usersService.addHistory(req.user.id, paperId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiParam({ name: 'id', description: 'User ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Return the user.', type: User })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a user' })
  @ApiParam({ name: 'id', description: 'User ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'The user has been successfully updated.', type: User })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a user' })
  @ApiParam({ name: 'id', description: 'User ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'The user has been successfully deleted.' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
