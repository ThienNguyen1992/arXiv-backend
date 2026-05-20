import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';
import { Topic } from '../topics/entities/topic.entity';
import { ARXIV_TAXONOMY_SEED } from './arxiv-taxonomy.seed';

export interface ParsedArxivTopic {
  code: string;
  name: string;
  description: string | null;
}

export interface ParsedArxivCategory {
  code: string;
  name: string;
  description: string | null;
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

  create(createCategoryDto: CreateCategoryDto) {
    const category = this.categoriesRepository.create(createCategoryDto);
    return this.categoriesRepository.save(category);
  }

  findAll() {
    return this.categoriesRepository.find({
      relations: ['topics'],
      order: {
        name: 'ASC',
        topics: {
          code: 'ASC',
        },
      },
    });
  }

  async findAllTopicsFlat() {
    const topics = await this.topicsRepository.find({
      relations: ['category'],
      order: { code: 'ASC' },
    });

    return topics.map((topic) => ({
      id: topic.id,
      code: topic.code,
      slug: this.toSlug(topic.code),
      name: topic.name,
      description: topic.description,
      category: {
        id: topic.category.id,
        code: topic.category.code,
        name: topic.category.name,
      },
    }));
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

    let topicsImported = 0;

    await this.dataSource.transaction(async (manager) => {
      for (const parsedCategory of parsedCategories) {
        let category = await manager.findOne(Category, { where: { code: parsedCategory.code } });

        if (!category) {
          category = manager.create(Category, parsedCategory);
        } else {
          category.name = parsedCategory.name;
          category.description = parsedCategory.description;
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
            topic.name = parsedTopic.name;
            topic.description = parsedTopic.description;
            topic.category_id = category.id;
            topic.is_active = true;
          }

          await manager.save(Topic, topic);
          topicsImported++;
        }
      }
    });

    return {
      source,
      categoriesImported: parsedCategories.length,
      topicsImported,
      ...(fetchError ? { warning: `Could not fetch live arXiv taxonomy: ${fetchError}` } : {}),
    };
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
          name: heading.text,
          description: `arXiv ${heading.text} category group`,
          topics: [],
        };
        currentCategory.name = heading.text;
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
        name: topicMatch[2],
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
