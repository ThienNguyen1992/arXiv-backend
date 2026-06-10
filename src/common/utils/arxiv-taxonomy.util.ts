import { ARXIV_TAXONOMY_SEED } from '../../categories/arxiv-taxonomy.seed';

export interface ArxivTopicInfo {
  code: string;
  title: string;
  categoryCode: string;
  categoryTitle: string;
}

const TOPIC_LOOKUP = new Map<string, ArxivTopicInfo>();

for (const category of ARXIV_TAXONOMY_SEED) {
  for (const topic of category.topics) {
    TOPIC_LOOKUP.set(topic.code, {
      code: topic.code,
      title: topic.title,
      categoryCode: category.code,
      categoryTitle: category.title,
    });
  }
}

export function resolveArxivTopicCode(code: string): ArxivTopicInfo {
  const normalized = code.trim();
  const known = TOPIC_LOOKUP.get(normalized);
  if (known) {
    return known;
  }

  const dotIndex = normalized.indexOf('.');
  if (dotIndex > 0) {
    const categoryCode = normalized.slice(0, dotIndex);
    return {
      code: normalized,
      title: normalized,
      categoryCode,
      categoryTitle: categoryCode,
    };
  }

  return {
    code: normalized,
    title: normalized,
    categoryCode: normalized,
    categoryTitle: normalized,
  };
}

export function collectArxivTopicCodesFromCategoriesField(categories?: string): string[] {
  if (!categories) {
    return [];
  }

  return [...new Set(categories.split(/\s+/).map((code) => code.trim()).filter(Boolean))];
}
