import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as readline from 'readline';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { AiService } from '../ai/ai.service';
import { CategoriesService } from '../categories/categories.service';
import { PaperDuplicatesService } from '../papers/paper-duplicates.service';
import { verifyLocalJsonFile } from '../common/utils/file.util';
import { collectArxivTopicCodesFromCategoriesField } from '../common/utils/arxiv-taxonomy.util';
import { PaperScorer, buildPaperScoringInput } from '../common/utils/paper-score.util';
import { DEFAULT_PAPERS_PER_TOPIC, SummarizeBackfillDto } from './dto/summarize-backfill.dto';

interface ElasticsearchSummaryItem {
  arxiv_id: string;
  title: string;
  abstract: string;
}

@Injectable()
export class DataImportService {
  private readonly logger = new Logger(DataImportService.name);
  private summarizeJobRunning = false;

  constructor(
    private readonly elasticsearchService: ElasticsearchService,
    private readonly categoriesService: CategoriesService,
    private readonly paperDuplicatesService: PaperDuplicatesService,
    private readonly aiService: AiService,
  ) {}

  async importElasticsearchLocalData(path: string) {
    const result = await verifyLocalJsonFile(path);
    if (!result.isValid) {
      throw new BadRequestException(result.message);
    }

    this.processElasticsearchFileBackground(path).catch((err) => {
      this.logger.error(`Error during ES background import: ${err.message}`, err.stack);
    });

    return {
      message:
        'Elasticsearch import process started in the background. Please check server logs for progress.',
      file: path,
    };
  }

  private async processElasticsearchFileBackground(filePath: string) {
    this.logger.log(`Starting Elasticsearch import from ${filePath}`);
    const content = (await fsPromises.readFile(filePath, 'utf-8')).trim();

    if (content.startsWith('[')) {
      let records: unknown;
      try {
        records = JSON.parse(content);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        throw new Error(`Invalid JSON array file: ${message}`);
      }

      if (!Array.isArray(records)) {
        throw new Error('JSON file must be an array of paper objects when it starts with [');
      }

      await this.processElasticsearchRecords(records);
      return;
    }

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    await this.processElasticsearchStream(rl);
  }

  private async processElasticsearchRecords(records: any[]) {
    const BATCH_SIZE = 500;
    let batch: any[] = [];
    let count = 0;

    for (const data of records) {
      if (!data || typeof data !== 'object') {
        this.logger.warn('ES: Skipping invalid record (not a JSON object)');
        continue;
      }

      batch.push(data);
      count++;

      if (batch.length >= BATCH_SIZE) {
        await this.processElasticsearchBatch(batch);
        this.logger.log(`ES: Processed ${count} records...`);
        batch = [];
      }
    }

    if (batch.length > 0) {
      await this.processElasticsearchBatch(batch);
    }

    this.logger.log(`ES: Processed ${count} records. Import complete.`);
  }

