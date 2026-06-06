Chắc chắn rồi! Đây là câu hỏi rất trọng tâm. Để lấy các bài báo (paper) mới nhất từ arXiv theo nhiều topic cùng lúc (ví dụ `cs.AI` và `cs.CV`), bạn sẽ sử dụng API tìm kiếm của arXiv với một cú pháp query đặc biệt.

**Nguyên tắc cốt lõi:** Bạn sẽ xây dựng một chuỗi `search_query` duy nhất, trong đó các topic được nối với nhau bằng toán tử `OR`.

### 1. Cú pháp Query của arXiv API

-   **Endpoint:** `http://export.arxiv.org/api/query`
-   **Tham số chính:** `search_query`
-   **Để lọc theo category (topic):** Dùng tiền tố `cat:`. Ví dụ: `cat:cs.AI`.
-   **Để kết hợp nhiều category:** Dùng toán tử `OR`. Ví dụ: `cat:cs.AI OR cat:cs.CV OR cat:cs.LG`.
-   **Để lấy bài mới nhất:** Dùng tham số `sortBy=submittedDate` và `sortOrder=descending`.
-   **Để phân trang (pagination):** Dùng `start` (vị trí bắt đầu, tính từ 0) và `max_results` (số lượng kết quả mỗi trang).

### 2. Ví dụ URL cụ thể

Giả sử bạn muốn lấy **15 bài báo mới nhất** thuộc một trong hai topic: **Artificial Intelligence (`cs.AI`)** hoặc **Computer Vision and Pattern Recognition (`cs.CV`)**, ở trang đầu tiên.

-   `search_query`: `cat:cs.AI OR cat:cs.CV`
-   `sortBy`: `submittedDate`
-   `sortOrder`: `descending`
-   `start`: `0` (vì là trang 1)
-   `max_results`: `15`

**URL đầy đủ sẽ là (chưa encode):**
`http://export.arxiv.org/api/query?search_query=cat:cs.AI OR cat:cs.CV&sortBy=submittedDate&sortOrder=descending&start=0&max_results=15`

**Quan trọng:** Khi lập trình, bạn phải encode URL, đặc biệt là các ký tự đặc biệt như dấu cách trong `OR`.

### 3. Cách triển khai trong NestJS Service

Đây là một ví dụ hàm trong service của bạn (ví dụ `FeedService`) để thực hiện việc này. Hàm này sẽ nhận vào một mảng các topic ID và thông tin phân trang.

```typescript
// Trong file feed.service.ts

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as cheerio from 'cheerio';
import { PaginationDto } from './dto/pagination.dto'; // Giả sử bạn có DTO này

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);
  private readonly ARXIV_API_URL = 'http://export.arxiv.org/api/query';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Lấy các bài báo mới nhất từ arXiv dựa trên một danh sách các topic.
   * @param topics - Mảng các topic ID, ví dụ: ['cs.AI', 'cs.CV']
   * @param pagination - Đối tượng chứa page và limit
   * @returns Dữ liệu bài báo đã được xử lý và thông tin phân trang
   */
  async fetchPapersByTopics(topics: string[], pagination: PaginationDto) {
    if (!topics || topics.length === 0) {
      throw new BadRequestException('At least one topic is required.');
    }

    // 1. Xây dựng chuỗi search_query từ mảng topics
    // Input: ['cs.AI', 'cs.CV'] -> Output: "cat:cs.AI OR cat:cs.CV"
    const searchQuery = topics.map(topic => `cat:${topic}`).join(' OR ');

    // 2. Tính toán tham số 'start' cho pagination
    const start = (pagination.page - 1) * pagination.limit;

    // 3. Tạo URL hoàn chỉnh, nhớ encodeURIComponent cho query
    const url = new URL(this.ARXIV_API_URL);
    url.searchParams.append('search_query', searchQuery);
    url.searchParams.append('sortBy', 'submittedDate');
    url.searchParams.append('sortOrder', 'descending');
    url.searchParams.append('start', start.toString());
    url.searchParams.append('max_results', pagination.limit.toString());

    this.logger.log(`Querying arXiv with URL: ${url.toString()}`);

    try {
      // 4. Gọi API
      const response = await firstValueFrom(this.httpService.get(url.toString()));
      const xmlData = response.data;
      
      // 5. Parse XML trả về và đóng gói thành JSON (hàm này từ câu trả lời trước)
      return this.parseArxivXML(xmlData);

    } catch (error) {
      this.logger.error('Failed to fetch papers from arXiv', error.stack);
      throw new Error('Could not retrieve papers from arXiv.');
    }
  }

  // Hàm helper để parse XML, bạn có thể tách ra file riêng
  private parseArxivXML(xml: string) {
    const $ = cheerio.load(xml, { xmlMode: true });

    const totalResults = parseInt($('opensearch\\:totalResults').text(), 10) || 0;
    
    const entries = [];
    $('entry').each((_, entry) => {
      const authors = $(entry).find('author').map((_, author) => $(author).find('name').text()).get();

      entries.push({
        id: $(entry).find('id').text().split('/abs/').pop(),
        title: $(entry).find('title').text().trim().replace(/\s+/g, ' '),
        summary: $(entry).find('summary').text().trim().replace(/\s+/g, ' '),
        authors: authors,
        publishedDate: $(entry).find('published').text(),
        updatedDate: $(entry).find('updated').text(),
        pdfLink: $(entry).find('link[title="pdf"]').attr('href'),
        primaryCategory: $(entry).find('arxiv\\:primary_category').attr('term'),
      });
    });

    return {
      totalItems: totalResults,
      data: entries,
    };
  }
}
```

### Cách sử dụng hàm này trong Controller

Trong controller, bạn sẽ gọi hàm `fetchPapersByTopics` này. Ví dụ, nếu bạn muốn lấy feed cá nhân hóa cho người dùng đã đăng nhập:

```typescript
// Trong feed.controller.ts
@UseGuards(JwtAuthGuard)
@Get()
async getMyFeed(@Req() req, @Query() paginationDto: PaginationDto) {
  // Giả sử bạn đã có hàm lấy danh sách topic yêu thích của user
  // Ví dụ: const preferredTopics = ['cs.AI', 'cs.LG'];
  const preferredTopics = await this.usersService.getPreferredTopicIds(req.user.id);

  if (preferredTopics.length === 0) {
    return { totalItems: 0, data: [] };
  }

  const feedData = await this.feedService.fetchPapersByTopics(preferredTopics, paginationDto);

  return {
    pagination: {
      page: paginationDto.page,
      limit: paginationDto.limit,
      totalItems: feedData.totalItems,
      totalPages: Math.ceil(feedData.totalItems / paginationDto.limit),
    },
    data: feedData.data,
  };
}
```

### Tóm lại

Để lấy paper mới từ nhiều topic, bạn chỉ cần:

1.  Lấy danh sách các topic ID (ví dụ: `['cs.AI', 'cs.CV']`).
2.  Chuyển nó thành một chuỗi query duy nhất: `cat:cs.AI OR cat:cs.CV`.
3.  Gửi chuỗi này vào tham số `search_query` của API arXiv, cùng với các tham số sắp xếp và phân trang.
4.  Xử lý kết quả XML trả về.