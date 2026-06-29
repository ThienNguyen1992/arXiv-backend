import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { SyncArxivTaxonomyResponseDto } from './dto/sync-arxiv-taxonomy-response.dto';
import { Category } from './entities/category.entity';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all categories',
    description: 'Returns categories with nested topics, sorted by title and topic code.',
  })
  @ApiResponse({ status: 200, description: 'Category tree.', type: [Category] })
  findAll() {
    return this.categoriesService.findAll();
  }

  @Post('sync-arxiv')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sync categories and topics from arXiv taxonomy',
    description:
      'Fetches https://arxiv.org/category_taxonomy, parses HTML, and upserts categories/topics. Falls back to bundled seed on fetch failure.',
  })
  @ApiResponse({
    status: 200,
    description: 'Taxonomy synced successfully.',
    type: SyncArxivTaxonomyResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  syncArxivTaxonomy() {
    return this.categoriesService.syncArxivTaxonomy();
  }
}
