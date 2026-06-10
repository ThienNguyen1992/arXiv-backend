import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import {
  DuplicateCandidate,
  PaperDuplicateDetector,
} from '../common/utils/duplicate-detector.util';
import { PaperSimilarity } from './entities/paper-similarity.entity';

export interface SimilarPaperItem {
  arxiv_id: string;
  title?: string;
  abstract?: string;
  authors?: string | string[] | null;
  categories?: string[];
  pdf_url?: string;
  published_at?: string | Date;
  similarity: number;
  type: 'exact' | 'near' | 'similar' | 'related';
  source?: string;
}

interface DuplicatePaperInput {
  arxiv_id: string;
  title: string;
  abstract?: string;
  authors?: string | string[] | null;
  doi?: string | null;
  published_at?: Date | string | null;
}

@Injectable()
export class PaperDuplicatesService {
  private readonly logger = new Logger(PaperDuplicatesService.name);
  private readonly detector = new PaperDuplicateDetector();

  constructor(
    @InjectRepository(PaperSimilarity)
    private readonly similarityRepository: Repository<PaperSimilarity>,
    private readonly elasticsearchService: ElasticsearchService,
  ) {}

  async countSimilarPapers(arxivId: string): Promise<number> {
    const normalized = this.normalizeArxivId(arxivId);
    return this.similarityRepository
      .createQueryBuilder('similarity')
      .where('similarity.arxiv_id = :arxivId', { arxivId: normalized })
      .orWhere('similarity.similar_arxiv_id = :arxivId', { arxivId: normalized })
      .getCount();
  }

  async getSimilarPapers(arxivId: string, limit = 10): Promise<SimilarPaperItem[]> {
    const normalized = this.normalizeArxivId(arxivId);
    const links = await this.similarityRepository
      .createQueryBuilder('similarity')
      .where('similarity.arxiv_id = :arxivId', { arxivId: normalized })
      .orWhere('similarity.similar_arxiv_id = :arxivId', { arxivId: normalized })
      .orderBy('similarity.similarity', 'DESC')
      .take(limit)
      .getMany();

    const relatedIds = links
      .map((link) =>
        link.arxiv_id === normalized ? link.similar_arxiv_id : link.arxiv_id,
      )
      .filter((id) => id !== normalized);

    if (relatedIds.length === 0) {
      return [];
    }

    const esDocs = await this.fetchElasticsearchPapers(relatedIds);
    const docMap = new Map<string, Record<string, any>>();
    for (const doc of esDocs) {
      docMap.set(String(doc.arxiv_id), doc);
    }

    return links
      .map((link) => {
        const otherArxivId =
          link.arxiv_id === normalized ? link.similar_arxiv_id : link.arxiv_id;
        const doc = docMap.get(otherArxivId);
        if (!doc) {
          return null;
        }

        return {
          ...doc,
          similarity: link.similarity,
          type: link.type,
        } as SimilarPaperItem;
      })
      .filter((item): item is SimilarPaperItem => item !== null);
  }

  async processBatchDuplicates(batch: DuplicatePaperInput[]) {
    if (batch.length < 2) {
      return { linkedPairs: 0 };
    }

    const candidates = batch.map((item) => this.toDuplicateCandidate(item));
    let linkedPairs = 0;

    for (let i = 0; i < candidates.length; i++) {
      const source = candidates[i];
      const others = candidates.slice(i + 1);
      const matches = this.detector
        .detectDuplicates(source, others)
        .filter((match) => match.type === 'exact' || match.type === 'near');

      for (const match of matches) {
        const linked = await this.linkDuplicatePair(
          source,
          match.paper,
          match.similarity,
          match.type,
        );
        if (linked) {
          linkedPairs += 1;
        }
      }
    }

    return { linkedPairs };
  }

