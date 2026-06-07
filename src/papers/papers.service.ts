import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { Repository } from 'typeorm';
import { CreatePaperDto } from './dto/create-paper.dto';
import { UpdatePaperDto } from './dto/update-paper.dto';
import { CreatePaperVersionDto } from './dto/create-paper-version.dto';
import { AddPaperTopicDto } from './dto/add-paper-topic.dto';
import { Paper } from './entities/paper.entity';
import { PaperVersion } from './entities/paper-version.entity';
import { PaperTopic } from './entities/paper-topic.entity';
import { PaperFilterDto } from './dto/paper-filter.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { getPagination, toPaginatedResponse } from '../common/pagination';
import { ArxivPapersQueryDto } from './dto/arxiv-papers-query.dto';
import { ArxivTimeQueryDto } from './dto/arxiv-time-query.dto';
import { User } from '../users/entities/user.entity';
import { Topic } from '../topics/entities/topic.entity';
import { PaperScorer, PaperScoringInput } from '../common/utils/paper-score.util';

export interface ArxivPaperDto {
  id: string;
  arxiv_id: string;
  title: string;
  summary: string;
  authors: string[];
  pdfLink: string | null;
  abstractLink: string | null;
  publishedDate: string | null;
  updatedDate: string | null;
  primaryCategory: string | null;
  allCategories: string[];
}

@Injectable()
export class PapersService {
  private readonly arxivApiUrl = 'https://export.arxiv.org/api/query';

