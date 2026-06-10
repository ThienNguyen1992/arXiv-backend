import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { resolveArxivTopicCode } from '../common/utils/arxiv-taxonomy.util';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';
import { Topic } from '../topics/entities/topic.entity';
import { ARXIV_TAXONOMY_SEED } from './arxiv-taxonomy.seed';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { getPagination, toPaginatedResponse } from '../common/pagination';

export interface ParsedArxivTopic {
  code: string;
  title: string;
  description: string | null;

}

export interface ParsedArxivCategory {
  code: string;
  title: string;
  topics: ParsedArxivTopic[];
}

@Injectable()
export class CategoriesService {
  private readonly arxivTaxonomyUrl = 'https://arxiv.org/category_taxonomy';

  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    @InjectRepository(Topic)
    private readonly topicsRepository: Repository<Topic>,
    private readonly dataSource: DataSource,
  ) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const existing = await this.categoriesRepository.findOneBy({ code: createCategoryDto.code });
    if (existing) {
      throw new ConflictException(`Category with code '${createCategoryDto.code}' already exists`);
    }
    const category = this.categoriesRepository.create(createCategoryDto);
    return this.categoriesRepository.save(category);
  }

  findAll() {
    return this.categoriesRepository.find({
      relations: ['topics'],
      order: {
        title: 'ASC',
        topics: {
          code: 'ASC',
        },
      },
    });
  }

  async findAllTopicsFlat(query: PaginationQueryDto) {
    const { page, size, skip, take } = getPagination(query);
    const [topics, total] = await this.topicsRepository.findAndCount({
      relations: ['category'],
      order: { code: 'ASC' },
      skip,
      take,
    });
    console.log("🚀 ~ CategoriesService ~ findAllTopicsFlat ~ topics:", topics)

    const data = topics.map((topic) => ({
      id: topic.id,
      code: topic.code,
      slug: this.toSlug(topic.code),
      title: topic.title,
      description: topic.description,
      category: {
        id: topic.category.id,
        code: topic.category.code,
        title: topic.category.title,
      },
    }));
    console.log("🚀 ~ CategoriesService ~ findAllTopicsFlat ~ data:", data)

    return toPaginatedResponse(data, total, page, size);
  }

  async findOne(id: number) {
    const category = await this.categoriesRepository.findOneBy({ id });
    if (!category) {
      throw new NotFoundException(`Category #${id} not found`);
    }
    return category;
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto) {
    const category = await this.findOne(id);
    this.categoriesRepository.merge(category, updateCategoryDto);
    return this.categoriesRepository.save(category);
  }

  async remove(id: number) {
    const category = await this.findOne(id);
    return this.categoriesRepository.remove(category);
  }

  async ensureBundledTaxonomy() {
    const topicsImported = await this.upsertTaxonomy(ARXIV_TAXONOMY_SEED);

    return {
      source: 'bundled-arxiv-taxonomy-seed',
      categoriesImported: ARXIV_TAXONOMY_SEED.length,
      topicsImported,
    };
  }

  async ensureTopicsForCodes(codes: string[], manager?: EntityManager): Promise<Map<string, number>> {
    const uniqueCodes = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
    const topicIdMap = new Map<string, number>();
    if (uniqueCodes.length === 0) {
      return topicIdMap;
    }

    const run = async (entityManager: EntityManager) => {
      for (const code of uniqueCodes) {
        const info = resolveArxivTopicCode(code);

        await entityManager
          .createQueryBuilder()
          .insert()
          .into(Category)
          .values({ code: info.categoryCode, title: info.categoryTitle })
          .orIgnore()
          .execute();

        const category = await entityManager.findOne(Category, {
          where: { code: info.categoryCode },
        });
        if (!category) {
          continue;
        }

        await entityManager
          .createQueryBuilder()
          .insert()
          .into(Topic)
          .values({
            code: info.code,
            title: info.title,
            category_id: category.id,
            is_active: true,
          })
          .orIgnore()
          .execute();

        let topic = await entityManager.findOne(Topic, { where: { code: info.code } });
        if (!topic) {
          continue;
        }

        if (topic.category_id !== category.id || topic.title !== info.title) {
          topic.category_id = category.id;
          topic.title = info.title;
          topic.is_active = true;
          topic = await entityManager.save(Topic, topic);
        }

        topicIdMap.set(code, topic.id);
      }
    };

    if (manager) {
      await run(manager);
    } else {
      await this.dataSource.transaction(run);
    }

    return topicIdMap;
  }

  async syncArxivTaxonomy() {
    let parsedCategories: ParsedArxivCategory[];
    let source = this.arxivTaxonomyUrl;
    let fetchError: string | undefined;

    try {
      const response = await fetch(this.arxivTaxonomyUrl);
      if (!response.ok) {
        throw new Error(`arXiv returned ${response.status}`);
      }
      parsedCategories = this.parseArxivTaxonomy(await response.text());
    } catch (error) {
      fetchError = error instanceof Error ? this.formatErrorMessage(error) : 'unknown error';
      source = 'bundled-arxiv-taxonomy-seed';
      parsedCategories = ARXIV_TAXONOMY_SEED;
    }

    const topicsImported = await this.upsertTaxonomy(parsedCategories);

    return {
      source,
      categoriesImported: parsedCategories.length,
      topicsImported,
      ...(fetchError ? { warning: `Could not fetch live arXiv taxonomy: ${fetchError}` } : {}),
    };
  }

  private async upsertTaxonomy(parsedCategories: ParsedArxivCategory[]) {
    let topicsImported = 0;

    await this.dataSource.transaction(async (manager) => {
      for (const parsedCategory of parsedCategories) {
        let category = await manager.findOne(Category, { where: { code: parsedCategory.code } });

        if (!category) {
          category = manager.create(Category, parsedCategory);
        } else {
          category.title = parsedCategory.title;
        }

        category = await manager.save(Category, category);

        for (const parsedTopic of parsedCategory.topics) {
          let topic = await manager.findOne(Topic, { where: { code: parsedTopic.code } });

          if (!topic) {
            topic = manager.create(Topic, {
              ...parsedTopic,
              category_id: category.id,
              is_active: true,
            });
          } else {
            topic.title = parsedTopic.title;
            topic.description = parsedTopic.description;
            topic.category_id = category.id;
            topic.is_active = true;
          }

          await manager.save(Topic, topic);
          topicsImported++;
        }
      }
    });

    return topicsImported;
  }

  parseArxivTaxonomy(html: string): ParsedArxivCategory[] {
    const headingRegex = /<h([234])[^>]*>([\s\S]*?)<\/h\1>/gi;
    const headings: Array<{ level: number; text: string; start: number; end: number }> = [];
    let match: RegExpExecArray | null;

    while ((match = headingRegex.exec(html)) !== null) {
      headings.push({
        level: Number(match[1]),
        text: this.normalizeText(match[2]),
        start: match.index,
        end: headingRegex.lastIndex,
      });
    }

    const categories = new Map<string, ParsedArxivCategory>();
    let currentCategory: ParsedArxivCategory | null = null;

    for (let index = 0; index < headings.length; index++) {
      const heading = headings[index];

      if (heading.level === 2) {
        const code = this.categoryCodeFromName(heading.text);
        if (!code) {
          currentCategory = null;
          continue;
        }

        currentCategory = categories.get(code) ?? {
          code,
          title: heading.text,
          topics: [],
        };
        currentCategory.title = heading.text;
        categories.set(code, currentCategory);
        continue;
      }

      if (heading.level !== 4 || !currentCategory) {
        continue;
      }

      const topicMatch = heading.text.match(/^([a-z][a-z-]*(?:\.[A-Z-]+)?)\s+\(([^)]+)\)$/);
      if (!topicMatch) {
        continue;
      }

      const nextHeading = headings[index + 1];
      const descriptionHtml = html.slice(heading.end, nextHeading?.start ?? html.length);
      const topic: ParsedArxivTopic = {
        code: topicMatch[1],
        title: topicMatch[2],
        description: this.normalizeText(descriptionHtml) || null,
      };

      if (!currentCategory.topics.some((existingTopic) => existingTopic.code === topic.code)) {
        currentCategory.topics.push(topic);
      }
    }

    return [...categories.values()].filter((category) => category.topics.length > 0);
  }

  private categoryCodeFromName(name: string): string | null {
    const categoryCodes: Record<string, string> = {
      'Computer Science': 'cs',
      Economics: 'econ',
      'Electrical Engineering and Systems Science': 'eess',
      Mathematics: 'math',
      Physics: 'physics',
      'Quantitative Biology': 'q-bio',
      'Quantitative Finance': 'q-fin',
      Statistics: 'stat',
    };

    return categoryCodes[name] ?? null;
  }

  private normalizeText(value: string): string {
    return this.decodeHtmlEntities(value)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private decodeHtmlEntities(value: string): string {
    return value
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  private toSlug(code: string): string {
    return code.toLowerCase().replace(/\./g, '-');
  }

  private formatErrorMessage(error: Error): string {
    const cause = error.cause;
    if (cause instanceof Error) {
      return `${error.message}: ${cause.message}`;
    }

    return error.message;
  }
}