  private async processElasticsearchStream(rl: readline.Interface) {
    const BATCH_SIZE = 500;
    let batch: any[] = [];
    let count = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        batch.push(data);
        count++;

        if (batch.length >= BATCH_SIZE) {
          await this.processElasticsearchBatch(batch);
          this.logger.log(`ES: Processed ${count} records...`);
          batch = [];
        }
      } catch (err) {
        this.logger.error(`ES Error parsing line: ${err.message}`);
      }
    }

    if (batch.length > 0) {
      await this.processElasticsearchBatch(batch);
      this.logger.log(`ES: Processed ${count} records. Import complete.`);
    }
  }

  private collectBatchTopicCodes(batch: any[]): string[] {
    return [
      ...new Set(
        batch.flatMap((item) => collectArxivTopicCodesFromCategoriesField(item.categories)),
      ),
    ];
  }

  private normalizeArxivId(value: string): string {
    return value.replace(/v\d+$/i, '').trim();
  }

  private formatAuthors(authors: unknown): string | null {
    if (!authors) return null;
    if (Array.isArray(authors)) {
      return authors.length > 0 ? authors.join(', ') : null;
    }
    return String(authors);
  }

  private async processElasticsearchBatch(batch: any[]) {
    try {
      const batchTopicCodes = this.collectBatchTopicCodes(batch);
      if (batchTopicCodes.length > 0) {
        await this.categoriesService.ensureTopicsForCodes(batchTopicCodes);
      }

      const scorer = new PaperScorer();

      const operations = batch.flatMap((item) => {
        const arxivId = this.normalizeArxivId(String(item.id ?? item.arxiv_id ?? ''));
        if (!arxivId) {
          return [];
        }

        const publishedDate =
          item.versions && item.versions.length > 0
            ? new Date(item.versions[0].created)
            : new Date();
        const updatedDate = item.update_date ? new Date(item.update_date) : publishedDate;
        const categories = collectArxivTopicCodesFromCategoriesField(item.categories);

        const scoreInput = buildPaperScoringInput({
          published_date: publishedDate,
          updated_date: updatedDate,
          journal_ref: item['journal-ref'],
          doi: item.doi,
          abstract: item.abstract,
          comments: item.comments,
          categories: item.categories,
          version: item.versions ? item.versions.length : 1,
          authors: item.authors,
          authors_parsed: item.authors_parsed,
          license: item.license,
        });
        const scoreResult = scorer.calculateScore(scoreInput);

        return [
          { index: { _index: 'papers', _id: arxivId } },
          {
            arxiv_id: arxivId,
            title: item.title
              ? item.title.replace(/\s+/g, ' ').trim().substring(0, 500)
              : 'Untitled',
            abstract: item.abstract ? item.abstract.replace(/\s+/g, ' ').trim() : '',
            authors: this.formatAuthors(item.authors),
            authors_parsed: item.authors_parsed ?? null,
            doi: item.doi ? String(item.doi).substring(0, 100) : null,
            journal_ref: item['journal-ref'] ? String(item['journal-ref']).substring(0, 255) : null,
            license: item.license ?? null,
            comments: item.comments ?? null,
            categories,
            primary_category: categories.length > 0 ? categories[0].split('.')[0] : null,
            published_at: publishedDate,
            published_year: publishedDate.getFullYear(),
            published_month: publishedDate.getMonth() + 1,
            updated_at: updatedDate,
            created_at: new Date(),
            current_version: item.versions ? item.versions.length : 1,
            score: scoreResult.total_score,
            pdf_url: `https://arxiv.org/pdf/${arxivId}.pdf`,
            show_on_feed: true,
            duplicate_of_arxiv_id: null,
          },
        ];
      });

      if (operations.length === 0) {
        return;
      }

      const bulkResponse = await this.elasticsearchService.bulk({ refresh: true, operations });

      await this.paperDuplicatesService.processBatchDuplicates(
        batch.map((item) => ({
          arxiv_id: this.normalizeArxivId(String(item.id ?? item.arxiv_id ?? '')),
          title: item.title ? item.title.replace(/\s+/g, ' ').trim() : 'Untitled',
          abstract: item.abstract ? item.abstract.replace(/\s+/g, ' ').trim() : '',
          authors: this.formatAuthors(item.authors),
          doi: item.doi ?? null,
          published_at:
            item.versions && item.versions.length > 0
              ? new Date(item.versions[0].created)
              : new Date(),
        })),
      );

      if (bulkResponse.errors) {
        const erroredDocuments: any[] = [];
        bulkResponse.items.forEach((action, i) => {
          const operation = Object.keys(action)[0];
          if (action[operation].error) {
            erroredDocuments.push({
              status: action[operation].status,
              error: action[operation].error,
              operation: operations[i * 2],
              document: operations[i * 2 + 1],
            });
          }
        });
        this.logger.error(`Some ES documents failed: ${JSON.stringify(erroredDocuments)}`);
      }

      const summaryItems = batch
        .map((item) => ({
          arxiv_id: this.normalizeArxivId(String(item.id ?? item.arxiv_id ?? '')),
          title: item.title
            ? item.title.replace(/\s+/g, ' ').trim().substring(0, 500)
            : 'Untitled',
          abstract: item.abstract ? item.abstract.replace(/\s+/g, ' ').trim() : '',
        }))
        .filter((item) => item.arxiv_id);

      await this.summarizeOnImportIfEnabled(summaryItems);
    } catch (err) {
      this.logger.error(`ES Batch process failed: ${err.message}`, err.stack);
    }
  }

  summarizeElasticsearchBackfill(dto: SummarizeBackfillDto) {
    if (this.summarizeJobRunning) {
      throw new ConflictException('Summarize backfill job is already running');
    }

    if (!this.aiService.isSummarizationEnabled()) {
      throw new BadRequestException('Ollama summarization is disabled (OLLAMA_ENABLED=false)');
    }

    this.summarizeJobRunning = true;
    this.runSummarizeBackfillBackground(dto)
      .catch((err) => {
        this.logger.error(`Summarize backfill failed: ${err.message}`, err.stack);
      })
      .finally(() => {
        this.summarizeJobRunning = false;
      });

    const papersPerTopic = dto.papersPerTopic ?? DEFAULT_PAPERS_PER_TOPIC;

    return {
      message:
        'Elasticsearch summarize backfill started in background (per topic). Check server logs for progress.',
      topics: dto.topics ?? 'all-from-elasticsearch',
      papersPerTopic,
      concurrency: dto.concurrency ?? this.aiService.getSummarizeConcurrency(),
      force: dto.force ?? false,
      estimatedMaxPapers: dto.topics?.length
        ? dto.topics.length * papersPerTopic
        : `topics-in-es × ${papersPerTopic}`,
    };
  }

  async summarizeElasticsearchPaper(arxivId: string) {
    const normalizedId = arxivId.replace(/v\d+$/i, '').trim();
    let source: Record<string, any>;

    try {
      const doc = await this.elasticsearchService.get({
        index: 'papers',
        id: normalizedId,
      });
      source = doc._source as Record<string, any>;
    } catch {
      throw new NotFoundException(`Paper ${arxivId} not found in Elasticsearch`);
    }

    const updated = await this.summarizeElasticsearchPapers(
      [
        {
          arxiv_id: source.arxiv_id ?? normalizedId,
          title: source.title ?? 'Untitled',
          abstract: source.abstract ?? '',
        },
      ],
      1,
    );

    if (updated === 0) {
      throw new BadRequestException(
        'Could not generate summary (empty abstract or Ollama unavailable)',
      );
    }

    const refreshed = await this.elasticsearchService.get({
      index: 'papers',
      id: normalizedId,
    });

    return refreshed._source;
  }

  private async resolveSummarizeTopicCodes(topics?: string[]): Promise<string[]> {
    if (topics && topics.length > 0) {
      return [...new Set(topics.map((code) => code.trim()).filter(Boolean))];
    }

    const response = await this.elasticsearchService.search({
      index: 'papers',
      size: 0,
      aggs: {
        categories: {
          terms: {
            field: 'categories.keyword',
            size: 1000,
          },
        },
      },
    });

    const buckets =
      (response.aggregations as { categories?: { buckets?: Array<{ key: string }> } })
        ?.categories?.buckets ?? [];

    return buckets
      .map((bucket) => bucket.key)
      .filter(Boolean)
      .sort();
  }

  private buildTopicSummarizeQuery(topicCode: string, force: boolean) {
    const must: Record<string, unknown>[] = [
      { exists: { field: 'abstract' } },
      { term: { 'categories.keyword': topicCode } },
    ];
    const mustNot: Record<string, unknown>[] = force
      ? []
      : [{ exists: { field: 'description' } }];

    return {
      bool: {
        must,
        ...(mustNot.length > 0 ? { must_not: mustNot } : {}),
      },
    };
  }

  private async fetchTopicPapersForSummarize(
    topicCode: string,
    size: number,
    force: boolean,
  ): Promise<ElasticsearchSummaryItem[]> {
    const response = await this.elasticsearchService.search({
      index: 'papers',
      size,
      query: this.buildTopicSummarizeQuery(topicCode, force),
      sort: [{ published_at: { order: 'desc', unmapped_type: 'date' } }],
      _source: ['arxiv_id', 'title', 'abstract'],
    });

    return this.mapHitsToSummaryItems(response.hits.hits);
  }

  private mapHitsToSummaryItems(hits: Array<{ _id?: string; _source?: unknown }>) {
    return hits
      .map((hit) => {
        const src = (hit._source ?? {}) as Record<string, any>;
        return {
          arxiv_id: src.arxiv_id ?? hit._id ?? '',
          title: src.title ?? 'Untitled',
          abstract: src.abstract ?? '',
        };
      })
      .filter((item) => item.arxiv_id);
  }

  private async runSummarizeBackfillBackground(dto: SummarizeBackfillDto) {
    const concurrency = dto.concurrency ?? this.aiService.getSummarizeConcurrency();
    const force = dto.force ?? false;
    const papersPerTopic = dto.papersPerTopic ?? DEFAULT_PAPERS_PER_TOPIC;
    const topicCodes = await this.resolveSummarizeTopicCodes(dto.topics);
    const seenArxivIds = new Set<string>();
    let processed = 0;
    let summarized = 0;

    this.logger.log(
      `Starting ES summarize backfill by topic (topics=${topicCodes.length}, papersPerTopic=${papersPerTopic}, concurrency=${concurrency}, force=${force})`,
    );

    if (topicCodes.length === 0) {
      this.logger.warn('No topics found for summarize backfill');
      return;
    }

    await this.aiService.warmupModel();

    for (const topicCode of topicCodes) {
      const papers = await this.fetchTopicPapersForSummarize(topicCode, papersPerTopic, force);
      const uniquePapers = papers.filter((paper) => {
        if (seenArxivIds.has(paper.arxiv_id)) {
          return false;
        }
        seenArxivIds.add(paper.arxiv_id);
        return true;
      });

      if (uniquePapers.length === 0) {
        this.logger.log(`Topic ${topicCode}: no papers to summarize (skip)`);
        continue;
      }

      const batchStartedAt = Date.now();
      const updated = await this.summarizeElasticsearchPapers(uniquePapers, concurrency);
      processed += uniquePapers.length;
      summarized += updated;
      const batchSeconds = ((Date.now() - batchStartedAt) / 1000).toFixed(1);
      const rate =
        uniquePapers.length > 0 ? (uniquePapers.length / Number(batchSeconds)).toFixed(1) : '0';

      this.logger.log(
        `Topic ${topicCode}: summarized=${updated}/${uniquePapers.length} in ${batchSeconds}s (${rate}/s) | total processed=${processed}`,
      );
    }

    this.logger.log(
      `Summarize backfill complete. Topics=${topicCodes.length}, processed=${processed}, summarized=${summarized}, unique=${seenArxivIds.size}`,
    );
  }

  async summarizeOnImportIfEnabled(
    items: ElasticsearchSummaryItem[],
    concurrency = this.aiService.getSummarizeConcurrency(),
  ): Promise<number> {
    if (!this.aiService.shouldSummarizeOnImport() || items.length === 0) {
      return 0;
    }

    await this.aiService.warmupModel();
    return this.summarizeElasticsearchPapers(items, concurrency);
  }

  async summarizeElasticsearchPapers(
    items: ElasticsearchSummaryItem[],
    concurrency = this.aiService.getSummarizeConcurrency(),
  ): Promise<number> {
    if (!this.aiService.isSummarizationEnabled() || items.length === 0) {
      return 0;
    }

    const summaries = await this.mapWithConcurrency(items, concurrency, async (item) => {
      this.logger.log(`Summarize in progress: arxiv_id=${item.arxiv_id}`);
      const summary = await this.aiService.summarizeAbstract(item.title, item.abstract);
      if (summary) {
        this.logger.log(`Summarize created description: arxiv_id=${item.arxiv_id}`);
      } else {
        this.logger.warn(`Summarize skipped: arxiv_id=${item.arxiv_id}`);
      }
      return summary ? { arxiv_id: item.arxiv_id, summary } : null;
    });

    const operations = summaries
      .filter(
        (
          entry,
        ): entry is {
          arxiv_id: string;
          summary: NonNullable<Awaited<ReturnType<AiService['summarizeAbstract']>>>;
        } => !!entry,
      )
      .flatMap(({ arxiv_id, summary }) => [
        { update: { _index: 'papers', _id: arxiv_id } },
        {
          doc: {
            description: summary.description,
            key_points: summary.key_points,
            summary_model: summary.summary_model,
            summarized_at: summary.summarized_at,
          },
          doc_as_upsert: false,
        },
      ]);

    if (operations.length === 0) {
      return 0;
    }

    const bulkResponse = await this.elasticsearchService.bulk({
      refresh: false,
      operations,
    });

    if (bulkResponse.errors) {
      this.logger.warn('Some Elasticsearch summary updates failed during bulk update');
    }

    return operations.length / 2;
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const current = nextIndex;
        nextIndex += 1;
        results[current] = await mapper(items[current]);
      }
    });

    await Promise.all(workers);
    return results;
  }
}