  constructor(
    @InjectRepository(Paper)
    private readonly papersRepository: Repository<Paper>,
    @InjectRepository(PaperVersion)
    private readonly versionsRepository: Repository<PaperVersion>,
    @InjectRepository(PaperTopic)
    private readonly paperTopicsRepository: Repository<PaperTopic>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Topic)
    private readonly topicsRepository: Repository<Topic>,
    private readonly elasticsearchService: ElasticsearchService,
  ) {}

  create(createPaperDto: CreatePaperDto) {
    const paper = this.papersRepository.create(createPaperDto);
    return this.papersRepository.save(paper);
  }

  async findAll(query: PaperFilterDto) {
    const { page, size, skip, take } = getPagination(query);

    const qb = this.papersRepository.createQueryBuilder('paper')
      .leftJoinAndSelect('paper.paperTopics', 'paperTopics')
      .leftJoinAndSelect('paperTopics.topic', 'topic')
      .leftJoinAndSelect('topic.category', 'category');

    if (query.topics && query.topics.length > 0) {
      qb.innerJoin('paper.paperTopics', 'pt_filter')
        .innerJoin('pt_filter.topic', 't_filter')
        .andWhere('t_filter.code IN (:...topicCodes)', { topicCodes: query.topics });
    }

    if (query.q) {
      qb.andWhere('(paper.title ILIKE :q OR paper.authors ILIKE :q)', { q: `%${query.q}%` });
    }

    if (query.title) {
      qb.andWhere('paper.title ILIKE :title', { title: `%${query.title}%` });
    }

    if (query.author) {
      qb.andWhere('paper.authors ILIKE :author', { author: `%${query.author}%` });
    }

    qb.orderBy('paper.published_at', 'DESC')
      .addOrderBy('paper.created_at', 'DESC')
      .skip(skip)
      .take(take);

    const [data, total] = await qb.getManyAndCount();

    return toPaginatedResponse(data, total, page, size);
  }

  async searchElasticsearch(query: PaperFilterDto) {
    const { page, size, skip } = getPagination(query);

    const must: any[] = [];

    if (query.topics && query.topics.length > 0) {
      const topicsQuery = query.topics.join(' ');
      must.push({
        match: { categories: topicsQuery }
      });
    }

    if (query.q) {
      must.push({
        multi_match: {
          query: query.q,
          fields: ['title', 'authors']
        }
      });
    }

    if (query.title) {
      must.push({
        match: { title: query.title }
      });
    }

    if (query.author) {
      must.push({
        match: { authors: query.author }
      });
    }

    const esQuery = must.length > 0 ? { bool: { must } } : { match_all: {} };

    const sort: any[] = [];
    if (query.sortBy === 'score') {
      sort.push({ score: { order: 'desc', unmapped_type: 'float' } });
    } else {
      sort.push({ published_at: { order: 'desc', unmapped_type: 'date' } });
    }

    try {
      const response = await this.elasticsearchService.search({
        index: 'papers',
        from: skip,
        size: size,
        query: esQuery,
        sort: sort
      });

      const total = response.hits.total ? (typeof response.hits.total === 'number' ? response.hits.total : response.hits.total.value) : 0;
      const data = response.hits.hits.map(hit => ({
        ...(hit._source as Record<string, any>),
        es_score: hit._score,
      }));

      return {
        data,
        meta: {
          page,
          size,
          total,
          totalPages: Math.ceil(total / size),
        }
      };
    } catch (error) {
      throw new InternalServerErrorException(`Elasticsearch search failed: ${error.message}`);
    }
  }

  /**
   * Fetch a list of papers from Elasticsearch by a list of arxiv_ids.
   * Preserves the input order (e.g. most-recently-favorited first).
   */
  async getElasticsearchPapersByArxivIds(arxivIds: string[]): Promise<any[]> {
    if (!arxivIds || arxivIds.length === 0) return [];

    try {
      const response = await this.elasticsearchService.search({
        index: 'papers',
        size: arxivIds.length,
        query: {
          terms: { arxiv_id: arxivIds },
        },
      });

      // Build a map for O(1) lookup so we can return in original order
      const map = new Map<string, any>();
      for (const hit of response.hits.hits) {
        const src = hit._source as Record<string, any>;
        map.set(src['arxiv_id'], { ...src, es_score: hit._score });
      }

      return arxivIds.map(id => map.get(id)).filter(Boolean);
    } catch (error) {
      throw new InternalServerErrorException(`Elasticsearch fetch by arxiv ids failed: ${error.message}`);
    }
  }

  async findOne(id: string) {
    const paper = await this.papersRepository.findOne({
      where: { id },
      relations: ['paperTopics', 'paperTopics.topic', 'versions'],
    });
    if (!paper) throw new NotFoundException(`Paper #${id} not found`);
    return paper;
  }

  async fetchArxivPapersByTopicsQuery(query: ArxivPapersQueryDto) {
    const topicCodes = this.parseTopicCodes(query.topics);
    if (topicCodes.length === 0) {
      throw new BadRequestException('topics query is required, for example: cs.AI,cs.CV');
    }

    return this.fetchArxivPapersByTopicCodes(topicCodes, query);
  }

  async fetchArxivPapersByTimeRange(query: ArxivTimeQueryDto) {
    const { page, size, skip } = getPagination(query);
    const startFormatted = query.startDate.replace(/-/g, '') + '000000';
    const endFormatted = query.endDate.replace(/-/g, '') + '235959';
    const searchQuery = `submittedDate:[${startFormatted} TO ${endFormatted}]`;
    const url = new URL(this.arxivApiUrl);
    url.searchParams.set('search_query', searchQuery);
    url.searchParams.set('sortBy', 'submittedDate');
    url.searchParams.set('sortOrder', 'descending');
    url.searchParams.set('start', String(skip));
    url.searchParams.set('max_results', String(size));

    let xml: string;
    try {
      xml = await this.fetchTextWithTimeout(url.toString());
    } catch (error) {
      const message = error instanceof Error ? this.formatErrorMessage(error) : 'unknown error';
      throw new InternalServerErrorException(`Could not fetch arXiv papers by time range: ${message}`);
    }

    const parsed = this.parseArxivXml(xml);

    return {
      data: parsed.data,
      meta: {
        page,
        size,
        total: parsed.total,
        totalPages: Math.ceil(parsed.total / size),
      },
      source: url.toString(),
      timeRange: { startDate: query.startDate, endDate: query.endDate },
    };
  }

  async fetchArxivFeedForUser(userId: string, query: PaginationQueryDto) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['topics'],
    });
    console.log("🚀 ~ PapersService ~ fetchArxivFeedForUser ~ user:", user)

    if (!user) {
      throw new NotFoundException(`User #${userId} not found`);
    }

    let topicCodes = (user.topics ?? []).map((topic) => topic.code);
    let fallback = false;

    if (topicCodes.length === 0) {
      fallback = true;
      topicCodes = await this.getRandomTopicCodes(5);
      console.log("🚀 ~ PapersService ~ fetchArxivFeedForUser ~ topicCodes:", topicCodes)
    }

    const result = await this.fetchArxivPapersByTopicCodes(topicCodes, query);

    return {
      ...result,
      fallback,
      selectedTopics: topicCodes,
    };
  }

  async update(id: string, updatePaperDto: UpdatePaperDto) {
    const paper = await this.findOne(id);
    this.papersRepository.merge(paper, updatePaperDto);
    return this.papersRepository.save(paper);
  }

  async remove(id: string) {
    const paper = await this.findOne(id);
    return this.papersRepository.remove(paper);
  }

  async findOrCreateByArxivId(arxivId: string) {
    let paper = await this.papersRepository.findOne({ where: { arxiv_id: arxivId } });
    if (paper) {
      return paper;
    }

    // Fetch from arxiv
    const url = new URL(this.arxivApiUrl);
    url.searchParams.set('id_list', arxivId);
    let xml: string;
    try {
      xml = await this.fetchTextWithTimeout(url.toString());
    } catch (error) {
      throw new BadRequestException(`Không thể lấy thông tin paper từ arXiv (ID: ${arxivId}). Lỗi: ${error.message}`);
    }

    const parsed = this.parseArxivXml(xml);
    if (parsed.data.length === 0) {
      throw new NotFoundException(`Không tìm thấy paper với arxiv_id ${arxivId} trên arXiv`);
    }

    const arxivPaper = parsed.data[0];
    paper = this.papersRepository.create({
      arxiv_id: arxivPaper.arxiv_id,
      title: arxivPaper.title,
      abstract: arxivPaper.summary,
      pdf_url: arxivPaper.pdfLink || `https://arxiv.org/pdf/${arxivPaper.arxiv_id}.pdf`,
      authors: arxivPaper.authors.join(', '),
      published_at: arxivPaper.publishedDate ? new Date(arxivPaper.publishedDate) : new Date(),
    });

    return this.papersRepository.save(paper);
  }

  async calculateScoreForPaper(id: string) {
    const paper = await this.findOne(id);
    const scorer = new PaperScorer();
    
    const input: PaperScoringInput = {
      published_date: paper.published_at,
      updated_date: paper.updated_at,
      journal_ref: paper.journal_ref,
      abstract: paper.abstract,
      comments: paper.comments,
      version: paper.current_version,
      authors: [],
    };

    const result = scorer.calculateScore(input);
    paper.score = result.total_score;
    await this.papersRepository.save(paper);
    
    return { paper_id: paper.id, score_details: result };
  }

  async calculateScoresForAllPapers() {
    const papers = await this.papersRepository.find({
      relations: ['versions'],
    });

    const scorer = new PaperScorer();
    let updatedCount = 0;

    for (const paper of papers) {
      const input: PaperScoringInput = {
        published_date: paper.published_at,
        updated_date: paper.updated_at,
        journal_ref: paper.journal_ref,
        abstract: paper.abstract,
        comments: paper.comments,
        version: paper.current_version,
        authors: [],
      };

      const result = scorer.calculateScore(input);
      paper.score = result.total_score;
      await this.papersRepository.save(paper);
      updatedCount++;
    }

    return { message: `Successfully updated scores for ${updatedCount} papers` };
  }

  // --- Versions ---
  async addVersion(paperId: string, dto: CreatePaperVersionDto) {
    await this.findOne(paperId); // ensure paper exists
    const version = this.versionsRepository.create({ ...dto, paper_id: paperId });
    return this.versionsRepository.save(version);
  }

  async getVersions(paperId: string, query: PaginationQueryDto) {
    await this.findOne(paperId);
    const { page, size, skip, take } = getPagination(query);
    const [data, total] = await this.versionsRepository.findAndCount({
      where: { paper_id: paperId },
      order: { version_number: 'ASC' },
      skip,
      take,
    });

    return toPaginatedResponse(data, total, page, size);
  }

  // --- Topics ---
  async addTopic(paperId: string, dto: AddPaperTopicDto) {
    await this.findOne(paperId);
    const paperTopic = this.paperTopicsRepository.create({ paper_id: paperId, ...dto });
    return this.paperTopicsRepository.save(paperTopic);
  }

  async removeTopic(paperId: string, topicId: number) {
    const pt = await this.paperTopicsRepository.findOneBy({ paper_id: paperId, topic_id: topicId });
    if (!pt) throw new NotFoundException(`Topic #${topicId} not linked to Paper #${paperId}`);
    return this.paperTopicsRepository.remove(pt);
  }

  private async fetchArxivPapersByTopicCodes(topicCodes: string[], query: PaginationQueryDto) {
    const { page, size, skip } = getPagination(query);
    const searchQuery = topicCodes.map((topicCode) => `cat:${topicCode}`).join(' OR ');
    const url = new URL(this.arxivApiUrl);
    url.searchParams.set('search_query', searchQuery);
    url.searchParams.set('sortBy', 'submittedDate');
    url.searchParams.set('sortOrder', 'descending');
    url.searchParams.set('start', String(skip));
    url.searchParams.set('max_results', String(size));

    let xml: string;
    try {
      xml = await this.fetchTextWithTimeout(url.toString());
    } catch (error) {
      const message = error instanceof Error ? this.formatErrorMessage(error) : 'unknown error';
      throw new InternalServerErrorException(`Could not fetch arXiv papers: ${message}`);
    }

    const parsed = this.parseArxivXml(xml);

    return {
      data: parsed.data,
      meta: {
        page,
        size,
        total: parsed.total,
        totalPages: Math.ceil(parsed.total / size),
      },
      source: url.toString(),
      selectedTopics: topicCodes,
    };
  }

  private async fetchTextWithTimeout(url: string, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'NMCNPM backend/1.0 (arXiv paper feed)',
        },
      });

      if (!response.ok) {
        throw new Error(`arXiv returned ${response.status}`);
      }

      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  parseArxivXml(xml: string): { total: number; data: ArxivPaperDto[] } {
    const total = Number(this.getTagText(xml, 'opensearch:totalResults')) || 0;
    const data: ArxivPaperDto[] = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let entryMatch: RegExpExecArray | null;

    while ((entryMatch = entryRegex.exec(xml)) !== null) {
      const entry = entryMatch[1];
      const idUrl = this.getTagText(entry, 'id');
      const id = this.arxivIdFromUrl(idUrl);
      const links = this.getLinkAttributes(entry);
      const primaryCategory = this.getPrimaryCategory(entry);
      const allCategories = this.unique([
        primaryCategory,
        ...this.getCategoryTerms(entry),
      ].filter(Boolean) as string[]);

      data.push({
        id,
        arxiv_id: id.replace(/v\d+$/, ''),
        title: this.normalizeText(this.getTagText(entry, 'title')),
        summary: this.normalizeText(this.getTagText(entry, 'summary')),
        authors: this.getAuthors(entry),
        pdfLink: links.find((link) => link.title === 'pdf')?.href ?? null,
        abstractLink: links.find((link) => link.rel === 'alternate')?.href ?? idUrl,
        publishedDate: this.getTagText(entry, 'published') || null,
        updatedDate: this.getTagText(entry, 'updated') || null,
        primaryCategory,
        allCategories,
      });
    }

    return { total, data };
  }

  private parseTopicCodes(topics?: string): string[] {
    return this.unique(
      (topics ?? '')
        .split(',')
        .map((topic) => topic.trim())
        .filter(Boolean),
    );
  }

  private async getRandomTopicCodes(count: number) {
    const topics = await this.topicsRepository.find({
      select: ['code'],
      where: { is_active: true },
    });

    return topics
      .map((topic) => topic.code)
      .sort(() => Math.random() - 0.5)
      .slice(0, count);
  }

  private getTagText(xml: string, tagName: string): string {
    const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, 'i');
    const match = xml.match(regex);

    return match ? this.decodeXmlEntities(match[1].trim()) : '';
  }

  private getAuthors(entry: string): string[] {
    const authors: string[] = [];
    const authorRegex = /<author>([\s\S]*?)<\/author>/g;
    let authorMatch: RegExpExecArray | null;

    while ((authorMatch = authorRegex.exec(entry)) !== null) {
      const name = this.normalizeText(this.getTagText(authorMatch[1], 'name'));
      if (name) {
        authors.push(name);
      }
    }

    return authors;
  }

  private getLinkAttributes(entry: string): Array<Record<string, string>> {
    const links: Array<Record<string, string>> = [];
    const linkRegex = /<link\b([^>]*)\/?>/g;
    let linkMatch: RegExpExecArray | null;

    while ((linkMatch = linkRegex.exec(entry)) !== null) {
      links.push(this.getAttributes(linkMatch[1]));
    }

    return links;
  }

  private getPrimaryCategory(entry: string): string | null {
    const match = entry.match(/<arxiv:primary_category\b([^>]*)\/?>/i);
    if (!match) {
      return null;
    }

    return this.getAttributes(match[1]).term ?? null;
  }

  private getCategoryTerms(entry: string): string[] {
    const categories: string[] = [];
    const categoryRegex = /<category\b([^>]*)\/?>/g;
    let categoryMatch: RegExpExecArray | null;

    while ((categoryMatch = categoryRegex.exec(entry)) !== null) {
      const term = this.getAttributes(categoryMatch[1]).term;
      if (term) {
        categories.push(term);
      }
    }

    return categories;
  }

  private getAttributes(value: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const attrRegex = /([\w:-]+)="([^"]*)"/g;
    let attrMatch: RegExpExecArray | null;

    while ((attrMatch = attrRegex.exec(value)) !== null) {
      attributes[attrMatch[1]] = this.decodeXmlEntities(attrMatch[2]);
    }

    return attributes;
  }

  private arxivIdFromUrl(value: string): string {
    return value.split('/abs/').pop() ?? value;
  }

  private normalizeText(value: string): string {
    return this.decodeXmlEntities(value).replace(/\s+/g, ' ').trim();
  }

  private decodeXmlEntities(value: string): string {
    return value
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'");
  }

  private unique<T>(values: T[]): T[] {
    return [...new Set(values)];
  }

  private formatErrorMessage(error: Error): string {
    const cause = error.cause;
    if (cause instanceof Error) {
      return `${error.message}: ${cause.message}`;
    }
    if (cause && typeof cause === 'object' && 'code' in cause) {
      return `${error.message}: ${(cause as any).code}`;
    }

    return error.message;
  }
}
