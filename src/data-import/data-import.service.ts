import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as readline from 'readline';
import * as https from 'https';
import * as http from 'http';
import { IncomingMessage } from 'http';
import { verifyLocalJsonFile } from '../common/utils/file.util';
import { PaperScorer, PaperScoringInput } from '../common/utils/paper-score.util';
import { Category } from '../categories/entities/category.entity';
import { Topic } from '../topics/entities/topic.entity';
import { Paper } from '../papers/entities/paper.entity';
import { PaperTopic } from '../papers/entities/paper-topic.entity';
import { PaperVersion } from '../papers/entities/paper-version.entity';

@Injectable()
export class DataImportService {
  private readonly logger = new Logger(DataImportService.name);

  constructor(private readonly dataSource: DataSource) {}

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

  private async processBatch(batch: any[]) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const scorer = new PaperScorer();

    try {
      for (const item of batch) {
        // 1. Process Categories & Topics
        let primaryTopicId: number | null = null;
        const topicIds: number[] = [];

        if (item.categories) {
          const catList = item.categories.split(' ');
          for (let i = 0; i < catList.length; i++) {
            const topicCode = catList[i];
            const catCode = topicCode.split('.')[0];
            
            // Insert Category if not exists
            await queryRunner.manager.createQueryBuilder()
              .insert()
              .into(Category)
              .values({ code: catCode, title: catCode })
              .orIgnore()
              .execute();

            const cat = await queryRunner.manager.findOne(Category, { where: { code: catCode } });
            
            if (cat) {
              // Insert Topic if not exists
              await queryRunner.manager.createQueryBuilder()
                .insert()
                .into(Topic)
                .values({ code: topicCode, title: topicCode, category_id: cat.id })
                .orIgnore()
                .execute();

              const topic = await queryRunner.manager.findOne(Topic, { where: { code: topicCode } });
              if (topic) {
                if (!topicIds.includes(topic.id)) {
                  topicIds.push(topic.id);
                }
                if (i === 0) primaryTopicId = topic.id;
              }
            }
          }
        }

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
}
