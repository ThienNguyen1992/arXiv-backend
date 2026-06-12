import { Injectable, BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as readline from 'readline';
import * as https from 'https';
import * as http from 'http';
import { IncomingMessage } from 'http';
import { verifyLocalJsonFile } from '../common/utils/file.util';
import { PaperScorer, PaperScoringInput } from '../common/utils/paper-score.util';
import { Paper } from '../papers/entities/paper.entity';
import { CategoriesService } from '../categories/categories.service';
import { PaperDuplicatesService } from '../papers/paper-duplicates.service';
import { collectArxivTopicCodesFromCategoriesField } from '../common/utils/arxiv-taxonomy.util';
import { PaperTopic } from '../papers/entities/paper-topic.entity';
import { PaperVersion } from '../papers/entities/paper-version.entity';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { AiService } from '../ai/ai.service';
import { DEFAULT_PAPERS_PER_TOPIC, SummarizeBackfillDto } from './dto/summarize-backfill.dto';

interface ElasticsearchSummaryItem {
  arxiv_id: string;
  title: string;
  abstract: string;
}

@Injectable()
export class DataImportService {
  private readonly logger = new Logger(DataImportService.name);
  private taxonomyBootstrapped = false;
  private summarizeJobRunning = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly elasticsearchService: ElasticsearchService,
    private readonly categoriesService: CategoriesService,
    private readonly paperDuplicatesService: PaperDuplicatesService,
    private readonly aiService: AiService,
  ) {}

  async importLocalData(path: string) {
    const result = await verifyLocalJsonFile(path);
    if (!result.isValid) {
      throw new BadRequestException(result.message);
    }
    
    // Start background processing without blocking the API response
    this.processFileBackground(path).catch(err => {
      this.logger.error(`Error during background import: ${err.message}`, err.stack);
    });
    
    return { 
      message: 'Import process started in the background. Please check server logs for progress.',
      file: path 
    };
  }

  async importUrlData(url: string) {
    if (!url || !url.startsWith('http')) {
      throw new BadRequestException('Invalid URL format');
    }
    
    this.processUrlBackground(url).catch(err => {
      this.logger.error(`Error during URL import: ${err.message}`, err.stack);
    });
    
    return { 
      message: 'URL Import process started in the background. Please check server logs for progress.',
      url: url 
    };
  }

  private async processFileBackground(filePath: string) {
    this.logger.log(`Starting import from ${filePath}`);
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    await this.processStream(rl, filePath);
  }

  private async processUrlBackground(url: string) {
    this.logger.log(`Starting import from URL ${url}`);
    
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (res: IncomingMessage) => {
      if (res.statusCode !== 200) {
        this.logger.error(`Failed to fetch URL. Status code: ${res.statusCode}`);
        return;
      }

      const rl = readline.createInterface({
        input: res,
        crlfDelay: Infinity
      });

      this.processStream(rl, url).catch(err => {
        this.logger.error(`Stream processing failed: ${err.message}`);
      });
    }).on('error', (err) => {
      this.logger.error(`HTTP Request error: ${err.message}`);
    });
  }

  private async processStream(rl: readline.Interface, sourceName: string) {
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
          await this.processBatch(batch);
          this.logger.log(`Processed ${count} records...`);
          batch = [];
        }
      } catch (err) {
        this.logger.error(`Error parsing line: ${err.message}`);
      }
    }

    // Process the remaining items in the last batch
    if (batch.length > 0) {
      await this.processBatch(batch);
      this.logger.log(`Processed ${count} records. Import complete.`);
    }
  }

  async syncTopicsFromElasticsearch() {
    await this.bootstrapTaxonomy();

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

    const buckets = (response.aggregations as any)?.categories?.buckets ?? [];
    const codes = buckets.map((bucket: { key: string }) => bucket.key);
    const topicIdMap = await this.categoriesService.ensureTopicsForCodes(codes);

    return {
      message: 'Topics synced from Elasticsearch categories.',
      categoriesFoundInElasticsearch: codes.length,
      topicsEnsured: topicIdMap.size,
    };
  }

  private async bootstrapTaxonomy() {
    if (this.taxonomyBootstrapped) {
      return;
    }

    const result = await this.categoriesService.ensureBundledTaxonomy();
    this.taxonomyBootstrapped = true;
    this.logger.log(
      `Bootstrapped arXiv taxonomy: ${result.categoriesImported} categories, ${result.topicsImported} topics`,
    );
  }

  private collectBatchTopicCodes(batch: any[]): string[] {
    return [
      ...new Set(
        batch.flatMap((item) => collectArxivTopicCodesFromCategoriesField(item.categories)),
      ),
    ];
  }

  private async processBatch(batch: any[]) {
    await this.bootstrapTaxonomy();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const scorer = new PaperScorer();

    try {
      const batchTopicCodes = this.collectBatchTopicCodes(batch);
      const topicIdMap = await this.categoriesService.ensureTopicsForCodes(
        batchTopicCodes,
        queryRunner.manager,
      );

      for (const item of batch) {
        const catList = collectArxivTopicCodesFromCategoriesField(item.categories);
        const topicIds = catList
          .map((code) => topicIdMap.get(code))
          .filter((id): id is number => typeof id === 'number');
        const primaryTopicId = topicIds[0] ?? null;

        // 2. Process Paper metadata
        const publishedDate = item.versions && item.versions.length > 0 
          ? new Date(item.versions[0].created) 
          : new Date();
        const updatedDate = item.update_date ? new Date(item.update_date) : publishedDate;
        
        // Calculate initial score using our custom PaperScorer logic
        const scoreInput: PaperScoringInput = {
          published_date: publishedDate,
          updated_date: updatedDate,
          journal_ref: item['journal-ref'],
          abstract: item.abstract,
          comments: item.comments,
          version: item.versions ? item.versions.length : 1,
          authors: [] // Authors no longer have DB relations for paper counting
        };
        const scoreResult = scorer.calculateScore(scoreInput);

        const paperValues = {
          arxiv_id: item.id,
          title: item.title ? item.title.replace(/\s+/g, ' ').trim().substring(0, 500) : 'Untitled',
          abstract: item.abstract ? item.abstract.replace(/\s+/g, ' ').trim() : '',
          authors: item.authors ? item.authors : null,
          authors_parsed: item.authors_parsed ? item.authors_parsed : null,
          doi: item.doi ? item.doi.substring(0, 100) : null,
          journal_ref: item['journal-ref'] ? item['journal-ref'].substring(0, 255) : null,
          comments: item.comments,
          published_at: publishedDate,
          updated_at: updatedDate,
          score: scoreResult.total_score,
          pdf_url: `https://arxiv.org/pdf/${item.id}.pdf`,
          current_version: item.versions ? item.versions.length : 1
        };

        // Insert or Update the paper
        const paperInsert = await queryRunner.manager.createQueryBuilder()
          .insert()
          .into(Paper)
          .values(paperValues)
          .orUpdate(
            ['title', 'abstract', 'authors', 'authors_parsed', 'doi', 'journal_ref', 'comments', 'updated_at', 'score', 'current_version'],
            ['arxiv_id']
          )
          .returning('id')
          .execute();

        const paperId = paperInsert.raw[0].id;

        // 4. Link Topics to Paper
        for (const tid of topicIds) {
          await queryRunner.manager.createQueryBuilder()
            .insert()
            .into(PaperTopic)
            .values({ paper_id: paperId, topic_id: tid, is_primary: tid === primaryTopicId })
            .orIgnore()
            .execute();
        }

        // 5. Save Paper Versions
        if (item.versions && Array.isArray(item.versions)) {
          for (const v of item.versions) {
            const vNum = parseInt(v.version.replace('v', ''), 10) || 1;
            await queryRunner.manager.createQueryBuilder()
              .insert()
              .into(PaperVersion)
              .values({
                paper_id: paperId,
                version_number: vNum,
                title: paperValues.title,
                abstract: paperValues.abstract,
                pdf_url: `https://arxiv.org/pdf/${item.id}${v.version}.pdf`,
                created_at: new Date(v.created)
              })
              .orIgnore()
              .execute();
          }
        }
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Batch process failed: ${err.message}`, err.stack);
    } finally {
      await queryRunner.release();
    }
  }

  async importElasticsearchLocalData(path: string) {
    const result = await verifyLocalJsonFile(path);
    if (!result.isValid) {
      throw new BadRequestException(result.message);
    }
    
    // Start background processing without blocking the API response
    this.processElasticsearchFileBackground(path).catch(err => {
      this.logger.error(`Error during ES background import: ${err.message}`, err.stack);
    });
    
    return { 
      message: 'Elasticsearch import process started in the background. Please check server logs for progress.',
      file: path 
    };
  }

  private async processElasticsearchFileBackground(filePath: string) {
    this.logger.log(`Starting Elasticsearch import from ${filePath}`);
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    await this.processElasticsearchStream(rl);
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

  private async processElasticsearchBatch(batch: any[]) {
    try {
      await this.bootstrapTaxonomy();
      const batchTopicCodes = this.collectBatchTopicCodes(batch);
      if (batchTopicCodes.length > 0) {
        await this.categoriesService.ensureTopicsForCodes(batchTopicCodes);
      }

      const scorer = new PaperScorer();
      
      const operations = batch.flatMap(item => {
        const publishedDate = item.versions && item.versions.length > 0 ? new Date(item.versions[0].created) : new Date();
        const updatedDate = item.update_date ? new Date(item.update_date) : publishedDate;
        
        const scoreInput: PaperScoringInput = {
          published_date: publishedDate,
          updated_date: updatedDate,
          journal_ref: item['journal-ref'],
          abstract: item.abstract,
          comments: item.comments,
          version: item.versions ? item.versions.length : 1,
          authors: []
        };
        const scoreResult = scorer.calculateScore(scoreInput);

        return [
          { index: { _index: 'papers', _id: item.id } },
          {
            arxiv_id: item.id,
            title: item.title ? item.title.replace(/\s+/g, ' ').trim().substring(0, 500) : 'Untitled',
            abstract: item.abstract ? item.abstract.replace(/\s+/g, ' ').trim() : '',
            authors: item.authors ? item.authors : null,
            authors_parsed: item.authors_parsed ? item.authors_parsed : null,
            doi: item.doi ? item.doi.substring(0, 100) : null,
            journal_ref: item['journal-ref'] ? item['journal-ref'].substring(0, 255) : null,
            license: item.license ? item.license : null,
            comments: item.comments ? item.comments : null,
            categories: item.categories ? item.categories.split(' ') : [],
            primary_category: item.categories ? item.categories.split(' ')[0].split('.')[0] : null,
            published_at: publishedDate,
            published_year: publishedDate.getFullYear(),
            published_month: publishedDate.getMonth() + 1,
            updated_at: updatedDate,
            created_at: new Date(),
            current_version: item.versions ? item.versions.length : 1,
            score: scoreResult.total_score,
            pdf_url: `https://arxiv.org/pdf/${item.id}.pdf`,
            show_on_feed: true,
            duplicate_of_arxiv_id: null,
          }
        ];
      });

      const bulkResponse = await this.elasticsearchService.bulk({ refresh: true, operations });

      await this.paperDuplicatesService.processBatchDuplicates(
        batch.map((item) => ({
          arxiv_id: item.id,
          title: item.title ? item.title.replace(/\s+/g, ' ').trim() : 'Untitled',
          abstract: item.abstract ? item.abstract.replace(/\s+/g, ' ').trim() : '',
          authors: item.authors ?? null,
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
              document: operations[i * 2 + 1]
            });
          }
        });
        this.logger.error(`Some ES documents failed: ${JSON.stringify(erroredDocuments)}`);
      }

      if (this.aiService.shouldSummarizeOnImport()) {
        const summaryItems = batch.map((item) => ({
          arxiv_id: item.id,
          title: item.title ? item.title.replace(/\s+/g, ' ').trim().substring(0, 500) : 'Untitled',
          abstract: item.abstract ? item.abstract.replace(/\s+/g, ' ').trim() : '',
        }));
        await this.summarizeAndUpdateElasticsearch(summaryItems);
      }
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
    this.runSummarizeBackfillBackground(dto).catch((err) => {
      this.logger.error(`Summarize backfill failed: ${err.message}`, err.stack);
    }).finally(() => {
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

    const updated = await this.summarizeAndUpdateElasticsearch([
      {
        arxiv_id: source.arxiv_id ?? normalizedId,
        title: source.title ?? 'Untitled',
        abstract: source.abstract ?? '',
      },
    ], 1);

    if (updated === 0) {
      throw new BadRequestException('Could not generate summary (empty abstract or Ollama unavailable)');
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

    const buckets = (response.aggregations as { categories?: { buckets?: Array<{ key: string }> } })
      ?.categories?.buckets ?? [];

    return buckets.map((bucket) => bucket.key).filter(Boolean).sort();
  }

  private buildTopicSummarizeQuery(topicCode: string, force: boolean) {
    const must: Record<string, unknown>[] = [
      { exists: { field: 'abstract' } },
      { term: { 'categories.keyword': topicCode } },
    ];
    const mustNot: Record<string, unknown>[] = force ? [] : [{ exists: { field: 'description' } }];

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
    return hits.map((hit) => {
      const src = (hit._source ?? {}) as Record<string, any>;
      return {
        arxiv_id: src.arxiv_id ?? hit._id ?? '',
        title: src.title ?? 'Untitled',
        abstract: src.abstract ?? '',
      };
    }).filter((item) => item.arxiv_id);
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
      const updated = await this.summarizeAndUpdateElasticsearch(uniquePapers, concurrency);
      processed += uniquePapers.length;
      summarized += updated;
      const batchSeconds = ((Date.now() - batchStartedAt) / 1000).toFixed(1);
      const rate = uniquePapers.length > 0 ? (uniquePapers.length / Number(batchSeconds)).toFixed(1) : '0';

      this.logger.log(
        `Topic ${topicCode}: summarized=${updated}/${uniquePapers.length} in ${batchSeconds}s (${rate}/s) | total processed=${processed}`,
      );
    }

    this.logger.log(
      `Summarize backfill complete. Topics=${topicCodes.length}, processed=${processed}, summarized=${summarized}, unique=${seenArxivIds.size}`,
    );
  }

  private async summarizeAndUpdateElasticsearch(
    items: ElasticsearchSummaryItem[],
    concurrency = this.aiService.getSummarizeConcurrency(),
  ): Promise<number> {
    if (!this.aiService.isSummarizationEnabled() || items.length === 0) {
      return 0;
    }

    const summaries = await this.mapWithConcurrency(items, concurrency, async (item) => {
      const summary = await this.aiService.summarizeAbstract(item.title, item.abstract);
      return summary ? { arxiv_id: item.arxiv_id, summary } : null;
    });

    const operations = summaries
      .filter((entry): entry is { arxiv_id: string; summary: NonNullable<Awaited<ReturnType<AiService['summarizeAbstract']>>> } => !!entry)
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
