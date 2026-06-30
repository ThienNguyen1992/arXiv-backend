import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { resolveArxivTopicCode } from '../common/utils/arxiv-taxonomy.util';
import { Category } from './entities/category.entity';
import { Topic } from '../topics/entities/topic.entity';
import { ARXIV_TAXONOMY_SEED } from './arxiv-taxonomy.seed';

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

  async ensureTopicsForCodes(codes: string[], manager?: EntityManager): Promise<Map<string, number>> {
    const uniqueCodes = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
    const topicIdMap = new Map<string, number>();
    if (uniqueCodes.length === 0) {
      return topicIdMap;
    }

    const run = async (entityManager: EntityManager) => {
      for (const code of uniqueCodes) {
        const info = resolveArxivTopicCode(code);

        let category = await entityManager.findOne(Category, {
          where: { code: info.categoryCode },
        });
        if (!category) {
          category = await entityManager.save(
            Category,
            entityManager.create(Category, {
              code: info.categoryCode,
              title: info.categoryTitle,
            }),
          );
        } else if (category.title !== info.categoryTitle) {
          category.title = info.categoryTitle;
          category = await entityManager.save(Category, category);
        }

        let topic = await entityManager.findOne(Topic, { where: { code: info.code } });
        if (!topic) {
          topic = await entityManager.save(
            Topic,
            entityManager.create(Topic, {
              code: info.code,
              title: info.title,
              category_id: category.id,
              is_active: true,
            }),
          );
        } else if (
          topic.category_id !== category.id ||
          topic.title !== info.title ||
          !topic.is_active
        ) {
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
    let inPhysicsSection = false;

    for (let index = 0; index < headings.length; index++) {
      const heading = headings[index];

      if (heading.level === 2) {
        inPhysicsSection = heading.text === 'Physics';
        if (inPhysicsSection) {
          currentCategory = null;
          continue;
        }

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

      if (heading.level === 3 && inPhysicsSection) {
        const archiveMatch = heading.text.match(/^(.+?)\(([a-z][a-z-]*)\)$/);
        if (!archiveMatch) {
          currentCategory = null;
          continue;
        }

        const [, title, code] = archiveMatch;
        currentCategory = categories.get(code) ?? {
          code,
          title,
          topics: [],
        };
        currentCategory.title = title;
        categories.set(code, currentCategory);
        continue;
      }

      if (heading.level !== 4 || !currentCategory) {
        continue;
      }

      const topicMatch = heading.text.match(/^([a-z][a-z-]*(?:\.[A-Za-z-]+)?)\s+\(([^)]+)\)$/);
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

  private formatErrorMessage(error: Error): string {
    const cause = error.cause;
    if (cause instanceof Error) {
      return `${error.message}: ${cause.message}`;
    }

    return error.message;
  }
}
