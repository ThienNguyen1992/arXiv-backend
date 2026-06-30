import { collectArxivTopicCodesFromCategoriesField } from './arxiv-taxonomy.util';

/** Input dùng cho PaperScorer — chỉ field có thể lấy từ arXiv metadata. */
export interface PaperScoringInput {
  published_date?: Date;
  updated_date?: Date;
  journal_ref?: string | null;
  doi?: string | null;
  abstract?: string | null;
  comments?: string | null;
  categories?: string[];
  version?: number;
  author_count?: number;
  authors_parsed?: unknown;
  license?: string | null;
  weights?: {
    citation?: number;
    recency?: number;
    author?: number;
    engagement?: number;
    quality?: number;
  };
}

export type PaperScoringSource = {
  published_date?: Date | string | null;
  updated_date?: Date | string | null;
  journal_ref?: string | null;
  doi?: string | null;
  abstract?: string | null;
  comments?: string | null;
  categories?: string | string[] | null;
  version?: number | null;
  authors?: string | string[] | null;
  authors_parsed?: unknown;
  license?: string | null;
};

export function resolveAuthorCount(source: {
  authors?: string | string[] | null;
  authors_parsed?: unknown;
}): number {
  if (Array.isArray(source.authors_parsed) && source.authors_parsed.length > 0) {
    return source.authors_parsed.length;
  }
  if (Array.isArray(source.authors)) {
    return source.authors.filter(Boolean).length;
  }
  if (typeof source.authors === 'string' && source.authors.trim()) {
    return source.authors
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean).length;
  }
  return 1;
}

type ParsedAuthorName = {
  lastName: string;
  firstName: string;
};

function parseAuthorsParsed(raw: unknown): ParsedAuthorName[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((entry): entry is unknown[] => Array.isArray(entry) && entry.length > 0)
    .map((entry) => ({
      lastName: String(entry[0] ?? '').trim(),
      firstName: String(entry[1] ?? '').trim(),
    }))
    .filter((author) => author.lastName.length > 0);
}

export function resolveCategories(categories?: string | string[] | null): string[] {
  if (Array.isArray(categories)) {
    return [...new Set(categories.map((code) => code.trim()).filter(Boolean))];
  }
  return collectArxivTopicCodesFromCategoriesField(categories ?? undefined);
}

function toDate(value?: Date | string | null): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Map raw arXiv JSON / ES doc / DB paper → PaperScoringInput. */
export function buildPaperScoringInput(source: PaperScoringSource): PaperScoringInput {
  return {
    published_date: toDate(source.published_date),
    updated_date: toDate(source.updated_date),
    journal_ref: source.journal_ref ?? null,
    doi: source.doi ?? null,
    abstract: source.abstract ?? null,
    comments: source.comments ?? null,
    categories: resolveCategories(source.categories),
    version: source.version && source.version > 0 ? source.version : 1,
    author_count: resolveAuthorCount(source),
    authors_parsed: source.authors_parsed,
    license: source.license ?? null,
  };
}

export class PaperScorer {
  private defaultWeights = {
    citation: 0.25,
    recency: 0.3,
    author: 0.15,
    engagement: 0.1,
    quality: 0.2,
  };

  public calculateScore(paper: PaperScoringInput) {
    const weights = { ...this.defaultWeights, ...(paper.weights || {}) };

    const scores = {
      citation: this.calculatePublicationScore(paper),
      recency: this.calculateRecencyScore(paper),
      author: this.calculateAuthorScore(paper),
      engagement: this.calculateEngagementScore(paper),
      quality: this.calculateQualityScore(paper),
    };

    let totalScore =
      scores.citation * weights.citation +
      scores.recency * weights.recency +
      scores.author * weights.author +
      scores.engagement * weights.engagement +
      scores.quality * weights.quality;

    totalScore = this.applyPenalties(paper, totalScore);

    const finalScore = Math.max(0, Math.min(totalScore, 100));

    return {
      total_score: Math.round(finalScore * 100) / 100,
      component_scores: {
        citation: Math.round(scores.citation * 100) / 100,
        recency: Math.round(scores.recency * 100) / 100,
        author: Math.round(scores.author * 100) / 100,
        engagement: Math.round(scores.engagement * 100) / 100,
        quality: Math.round(scores.quality * 100) / 100,
      },
      rank: this.getRank(finalScore),
    };
  }

  private calculatePublicationScore(paper: PaperScoringInput): number {
    let score = 0;

    if (paper.journal_ref?.trim()) {
      score += 45;
    }
    if (paper.doi?.trim()) {
      score += 30;
    }

    const comments = (paper.comments ?? '').toLowerCase();
    if (
      comments.includes('published') ||
      comments.includes('accepted') ||
      comments.includes('journal')
    ) {
      score += 15;
    }

    return Math.min(score, 100);
  }

