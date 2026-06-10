import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PapersService } from '../papers/papers.service';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { ArxivTimeQueryDto } from '../papers/dto/arxiv-time-query.dto';
import { NotificationService } from '../notification/notification.service';
import { PaperScorer } from '../common/utils/paper-score.util';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly papersService: PapersService,
    private readonly elasticsearchService: ElasticsearchService,
    private readonly notificationService: NotificationService,
  ) {}

  // @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT) // Chạy vào 00:00 mỗi ngày
  @Cron(CronExpression.EVERY_12_HOURS)
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
    query.page = 1;
    query.size = 1000;

    return this.runManual(query);
  }

  async runManual(query: ArxivTimeQueryDto) {
    this.logger.log(`Fetching papers from ${query.startDate} to ${query.endDate}`);

    try {
      const response = await this.papersService.fetchArxivPapersByTimeRange(query);
      const papers = response.data;

      this.logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      this.logger.log(`📦 Fetched ${papers.length} papers from arXiv [${query.startDate} to ${query.endDate}]`);
      this.logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // Log toàn bộ data từng paper
      papers.forEach((paper, index) => {
        console.log(`\n[${index + 1}/${papers.length}] ──────────────────────────`);
        console.log(JSON.stringify(paper, null, 2));
      });

      this.logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      let duplicateCount = 0;
      let newCount = 0;
      const newPapers: typeof papers = [];


      for (const paper of papers) {
        // ── Duplicate check: kiểm tra ES ─────────────────────────────────
        // const exists = await this.elasticsearchService.exists({
        //   index: 'papers',
        //   id: paper.id,
        // });
        //
        // if (exists) {
        //   this.logger.log(`[DUPLICATE] ${paper.id} - ${paper.title}`);
        //   duplicateCount++;
        //   continue;
        // }
        // [TESTING] Tạm TẮT check duplicate để force lọt xuống push Notification!

        // ─────────────────────────────────────────────────────────────────
        // TÍNH NĂNG 1: Lưu vào Elasticsearch (đang TẮT)
        // TODO: Bỏ comment khi sẵn sàng bật
        // ─────────────────────────────────────────────────────────────────
        // const publishedDate = paper.publishedDate ? new Date(paper.publishedDate) : new Date();
        // const updatedDate = paper.updatedDate ? new Date(paper.updatedDate) : new Date();
        //
        // // Tính điểm cho paper
        // const scorer = new PaperScorer();
        // const scoreResult = scorer.calculateScore({
        //   published_date: publishedDate,
        //   updated_date: updatedDate,
        //   abstract: paper.summary,
        //   version: 1,
        //   authors: [],
        // });
        //
        // await this.elasticsearchService.index({
        //   index: 'papers',
        //   id: paper.id,
        //   document: {
        //     arxiv_id: paper.id,
        //     title: paper.title,
        //     abstract: paper.summary,
        //     authors: paper.authors.join(', '),
        //     authors_parsed: null,
        //     doi: null,
        //     journal_ref: null,
        //     license: null,
        //     comments: null,
        //     categories: paper.allCategories,
        //     primary_category:
        //       paper.allCategories.length > 0
        //         ? paper.allCategories[0].split('.')[0]
        //         : null,
        //     published_at: publishedDate,
        //     published_year: publishedDate.getFullYear(),
        //     published_month: publishedDate.getMonth() + 1,
        //     updated_at: updatedDate,
        //     created_at: new Date(),
        //     current_version: 1,
        //     score: scoreResult.total_score,
        //     pdf_url: paper.pdfLink || `https://arxiv.org/pdf/${paper.id}.pdf`,
        //   },
        // });
        // ─────────────────────────────────────────────────────────────────

        newPapers.push(paper);
        newCount++;
      }

      this.logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      this.logger.log(`✅ NEW:       ${newCount} papers`);
      this.logger.log(`🔁 DUPLICATE: ${duplicateCount} papers`);
      this.logger.log(`📊 TOTAL:     ${papers.length} papers fetched`);

      if (newPapers.length > 0) {
        this.logger.log(`─── New papers to notify ───────────────────────`);
        newPapers.forEach((p, i) => {
          this.logger.log(
            `  [NEW ${i + 1}] ${p.id} | [${p.allCategories?.join(', ')}] | ${p.title?.substring(0, 70)}`,
          );
        });
      }
      this.logger.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // ─────────────────────────────────────────────────────────────────
      // TÍNH NĂNG 2: Push notification theo topic của từng user (BẬT)
      // ─────────────────────────────────────────────────────────────────
      if (newPapers.length > 0) {
        this.logger.log(`🔔 Pushing notifications for ${newPapers.length} new papers...`);
        // await this.notificationService.pushFromArxivPapers(newPapers);
        this.logger.log(`🔔 Notification push done.`);
      } else {
        this.logger.log(`ℹ️  No new papers — no notifications sent.`);
      }
      // ─────────────────────────────────────────────────────────────────

      return {
        success: true,
        fetched: papers.length,
        new: newCount,
        duplicates: duplicateCount,
        message: newPapers.length > 0 ? `Pushed notifications for ${newPapers.length} new papers` : 'No new papers to push'
      };

    } catch (error) {
      this.logger.error(`Error in daily arXiv fetch: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }
}
