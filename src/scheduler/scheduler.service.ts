import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// import { Cron, CronExpression } from '@nestjs/schedule';
import { PapersService } from '../papers/papers.service';
import { ArxivTimeQueryDto } from '../papers/dto/arxiv-time-query.dto';
import { NotificationService } from '../notification/notification.service';
import {
  CronArxivPaperInput,
  IngestArxivPaperResult,
  PaperDuplicatesService,
} from '../papers/paper-duplicates.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly papersService: PapersService,
    private readonly notificationService: NotificationService,
    private readonly paperDuplicatesService: PaperDuplicatesService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const enabled = this.configService.get<string>('RUN_ARXIV_CRON_ON_START') === 'true';

    if (!enabled) {
      this.logger.log(
        'Startup arXiv fetch skipped. Set RUN_ARXIV_CRON_ON_START=true in backend/.env then restart.',
      );
      return;
    }

    this.logger.log('RUN_ARXIV_CRON_ON_START=true — running arXiv fetch once on startup...');
    void this.handleDailyArxivFetch().catch((error) => {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Startup arXiv fetch failed: ${message}`, error instanceof Error ? error.stack : undefined);
    });
  }

  // @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  // @Cron(CronExpression.EVERY_12_HOURS)
  async handleDailyArxivFetch() {
    this.logger.log('Starting daily arXiv fetch cronjob...');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const yyyy = yesterday.getFullYear();
    const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
    const dd = String(yesterday.getDate()).padStart(2, '0');
    const targetDate = `${yyyy}-${mm}-${dd}`;

    const query = new ArxivTimeQueryDto();
    query.startDate = targetDate;
    query.endDate = targetDate;

    // return this.runManual(query);
    return 10
  }

  async runManual(query: ArxivTimeQueryDto) {
    const ingestLimit = Number(this.configService.get<string>('CRON_INGEST_PAPER_LIMIT', '1'));
    const safeLimit = Number.isFinite(ingestLimit) && ingestLimit > 0 ? ingestLimit : 1;
    const reingestCopyEnv = this.configService.get<string>('CRON_REINGEST_AS_DUPLICATE_COPY');
    const reingestAsCopy =
      reingestCopyEnv === 'true' ||
      (reingestCopyEnv !== 'false' && safeLimit === 1);

    this.logger.log(
      `Fetching papers from ${query.startDate} to ${query.endDate} (ingest limit=${safeLimit}, reingestAsCopy=${reingestAsCopy})`,
    );

    try {
      const response = await this.papersService.fetchAllArxivPapersByTimeRange(
        query.startDate,
        query.endDate,
      );
      const papersToIngest = response.data.slice(0, safeLimit);
      console.log("🚀 ~ SchedulerService ~ runManual ~ papersToIngest:", papersToIngest)

      this.logger.log(
        `Fetched ${response.data.length}/${response.total} papers — processing first ${papersToIngest.length}`,
      );

      if (papersToIngest.length === 0) {
        return {
          success: true,
          fetched: 0,
          ingested: 0,
          message: 'No papers to ingest',
        };
      }

      const ingestResults: IngestArxivPaperResult[] = [];
      for (const paper of papersToIngest) {
        const result = await this.paperDuplicatesService.ingestArxivPaper(
          paper as CronArxivPaperInput,
          { reingestAsCopy },
        );
        ingestResults.push(result);

        this.logger.log(
          `[INGEST] ${result.arxiv_id} | duplicate=${result.is_duplicate} | show_on_feed=${result.show_on_feed} | canonical=${result.canonical_arxiv_id ?? 'n/a'}`,
        );
      }

      const papersForNotification = papersToIngest.filter(
        (_, index) => ingestResults[index]?.show_on_feed,
      );

      if (papersForNotification.length > 0) {
        this.logger.log(`Pushing notifications for ${papersForNotification.length} feed-visible paper(s)...`);
        await this.notificationService.pushFromArxivPapers(papersForNotification);
      } else {
        this.logger.log('No feed-visible papers — notifications skipped.');
      }

      return {
        success: true,
        fetched: response.data.length,
        arxivTotal: response.total,
        ingested: ingestResults.length,
        duplicates: ingestResults.filter((item) => item.is_duplicate).length,
        notified: papersForNotification.length,
        results: ingestResults,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Error in daily arXiv fetch: ${message}`, error instanceof Error ? error.stack : undefined);
      return { success: false, error: message };
    }
  }
}