  private calculateRecencyScore(paper: PaperScoringInput): number {
    if (!paper.published_date) return 0;

    const daysSincePublished =
      (Date.now() - paper.published_date.getTime()) / (1000 * 3600 * 24);
    const halfLifeDays = 365;
    const decayRate = Math.LN2 / halfLifeDays;
    const recencyScore = 100 * Math.exp(-decayRate * daysSincePublished);

    let updateBonus = 0;
    if (paper.updated_date) {
      const daysSinceUpdated =
        (Date.now() - paper.updated_date.getTime()) / (1000 * 3600 * 24);
      if (daysSinceUpdated <= 180) {
        updateBonus = 15 * Math.exp(-decayRate * daysSinceUpdated);
      }
    }

    return Math.min(recencyScore + updateBonus, 100);
  }

  private calculateAuthorScore(paper: PaperScoringInput): number {
    const count = paper.author_count ?? 1;
    const parsed = parseAuthorsParsed(paper.authors_parsed);

    const quantityScore = this.calculateAuthorTeamSizeScore(count);
    const diversityScore = this.calculateAuthorDiversityScore(count, parsed);

    return Math.min((quantityScore + diversityScore) / 2, 100);
  }

  private calculateAuthorTeamSizeScore(count: number): number {
    if (count <= 1) return 40;
    if (count === 2) return 58;
    if (count <= 4) return 78;
    if (count <= 8) return 92;
    if (count <= 15) return 84;
    return 70;
  }

  private calculateAuthorDiversityScore(count: number, parsed: ParsedAuthorName[]): number {
    if (count <= 1) return 30;

    if (parsed.length >= 2) {
      const uniqueLastNames = new Set(
        parsed.map((author) => author.lastName.toLowerCase()),
      ).size;
      const ratio = uniqueLastNames / parsed.length;

      let score = ratio * 65;
      if (uniqueLastNames >= 3) {
        score += 15;
      }
      if (uniqueLastNames === parsed.length && parsed.length >= 4) {
        score += 20;
      }
      return Math.min(score, 100);
    }

    if (count >= 5) return 55;
    if (count === 4) return 48;
    if (count === 3) return 42;
    return 36;
  }

  private calculateEngagementScore(paper: PaperScoringInput): number {
    let score = 0;

    const version = paper.version ?? 1;
    score += this.calculateVersionEngagementScore(version);

    const comments = (paper.comments ?? '').toLowerCase();
    if (comments.includes('page') || comments.includes('figure') || comments.includes('table')) {
      score += 30;
    }
    if (comments.includes('conference') || comments.includes('workshop') || comments.includes('proceedings')) {
      score += 20;
    }

    return Math.min(score, 100);
  }

  private calculateVersionEngagementScore(version: number): number {
    if (version <= 1) return 20;
    if (version === 2) return 35;
    return 50;
  }

  private calculateQualityScore(paper: PaperScoringInput): number {
    let score = 0;

    const abstractText = (paper.abstract ?? '').replace(/\s+/g, ' ').trim();
    const wordCount = abstractText ? abstractText.split(' ').length : 0;
    if (wordCount >= 120) {
      score += 35;
    } else if (wordCount >= 80) {
      score += 28;
    } else if (wordCount >= 50) {
      score += 18;
    } else if (wordCount > 0) {
      score += 8;
    }

    const categoryCount = paper.categories?.length ?? 0;
    if (categoryCount >= 3) {
      score += 25;
    } else if (categoryCount === 2) {
      score += 18;
    } else if (categoryCount === 1) {
      score += 10;
    }

    if (paper.license?.trim()) {
      score += 12;
    }

    if (paper.journal_ref?.trim()) {
      score += Math.min(this.getVenueBonus(paper.journal_ref), 28);
    }

    return Math.min(score, 100);
  }

  private getVenueBonus(journalRef: string): number {
    const topVenues: Record<string, number> = {
      neurips: 28,
      icml: 28,
      iclr: 26,
      cvpr: 26,
      iccv: 26,
      eccv: 24,
      acl: 26,
      emnlp: 24,
      nature: 28,
      science: 28,
      'phys. rev': 22,
      'phys rev': 22,
      ieee: 18,
      acm: 18,
    };

    const lowerRef = journalRef.toLowerCase();
    for (const [venue, bonus] of Object.entries(topVenues)) {
      if (lowerRef.includes(venue)) {
        return bonus;
      }
    }
    return 12;
  }

  private applyPenalties(paper: PaperScoringInput, score: number): number {
    const abstractLen = (paper.abstract ?? '').trim().length;
    if (abstractLen === 0) {
      return score * 0.65;
    }
    if (abstractLen < 80) {
      return score * 0.85;
    }
    return score;
  }

  private getRank(score: number): string {
    if (score >= 80) return 'Excellent';
    if (score >= 65) return 'Very Good';
    if (score >= 50) return 'Good';
    if (score >= 35) return 'Average';
    return 'Below Average';
  }
}
