import { ARXIV_TAXONOMY_SEED } from '../../categories/arxiv-taxonomy.seed';

export interface ArxivTopicInfo {
  code: string;
  title: string;
  categoryCode: string;
  categoryTitle: string;
}

const TOPIC_LOOKUP = new Map<string, ArxivTopicInfo>();
const CATEGORY_LOOKUP = new Map<string, { code: string; title: string }>();

for (const category of ARXIV_TAXONOMY_SEED) {
  CATEGORY_LOOKUP.set(category.code, { code: category.code, title: category.title });

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

  const category = CATEGORY_LOOKUP.get(normalized);
  if (category) {
    return {
      code: normalized,
      title: category.title,
      categoryCode: category.code,
      categoryTitle: category.title,
    };
  }

  const dotIndex = normalized.indexOf('.');
  if (dotIndex > 0) {
    const categoryCode = normalized.slice(0, dotIndex);
    const knownCategory = CATEGORY_LOOKUP.get(categoryCode);
    return {
      code: normalized,
      title: normalized,
      categoryCode,
      categoryTitle: knownCategory?.title ?? categoryCode,
    };
  }

  return {
    code: normalized,
    title: normalized,
    categoryCode: normalized,
    categoryTitle: normalized,
  };
}

export function collectArxivTopicCodesFromCategoriesField(
  categories?: string | string[],
): string[] {
  if (!categories) {
    return [];
  }

  if (Array.isArray(categories)) {
    return [...new Set(categories.map((code) => code.trim()).filter(Boolean))];
  }

  return [...new Set(categories.split(/\s+/).map((code) => code.trim()).filter(Boolean))];
}
