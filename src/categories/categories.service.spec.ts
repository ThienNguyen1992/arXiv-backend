import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';
import { Topic } from '../topics/entities/topic.entity';

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: getRepositoryToken(Category),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Topic),
          useValue: {},
        },
        {
          provide: DataSource,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  it('parses arXiv taxonomy headings into categories and topics', () => {
    const html = `
      <h2>Computer Science</h2>
      <h4>cs.AI (Artificial Intelligence)</h4>
      <p>Covers all areas of AI.</p>
      <h4>cs.LG (Machine Learning)</h4>
      <p>Papers on all aspects of machine learning.</p>
      <h2>Mathematics</h2>
      <h4>math.AP (Analysis of PDEs)</h4>
      <p>Existence and uniqueness.</p>
    `;

    const categories = service.parseArxivTaxonomy(html);

    expect(categories).toEqual([
      {
        code: 'cs',
        name: 'Computer Science',
        description: 'arXiv Computer Science category group',
        topics: [
          {
            code: 'cs.AI',
            name: 'Artificial Intelligence',
            description: 'Covers all areas of AI.',
          },
          {
            code: 'cs.LG',
            name: 'Machine Learning',
            description: 'Papers on all aspects of machine learning.',
          },
        ],
      },
      {
        code: 'math',
        name: 'Mathematics',
        description: 'arXiv Mathematics category group',
        topics: [
          {
            code: 'math.AP',
            name: 'Analysis of PDEs',
            description: 'Existence and uniqueness.',
          },
        ],
      },
    ]);
  });

  it('uses bundled taxonomy seed when live arXiv fetch fails', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network timeout'));
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_, entity) => entity),
      save: jest.fn(async (_, entity) => ({ id: 1, ...entity })),
    };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const fallbackService = new CategoriesService({} as any, {} as any, dataSource as any);

    const result = await fallbackService.syncArxivTaxonomy();

    expect(result.source).toBe('bundled-arxiv-taxonomy-seed');
    expect(result.categoriesImported).toBeGreaterThan(0);
    expect(result.topicsImported).toBeGreaterThan(100);
    expect(result.warning).toContain('network timeout');

    fetchSpy.mockRestore();
  });
});
