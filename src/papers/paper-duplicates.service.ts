import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import {
  DuplicateCandidate,
  PaperDuplicateDetector,
} from '../common/utils/duplicate-detector.util';
import { PaperScorer } from '../common/utils/paper-score.util';
import { PaperSimilarity } from './entities/paper-similarity.entity';

export interface CronArxivPaperInput {
  id: string;
  arxiv_id: string;
  title: string;
  summary: string;
  authors: string[];
  pdfLink?: string | null;
  publishedDate?: string | null;
  updatedDate?: string | null;
  allCategories: string[];
}

export interface IngestArxivPaperResult {
  arxiv_id: string;
  indexed: boolean;
  is_duplicate: boolean;
  canonical_arxiv_id: string | null;
  show_on_feed: boolean;
  duplicate_linked: boolean;
  /** Test mode: cron re-ingested same arxiv id and created a synthetic copy */
  is_reingest_copy?: boolean;
}

export interface IngestArxivPaperOptions {
  /** When true and canonical already exists in ES, create {id}_copy_N instead of overwrite */
  reingestAsCopy?: boolean;
}

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

  async isDuplicatePaper(arxivId: string): Promise<boolean> {
    const normalized = this.normalizeArxivId(arxivId);
    try {
      const doc = await this.elasticsearchService.get({
        index: 'papers',
        id: normalized,
      });
      const source = doc._source as Record<string, unknown>;
      return Boolean(source?.duplicate_of_arxiv_id);
    } catch {
      return false;
    }
  }

  async countSimilarPapers(arxivId: string): Promise<number> {
    const normalized = this.normalizeArxivId(arxivId);
    if (await this.isDuplicatePaper(normalized)) {
      return 0;
    }

    return this.similarityRepository
      .createQueryBuilder('similarity')
      .where('similarity.arxiv_id = :arxivId', { arxivId: normalized })
      .orWhere('similarity.similar_arxiv_id = :arxivId', { arxivId: normalized })
      .getCount();
  }

  async getSimilarPapers(arxivId: string, limit = 10): Promise<SimilarPaperItem[]> {
    const normalized = this.normalizeArxivId(arxivId);
    if (await this.isDuplicatePaper(normalized)) {
      return [];
    }

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

  async ingestArxivPaper(
    paper: CronArxivPaperInput,
    options?: IngestArxivPaperOptions,
  ): Promise<IngestArxivPaperResult> {
    const arxivId = this.normalizeArxivId(paper.arxiv_id || paper.id);

    if (options?.reingestAsCopy) {
      const canonical = await this.getElasticsearchDocById(arxivId);
      if (canonical && !canonical.duplicate_of_arxiv_id) {
        return this.ingestReingestCopy(paper, arxivId);
      }
    }

    const publishedDate = paper.publishedDate ? new Date(paper.publishedDate) : new Date();
    const updatedDate = paper.updatedDate ? new Date(paper.updatedDate) : publishedDate;
    const scorer = new PaperScorer();
    const scoreResult = scorer.calculateScore({
      published_date: publishedDate,
      updated_date: updatedDate,
      abstract: paper.summary,
      version: 1,
      authors: [],
    });

    const document = this.buildElasticsearchDocument({
      storageId: arxivId,
      paper,
      publishedDate,
      updatedDate,
      score: scoreResult.total_score,
      showOnFeed: true,
      duplicateOfArxivId: null,
    });

    await this.elasticsearchService.index({
      index: 'papers',
      id: arxivId,
      document,
    });

    const source = this.toDuplicateCandidate({
      arxiv_id: arxivId,
      title: paper.title,
      abstract: paper.summary,
      authors: paper.authors,
      published_at: publishedDate,
    });

    const candidates = await this.findDuplicateCandidates(source, arxivId);
    const bestMatch = this.detector
      .detectDuplicates(source, candidates)
      .find((match) => match.type === 'exact' || match.type === 'near');

    let isDuplicate = false;
    let canonicalArxivId: string | null = arxivId;
    let duplicateLinked = false;

    if (bestMatch) {
      duplicateLinked = await this.linkDuplicatePair(
        source,
        bestMatch.paper,
        bestMatch.similarity,
        bestMatch.type,
      );

      if (duplicateLinked) {
        canonicalArxivId = this.pickCanonicalArxivId(source, bestMatch.paper);
        isDuplicate = canonicalArxivId !== arxivId;
      }
    }

    return {
      arxiv_id: arxivId,
      indexed: true,
      is_duplicate: isDuplicate,
      canonical_arxiv_id: canonicalArxivId,
      show_on_feed: !isDuplicate,
      duplicate_linked: duplicateLinked,
    };
  }

  private async ingestReingestCopy(
    paper: CronArxivPaperInput,
    canonicalArxivId: string,
  ): Promise<IngestArxivPaperResult> {
    const copyArxivId = await this.nextReingestCopyId(canonicalArxivId);
    const publishedDate = paper.publishedDate ? new Date(paper.publishedDate) : new Date();
    const updatedDate = paper.updatedDate ? new Date(paper.updatedDate) : publishedDate;
    const scorer = new PaperScorer();
    const scoreResult = scorer.calculateScore({
      published_date: publishedDate,
      updated_date: updatedDate,
      abstract: paper.summary,
      version: 1,
      authors: [],
    });

    const document = this.buildElasticsearchDocument({
      storageId: copyArxivId,
      paper,
      publishedDate,
      updatedDate,
      score: scoreResult.total_score,
      showOnFeed: false,
      duplicateOfArxivId: canonicalArxivId,
      sourceArxivId: canonicalArxivId,
    });

    await this.elasticsearchService.index({
      index: 'papers',
      id: copyArxivId,
      document,
    });

    const canonicalDoc = await this.getElasticsearchDocById(canonicalArxivId);
    const copyCandidate = this.toDuplicateCandidate({
      arxiv_id: copyArxivId,
      title: paper.title,
      abstract: paper.summary,
      authors: paper.authors,
      published_at: publishedDate,
    });
    const canonicalCandidate = this.toDuplicateCandidate({
      arxiv_id: canonicalArxivId,
      title: String(canonicalDoc?.title ?? paper.title),
      abstract: String(canonicalDoc?.abstract ?? paper.summary),
      authors: canonicalDoc?.authors ?? paper.authors,
      published_at: canonicalDoc?.published_at ?? publishedDate,
    });

    const duplicateLinked = await this.linkDuplicatePair(
      copyCandidate,
      canonicalCandidate,
      100,
      'exact',
    );

    this.logger.log(
      `Re-ingest copy ${copyArxivId} -> canonical ${canonicalArxivId} (linked=${duplicateLinked})`,
    );

    return {
      arxiv_id: copyArxivId,
      indexed: true,
      is_duplicate: true,
      canonical_arxiv_id: canonicalArxivId,
      show_on_feed: false,
      duplicate_linked: duplicateLinked,
      is_reingest_copy: true,
    };
  }

  private buildElasticsearchDocument(input: {
    storageId: string;
    paper: CronArxivPaperInput;
    publishedDate: Date;
    updatedDate: Date;
    score: number;
    showOnFeed: boolean;
    duplicateOfArxivId: string | null;
    sourceArxivId?: string;
  }) {
    const { storageId, paper, publishedDate, updatedDate, score } = input;
    return {
      arxiv_id: storageId,
      source_arxiv_id: input.sourceArxivId ?? storageId,
      title: paper.title ? paper.title.replace(/\s+/g, ' ').trim().substring(0, 500) : 'Untitled',
      abstract: paper.summary ? paper.summary.replace(/\s+/g, ' ').trim() : '',
      authors: paper.authors?.length ? paper.authors.join(', ') : null,
      authors_parsed: null,
      doi: null,
      journal_ref: null,
      license: null,
      comments: null,
      categories: paper.allCategories ?? [],
      primary_category:
        paper.allCategories?.length > 0 ? paper.allCategories[0].split('.')[0] : null,
      published_at: publishedDate,
      published_year: publishedDate.getFullYear(),
      published_month: publishedDate.getMonth() + 1,
      updated_at: updatedDate,
      created_at: new Date(),
      current_version: 1,
      score,
      pdf_url:
        paper.pdfLink ||
        `https://arxiv.org/pdf/${input.sourceArxivId ?? storageId}.pdf`,
      show_on_feed: input.showOnFeed,
      duplicate_of_arxiv_id: input.duplicateOfArxivId,
    };
  }

  private async getElasticsearchDocById(
    arxivId: string,
  ): Promise<Record<string, any> | null> {
    try {
      const doc = await this.elasticsearchService.get({
        index: 'papers',
        id: arxivId,
      });
      return doc._source as Record<string, any>;
    } catch {
      return null;
    }
  }

  private async nextReingestCopyId(canonicalArxivId: string): Promise<string> {
    const response = await this.elasticsearchService.count({
      index: 'papers',
      query: {
        term: { duplicate_of_arxiv_id: canonicalArxivId },
      },
    });

    const existingCopies = response.count ?? 0;
    return `${canonicalArxivId}_copy_${existingCopies + 1}`;
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

  private async findDuplicateCandidates(
    input: DuplicateCandidate,
    excludeArxivId: string,
  ): Promise<DuplicateCandidate[]> {
    try {
      const response = await this.elasticsearchService.search({
        index: 'papers',
        size: 20,
        query: {
          bool: {
            must: [
              {
                more_like_this: {
                  fields: ['title', 'abstract'],
                  like: `${input.title} ${input.abstract ?? ''}`,
                  min_term_freq: 1,
                  min_doc_freq: 1,
                  minimum_should_match: '30%',
                },
              },
            ],
            must_not: [{ ids: { values: [excludeArxivId] } }],
          },
        },
      });

      return response.hits.hits.map((hit) => {
        const src = hit._source as Record<string, any>;
        return this.toDuplicateCandidate({
          arxiv_id: src.arxiv_id,
          title: src.title,
          abstract: src.abstract,
          authors: src.authors,
          doi: src.doi,
          published_at: src.published_at,
        });
      });
    } catch (error) {
      this.logger.warn(
        `Duplicate candidate search failed for ${excludeArxivId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return [];
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