  private async linkDuplicatePair(
    left: DuplicateCandidate,
    right: DuplicateCandidate,
    similarity: number,
    type: 'exact' | 'near' | 'similar' | 'related',
  ): Promise<boolean> {
    const leftArxivId = this.normalizeArxivId(left.arxiv_id ?? '');
    const rightArxivId = this.normalizeArxivId(right.arxiv_id ?? '');
    if (!leftArxivId || !rightArxivId || leftArxivId === rightArxivId) {
      return false;
    }

    const [arxivId, similarArxivId] = [leftArxivId, rightArxivId].sort();
    const existing = await this.similarityRepository.findOne({
      where: { arxiv_id: arxivId, similar_arxiv_id: similarArxivId },
    });
    if (existing) {
      return false;
    }

    await this.similarityRepository.save(
      this.similarityRepository.create({
        arxiv_id: arxivId,
        similar_arxiv_id: similarArxivId,
        similarity,
        type,
      }),
    );

    const canonicalArxivId = this.pickCanonicalArxivId(left, right);
    const duplicateArxivId =
      canonicalArxivId === leftArxivId ? rightArxivId : leftArxivId;

    await this.markHiddenOnFeed(duplicateArxivId, canonicalArxivId);
    return true;
  }

  private pickCanonicalArxivId(
    left: DuplicateCandidate,
    right: DuplicateCandidate,
  ): string {
    const leftDate = this.extractPublishedAt(left);
    const rightDate = this.extractPublishedAt(right);

    if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) {
      return leftDate < rightDate
        ? this.normalizeArxivId(left.arxiv_id ?? '')
        : this.normalizeArxivId(right.arxiv_id ?? '');
    }

    return this.normalizeArxivId(left.arxiv_id ?? '').localeCompare(
      this.normalizeArxivId(right.arxiv_id ?? ''),
    ) <= 0
      ? this.normalizeArxivId(left.arxiv_id ?? '')
      : this.normalizeArxivId(right.arxiv_id ?? '');
  }

  private extractPublishedAt(candidate: DuplicateCandidate): Date | null {
    const value = (candidate as DuplicateCandidate & { published_at?: string | Date })
      .published_at;
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private async markHiddenOnFeed(duplicateArxivId: string, canonicalArxivId: string) {
    try {
      await this.elasticsearchService.update({
        index: 'papers',
        id: duplicateArxivId,
        doc: {
          duplicate_of_arxiv_id: canonicalArxivId,
          show_on_feed: false,
        },
        doc_as_upsert: false,
      });
    } catch (error) {
      this.logger.warn(
        `Could not hide duplicate ${duplicateArxivId} on feed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private async fetchElasticsearchPapers(arxivIds: string[]) {
    if (arxivIds.length === 0) {
      return [] as Array<Record<string, any>>;
    }

    const response = await this.elasticsearchService.search({
      index: 'papers',
      size: arxivIds.length,
      query: {
        terms: { arxiv_id: arxivIds },
      },
    });

    return response.hits.hits.map((hit) => {
      const source = hit._source as Record<string, any>;
      return {
        ...source,
        arxiv_id: String(source.arxiv_id),
        source: 'elasticsearch',
      };
    });
  }

  private toDuplicateCandidate(item: DuplicatePaperInput): DuplicateCandidate & {
    published_at?: Date | string | null;
  } {
    return {
      arxiv_id: this.normalizeArxivId(item.arxiv_id),
      doi: item.doi ?? undefined,
      title: item.title,
      abstract: item.abstract,
      authors: this.parseAuthors(item.authors),
      published_at: item.published_at,
    };
  }

  private parseAuthors(authors?: string | string[] | null): string[] {
    if (!authors) {
      return [];
    }

    if (Array.isArray(authors)) {
      return authors.map((author) => String(author));
    }

    return String(authors)
      .split(',')
      .map((author) => author.trim())
      .filter(Boolean);
  }

  private normalizeArxivId(value: string): string {
    return value.trim().replace(/v\d+$/i, '');
  }
}
