import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PapersService } from '../papers/papers.service';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { ArxivTimeQueryDto } from '../papers/dto/arxiv-time-query.dto';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly papersService: PapersService,
    private readonly elasticsearchService: ElasticsearchService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT) // Chạy vào 00:00 mỗi ngày
  async handleDailyArxivFetch() {
    this.logger.log('Starting daily arXiv fetch cronjob...');

    // Tính ngày hôm qua để lấy dữ liệu (vì data hôm nay chưa chắc đã đầy đủ)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Format ngày thành YYYY-MM-DD
    const yyyy = yesterday.getFullYear();
    const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
    const dd = String(yesterday.getDate()).padStart(2, '0');
    const targetDate = `${yyyy}-${mm}-${dd}`;

    this.logger.log(`Fetching papers for date: ${targetDate}`);

    const query = new ArxivTimeQueryDto();
    query.startDate = targetDate;
    query.endDate = targetDate;
    query.page = 1;
    query.size = 1000; // Lấy tối đa 1000 bài mỗi ngày (tuỳ chỉnh)

    try {
      const response = await this.papersService.fetchArxivPapersByTimeRange(query);
      const papers = response.data;
      
      this.logger.log(`Fetched ${papers.length} papers from arXiv.`);

      let duplicateCount = 0;
      const documents: any[] = [];

      for (const paper of papers) {
        // Kiểm tra xem bài báo đã có trong ES chưa (dựa vào _id)
        const exists = await this.elasticsearchService.exists({
          index: 'papers',
          id: paper.id,
        });

        if (exists) {
          this.logger.log(`[EXACT DUPLICATE] Bài báo đã tồn tại trong ES: ${paper.id}. Bỏ qua.`);
          duplicateCount++;
          continue;
        }

        // Kiểm tra Semantic / Near Duplicate
        const fuzzyMatches = await this.papersService.checkFuzzyDuplicate(paper.title, paper.summary);
        
        let isDuplicated = false;
        let parentIdDuplicate = null;
        let reason: string | null = null;

        if (fuzzyMatches && fuzzyMatches.length > 0) {
           isDuplicated = true;
           parentIdDuplicate = (fuzzyMatches[0].paper as any).arxiv_id;
           reason = "Fuzzy duplicate with threshold > 85%";
           this.logger.log(`[NEAR DUPLICATE] Bài báo ${paper.id} giống với ${parentIdDuplicate}`);
        }

        documents.push({
          arxiv_id: paper.id,
          title: paper.title,
          abstract: paper.summary,
          authors: paper.authors.join(', '),
          authors_parsed: null, // Không có sẵn trong API
          doi: null,
          journal_ref: null, // Không có sẵn trong XML trả về mặc định
          license: null,
          comments: null,
          categories: paper.allCategories,
          primary_category: paper.allCategories.length > 0 ? paper.allCategories[0].split('.')[0] : null,
          published_at: paper.publishedDate ? new Date(paper.publishedDate) : new Date(),
          published_year: paper.publishedDate ? new Date(paper.publishedDate).getFullYear() : new Date().getFullYear(),
          published_month: paper.publishedDate ? new Date(paper.publishedDate).getMonth() + 1 : new Date().getMonth() + 1,
          updated_at: paper.updatedDate ? new Date(paper.updatedDate) : new Date(),
          created_at: new Date(),
          current_version: 1,
          score: 0, // Sẽ được tính sau nếu cần
          pdf_url: paper.pdfLink || `https://arxiv.org/pdf/${paper.id}.pdf`,
          is_duplicated: isDuplicated,
          parent_id_duplicate: parentIdDuplicate,
          duplicate_reason: reason
        });
      }

      const { newCount: importedCount, duplicateCount: skippedInBulk } = await this.papersService.bulkCreatePapers(documents);

      this.logger.log(`Cronjob finished. Processed: ${documents.length}, Added: ${importedCount}, Exact Duplicates skipped: ${duplicateCount + skippedInBulk}`);
    } catch (error) {
      this.logger.error(`Error in daily arXiv fetch: ${error.message}`, error.stack);
    }
  }
}
