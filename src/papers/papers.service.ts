import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { In, Repository } from 'typeorm';
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
import { PaperDuplicatesService } from './paper-duplicates.service';
import { YouMightLikeQueryDto } from './dto/you-might-like-query.dto';
import { UserFavorite } from '../users/entities/user-favorite.entity';
import { UserPaperHistory } from '../users/entities/user-paper-history.entity';

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
    @InjectRepository(UserFavorite)
    private readonly favoriteRepository: Repository<UserFavorite>,
    @InjectRepository(UserPaperHistory)
    private readonly historyRepository: Repository<UserPaperHistory>,
    private readonly elasticsearchService: ElasticsearchService,
    private readonly paperDuplicatesService: PaperDuplicatesService,
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

  async getYouMightLike(userId: string, query: YouMightLikeQueryDto) {
    const paperTopics = this.normalizeTopicCodes(query.paperTopics);
    if (paperTopics.length === 0) {
      throw new BadRequestException(
        'paperTopics is required, for example: ?paperTopics=cs.AI,cs.AR',
      );
    }

    return this.buildYouMightLikeDetailResponse(userId, {
      ...query,
      paperTopics,
    });
  }

  private async buildYouMightLikeDetailResponse(
    userId: string,
    query: YouMightLikeQueryDto & { paperTopics: string[] },
  ) {
    const totalSize = query.size ?? 10;
    const paperTopicSize = Math.min(query.paperTopicSize ?? 8, totalSize);
    const userTopicSize = Math.min(query.userTopicSize ?? 2, totalSize - paperTopicSize);
    const topPaperTopics = query.topPaperTopics ?? 3;

    const userResolution = query.userTopics?.length
      ? { topicCodes: this.normalizeTopicCodes(query.userTopics), fallback: false }
      : await this.resolveUserTopicCodes(userId);
    const userTopicCodes = userResolution.topicCodes;
    const fallback = userResolution.fallback;

    const excludedArxivIds = await this.getRecommendationExcludedArxivIds(
      userId,
      query.excludeArxivId,
    );

    const peerTopicRanking = await this.rankTopicsByPeerUserFrequency(
      query.paperTopics,
      userId,
      topPaperTopics,
    );
    const selectedPeerTopics = peerTopicRanking.topics.map((item) => item.topic);

    const paperTopicPapers =
      paperTopicSize > 0 && selectedPeerTopics.length > 0
        ? await this.fetchYouMightLikeFromTopicsMixed(
            selectedPeerTopics,
            paperTopicSize,
            excludedArxivIds,
            userId,
            'peer_topic',
          )
        : [];

    const seen = new Set([
      ...excludedArxivIds,
      ...paperTopicPapers.map((paper) => String(paper.arxiv_id)),
    ]);

    const sampledUserTopics = this.sampleTopicsForCount(userTopicCodes, userTopicSize);
    const userTopicPapers =
      userTopicSize > 0 && sampledUserTopics.length > 0
        ? await this.fetchYouMightLikeFromTopicsMixed(
            sampledUserTopics,
            userTopicSize,
            [...seen],
            userId,
            'user_topic',
          )
        : [];

    const data = this.shuffleItems([...paperTopicPapers, ...userTopicPapers]).map((paper) => ({
      ...paper,
      source: 'elasticsearch',
    }));

    return {
      data,
      meta: {
        size: data.length,
        paperTopicSize: paperTopicPapers.length,
        userTopicSize: userTopicPapers.length,
        peerUserCount: peerTopicRanking.peerUserCount,
      },
      paperTopics: query.paperTopics,
      rankedPeerTopics: peerTopicRanking.topics,
      selectedPeerTopics,
      sampledUserTopics,
      userTopics: userTopicCodes,
      fallback,
    };
  }

  private normalizeTopicCodes(topicCodes?: string[]): string[] {
    return [
      ...new Set(
        (topicCodes ?? [])
          .map((code) => this.normalizeTopicCode(code))
          .filter(Boolean),
      ),
    ];
  }

  private normalizeTopicCode(code: string): string {
    const trimmed = code.trim();
    if (!trimmed) {
      return '';
    }

    const dotIndex = trimmed.indexOf('.');
    if (dotIndex > 0) {
      return `${trimmed.slice(0, dotIndex).toLowerCase()}${trimmed.slice(dotIndex)}`;
    }

    return trimmed.toLowerCase();
  }

  private sampleTopicsForCount(topicCodes: string[], count: number): string[] {
    if (topicCodes.length === 0 || count <= 0) {
      return [];
    }

    const shuffled = [...topicCodes].sort(() => Math.random() - 0.5);
    if (shuffled.length <= count) {
      return shuffled;
    }

    return shuffled.slice(0, count);
  }

  private shuffleItems<T>(items: T[]): T[] {
    return [...items].sort(() => Math.random() - 0.5);
  }

  private async rankTopicsByPeerUserFrequency(
    paperTopicCodes: string[],
    currentUserId: string,
    topN: number,
  ): Promise<{
    peerUserCount: number;
    topics: Array<{ topic: string; frequency: number }>;
  }> {
    const normalizedPaperTopics = this.normalizeTopicCodes(paperTopicCodes);
    if (normalizedPaperTopics.length === 0) {
      return { peerUserCount: 0, topics: [] };
    }

    const peerUserRows = await this.usersRepository
      .createQueryBuilder('user')
      .innerJoin('user.topics', 'overlapTopic')
      .where('user.id != :currentUserId', { currentUserId })
      .andWhere('overlapTopic.code IN (:...paperTopicCodes)', {
        paperTopicCodes: normalizedPaperTopics,
      })
      .select('user.id', 'id')
      .distinct(true)
      .getRawMany<{ id: string }>();

    const peerUserIds = peerUserRows.map((row) => row.id);
    if (peerUserIds.length === 0) {
      return {
        peerUserCount: 0,
        topics: normalizedPaperTopics.slice(0, topN).map((topic, index) => ({
          topic,
          frequency: normalizedPaperTopics.length - index,
        })),
      };
    }

    const peerUsers = await this.usersRepository.find({
      where: { id: In(peerUserIds) },
      relations: ['topics'],
    });

    const frequencyMap = new Map<string, number>();
    for (const peerUser of peerUsers) {
      for (const topic of peerUser.topics ?? []) {
        frequencyMap.set(topic.code, (frequencyMap.get(topic.code) ?? 0) + 1);
      }
    }

    const topics = [...frequencyMap.entries()]
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }
        return left[0].localeCompare(right[0]);
      })
      .slice(0, topN)
      .map(([topic, frequency]) => ({ topic, frequency }));

    return {
      peerUserCount: peerUserIds.length,
      topics,
    };
  }

  private async fetchYouMightLikeFromTopicsMixed(
    topicCodes: string[],
    size: number,
    excludedArxivIds: string[],
    userId: string,
    recommendationType: 'peer_topic' | 'user_topic',
  ) {
    if (topicCodes.length === 0 || size <= 0) {
      return [] as Record<string, any>[];
    }

    const shuffledTopics = [...topicCodes].sort(() => Math.random() - 0.5);
    const perTopic = Math.ceil(size / shuffledTopics.length);
    const seen = new Set(excludedArxivIds);
    const results: Record<string, any>[] = [];

    const topicResponses = await Promise.all(
      shuffledTopics.map((topic, index) =>
        this.elasticsearchService.search({
          index: 'papers',
          size: perTopic * 2,
          query: {
            function_score: {
              query: {
                bool: {
                  must: [{ term: { 'categories.keyword': topic } }],
                  must_not: [
                    ...this.buildFeedDuplicateMustNot(),
                    ...(seen.size > 0 ? [{ terms: { arxiv_id: [...seen] } }] : []),
                  ],
                },
              },
              functions: [{ random_score: { seed: this.buildPersonalizedRandomSeed(userId) + index + size } }],
              boost_mode: 'replace',
            },
          } as any,
        }),
      ),
    );

    const hitsPerTopic = topicResponses.map((response) => response.hits.hits);
    let round = 0;

    while (results.length < size) {
      let addedInRound = false;

      for (let topicIndex = 0; topicIndex < hitsPerTopic.length; topicIndex++) {
        if (results.length >= size) {
          break;
        }

        const hit = hitsPerTopic[topicIndex][round];
        if (!hit) {
          continue;
        }

        const src = hit._source as Record<string, any>;
        const arxivId = this.normalizeArxivId(String(src.arxiv_id));
        if (seen.has(arxivId)) {
          continue;
        }

        seen.add(arxivId);
        results.push({
          ...src,
          arxiv_id: arxivId,
          recommendation_type: recommendationType,
          matched_topic: shuffledTopics[topicIndex],
          es_score: hit._score,
        });
        addedInRound = true;
      }

      if (!addedInRound) {
        break;
      }

      round += 1;
    }

    return results;
  }

  private async getRecommendationExcludedArxivIds(
    userId: string,
    excludeArxivId?: string,
  ): Promise<string[]> {
    const [favorites, history] = await Promise.all([
      this.favoriteRepository.find({
        where: { user_id: userId },
        select: ['arxiv_id'],
      }),
      this.historyRepository.find({
        where: { user_id: userId },
        select: ['arxiv_id'],
      }),
    ]);

    const excluded = new Set<string>([
      ...favorites.map((item) => this.normalizeArxivId(item.arxiv_id)),
      ...history.map((item) => this.normalizeArxivId(item.arxiv_id)),
    ]);

    if (excludeArxivId) {
      excluded.add(this.normalizeArxivId(excludeArxivId));
    }

    return [...excluded];
  }

  private buildFeedDuplicateMustNot() {
    return [
      { term: { show_on_feed: false } },
      { exists: { field: 'duplicate_of_arxiv_id' } },
    ];
  }

  async searchElasticsearch(query: PaperFilterDto, userId?: string) {
    const { page, size, skip } = getPagination(query);
    let personalized = false;
    let fallback = false;
    let selectedTopics = query.topics ?? [];

    if (selectedTopics.length === 0 && userId) {
      const resolved = await this.resolveUserTopicCodes(userId);
      selectedTopics = resolved.topicCodes;
      fallback = resolved.fallback;
      personalized = true;
      query = { ...query, topics: selectedTopics };
    }

    const isFeedStyleQuery =
      selectedTopics.length > 0 &&
      !query.q &&
      !query.title &&
      !query.author &&
      query.sortBy !== 'score';

    const hideFeedDuplicates = isFeedStyleQuery;

    let result;
    if (isFeedStyleQuery && selectedTopics.length > 1) {
      result = await this.searchElasticsearchWithTopicMix(query, page, size, hideFeedDuplicates);
    } else if (isFeedStyleQuery && personalized) {
      result = await this.searchElasticsearchWithRandomScore(query, page, size, skip, userId, hideFeedDuplicates);
    } else {
      result = await this.searchElasticsearchSingleQuery(query, page, size, skip, hideFeedDuplicates);
    }

    return {
      ...result,
      personalized,
      fallback,
      selectedTopics,
    };
  }

  private async resolveUserTopicCodes(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['topics'],
    });

    if (!user) {
      throw new NotFoundException(`User #${userId} not found`);
    }

    let topicCodes = (user.topics ?? []).map((topic) => topic.code);
    let fallback = false;

    if (topicCodes.length === 0) {
      fallback = true;
      topicCodes = await this.getRandomTopicCodes(5);
    }

    return { topicCodes, fallback };
  }

  private buildPersonalizedRandomSeed(userId?: string): number {
    const day = new Date().toISOString().slice(0, 10);
    const input = `${userId ?? 'guest'}-${day}`;
    let hash = 0;

    for (let i = 0; i < input.length; i++) {
      hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }

    return hash;
  }

  private buildElasticsearchFilterQuery(query: PaperFilterDto, hideFeedDuplicates = false) {
    const must: any[] = [];
    const mustNot: any[] = [];

    if (query.topics && query.topics.length > 0) {
      must.push({
        terms: { 'categories.keyword': query.topics },
      });
    }

    if (query.q) {
      must.push({
        multi_match: {
          query: query.q,
          fields: ['title', 'authors'],
        },
      });
    }

    if (query.title) {
      must.push({
        match: { title: query.title },
      });
    }

    if (query.author) {
      must.push({
        match: { authors: query.author },
      });
    }

    if (hideFeedDuplicates) {
      mustNot.push({ term: { show_on_feed: false } });
      mustNot.push({ exists: { field: 'duplicate_of_arxiv_id' } });
    }

    if (must.length === 0 && mustNot.length === 0) {
      return { match_all: {} };
    }

    return {
      bool: {
        ...(must.length > 0 ? { must } : {}),
        ...(mustNot.length > 0 ? { must_not: mustNot } : {}),
      },
    };
  }

  private buildElasticsearchSort(query: PaperFilterDto): any[] {
    if (query.sortBy === 'score') {
      return [{ score: { order: 'desc' as const, unmapped_type: 'float' } }];
    }

    return [{ published_at: { order: 'desc' as const, unmapped_type: 'date' } }];
  }

  private mapElasticsearchHits(hits: any[]) {
    return hits.map((hit) => ({
      ...(hit._source as Record<string, any>),
      es_score: hit._score,
    }));
  }

  private getElasticsearchTotal(total: unknown): number {
    if (typeof total === 'number') {
      return total;
    }

    if (total && typeof total === 'object' && 'value' in total) {
      return (total as { value: number }).value;
    }

    return 0;
  }

  private async searchElasticsearchSingleQuery(
    query: PaperFilterDto,
    page: number,
    size: number,
    skip: number,
    hideFeedDuplicates = false,
  ) {
    try {
      const response = await this.elasticsearchService.search({
        index: 'papers',
        from: skip,
        size,
        query: this.buildElasticsearchFilterQuery(query, hideFeedDuplicates),
        sort: this.buildElasticsearchSort(query),
      });

      const total = this.getElasticsearchTotal(response.hits.total);
      const data = this.mapElasticsearchHits(response.hits.hits);

      return {
        data,
        meta: {
          page,
          size,
          total,
          totalPages: Math.ceil(total / size),
        },
      };
    } catch (error) {
      throw new InternalServerErrorException(`Elasticsearch search failed: ${error.message}`);
    }
  }

  private async searchElasticsearchWithRandomScore(
    query: PaperFilterDto,
    page: number,
    size: number,
    skip: number,
    userId?: string,
    hideFeedDuplicates = false,
  ) {
    const topics = query.topics ?? [];
    const seed = this.buildPersonalizedRandomSeed(userId) + page;
    const baseQuery = this.buildElasticsearchFilterQuery(query, hideFeedDuplicates);

    try {
      const response = await this.elasticsearchService.search({
        index: 'papers',
        from: skip,
        size,
        query: {
          function_score: {
            query: baseQuery,
            functions: [{ random_score: { seed } }],
            boost_mode: 'replace',
          },
        } as any,
      });

      const total = this.getElasticsearchTotal(response.hits.total);
      const data = this.mapElasticsearchHits(response.hits.hits);

      return {
        data,
        meta: {
          page,
          size,
          total,
          totalPages: Math.ceil(total / size),
        },
      };
    } catch (error) {
      throw new InternalServerErrorException(`Elasticsearch search failed: ${error.message}`);
    }
  }

  private async searchElasticsearchWithTopicMix(
    query: PaperFilterDto,
    page: number,
    size: number,
    hideFeedDuplicates = false,
  ) {
    const topics = [...(query.topics ?? [])].sort(() => Math.random() - 0.5);
    const perTopic = Math.ceil(size / topics.length);
    const skipPerTopic = (page - 1) * perTopic;
    const fetchSize = perTopic * 2;

    try {
      const [topicResponses, countResponse] = await Promise.all([
        Promise.all(
          topics.map((topic) =>
            this.elasticsearchService.search({
              index: 'papers',
              from: skipPerTopic,
              size: fetchSize,
              query: hideFeedDuplicates
                ? {
                    bool: {
                      must: [{ term: { 'categories.keyword': topic } }],
                      must_not: [
                        { term: { show_on_feed: false } },
                        { exists: { field: 'duplicate_of_arxiv_id' } },
                      ],
                    },
                  }
                : {
                    term: { 'categories.keyword': topic },
                  },
              sort: [{ published_at: { order: 'desc', unmapped_type: 'date' } }],
            }),
          ),
        ),
        this.elasticsearchService.count({
          index: 'papers',
          query: hideFeedDuplicates
            ? {
                bool: {
                  must: [{ terms: { 'categories.keyword': topics } }],
                  must_not: [
                    { term: { show_on_feed: false } },
                    { exists: { field: 'duplicate_of_arxiv_id' } },
                  ],
                },
              }
            : { terms: { 'categories.keyword': topics } },
        }),
      ]);

      const hitsPerTopic = topicResponses.map((response) => response.hits.hits);
      const seen = new Set<string>();
      const data: Record<string, any>[] = [];

      let round = 0;
      while (data.length < size) {
        let addedInRound = false;

        for (const hits of hitsPerTopic) {
          if (data.length >= size) {
            break;
          }

          const hit = hits[round];
          if (!hit) {
            continue;
          }

          const arxivId = (hit._source as Record<string, any>)?.arxiv_id;
          if (!arxivId || seen.has(arxivId)) {
            continue;
          }

          seen.add(arxivId);
          data.push({
            ...(hit._source as Record<string, any>),
            es_score: hit._score,
          });
          addedInRound = true;
        }

        if (!addedInRound) {
          break;
        }

        round += 1;
      }

      const total = countResponse.count ?? 0;

      return {
        data,
        meta: {
          page,
          size,
          total,
          totalPages: Math.ceil(total / size),
        },
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

    const normalizedIds = arxivIds.map((id) => this.normalizeArxivId(id));

    try {
      const response = await this.elasticsearchService.search({
        index: 'papers',
        size: normalizedIds.length,
        query: {
          terms: { arxiv_id: normalizedIds },
        },
      });

      const map = new Map<string, any>();
      for (const hit of response.hits.hits) {
        const src = hit._source as Record<string, any>;
        map.set(src['arxiv_id'], { ...src, es_score: hit._score, source: 'elasticsearch' });
      }

      return normalizedIds.map((id) => map.get(id)).filter(Boolean);
    } catch (error) {
      throw new InternalServerErrorException(`Elasticsearch fetch by arxiv ids failed: ${error.message}`);
    }
  }

  async getElasticsearchPaperByArxivId(arxivId: string) {
    const normalizedArxivId = this.normalizeArxivId(arxivId);

    try {
      const doc = await this.elasticsearchService.get({
        index: 'papers',
        id: normalizedArxivId,
      });

      return {
        ...(doc._source as Record<string, any>),
        source: 'elasticsearch',
      };
    } catch {
      const [paper] = await this.getElasticsearchPapersByArxivIds([normalizedArxivId]);
      return paper ?? null;
    }
  }

  async findOneFromElasticsearch(arxivId: string) {
    const normalizedArxivId = this.normalizeArxivId(arxivId);

    const esPaper = await this.getElasticsearchPaperByArxivId(normalizedArxivId);
    if (esPaper) {
      const similarCount = await this.paperDuplicatesService.countSimilarPapers(normalizedArxivId);
      return { ...esPaper, similarCount };
    }

    const livePaper = await this.fetchArxivPaperDetail(normalizedArxivId);
    if (livePaper) {
      const similarCount = await this.paperDuplicatesService.countSimilarPapers(normalizedArxivId);
      return { ...livePaper, similarCount };
    }

    throw new NotFoundException(`Paper ${arxivId} not found`);
  }

  getSimilarPapers(arxivId: string, limit = 10) {
    return this.paperDuplicatesService.getSimilarPapers(arxivId, limit);
  }

  async findOne(id: string) {
    const trimmedId = id.trim();
    const arxivId = this.normalizeArxivId(trimmedId);
    const paperRelations = ['paperTopics', 'paperTopics.topic', 'versions'] as const;

    if (this.isUuid(trimmedId)) {
      const paperByUuid = await this.papersRepository.findOne({
        where: { id: trimmedId },
        relations: [...paperRelations],
      });
      if (paperByUuid) {
        return { ...paperByUuid, source: 'database' };
      }
    }

    const paperByArxivId = await this.papersRepository.findOne({
      where: { arxiv_id: arxivId },
      relations: [...paperRelations],
    });
    if (paperByArxivId) {
      return { ...paperByArxivId, source: 'database' };
    }

    const esPaper = await this.getElasticsearchPaperByArxivId(arxivId);
    if (esPaper) {
      return esPaper;
    }

    const livePaper = await this.fetchArxivPaperDetail(arxivId);
    if (livePaper) {
      return livePaper;
    }

    throw new NotFoundException(`Paper ${id} not found`);
  }

  private async findDatabasePaper(identifier: string): Promise<Paper> {
    const trimmedId = identifier.trim();
    const arxivId = this.normalizeArxivId(trimmedId);
    const relations = ['paperTopics', 'paperTopics.topic', 'versions'] as const;

    if (this.isUuid(trimmedId)) {
      const paperByUuid = await this.papersRepository.findOne({
        where: { id: trimmedId },
        relations: [...relations],
      });
      if (paperByUuid) {
        return paperByUuid;
      }
    }

    const paperByArxivId = await this.papersRepository.findOne({
      where: { arxiv_id: arxivId },
      relations: [...relations],
    });
    if (paperByArxivId) {
      return paperByArxivId;
    }

    throw new NotFoundException(`Paper ${identifier} not found in database`);
  }

  private normalizeArxivId(value: string): string {
    return value.trim().replace(/v\d+$/i, '');
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private async fetchArxivPaperDetail(arxivId: string) {
    const url = new URL(this.arxivApiUrl);
    url.searchParams.set('id_list', arxivId);

    let xml: string;
    try {
      xml = await this.fetchTextWithTimeout(url.toString());
    } catch {
      return null;
    }

    const parsed = this.parseArxivXml(xml);
    if (parsed.data.length === 0) {
      return null;
    }

    const arxivPaper = parsed.data[0];

    return {
      arxiv_id: arxivPaper.arxiv_id,
      title: arxivPaper.title,
      abstract: arxivPaper.summary,
      authors: arxivPaper.authors,
      categories: arxivPaper.allCategories,
      primary_category: arxivPaper.primaryCategory,
      pdf_url: arxivPaper.pdfLink || `https://arxiv.org/pdf/${arxivPaper.arxiv_id}.pdf`,
      published_at: arxivPaper.publishedDate,
      updated_at: arxivPaper.updatedDate,
      source: 'arxiv',
    };
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
    const paper = await this.findDatabasePaper(id);
    this.papersRepository.merge(paper, updatePaperDto);
    return this.papersRepository.save(paper);
  }

  async remove(id: string) {
    const paper = await this.findDatabasePaper(id);
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
    const paper = await this.findDatabasePaper(id);
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
    const paper = await this.findDatabasePaper(paperId);
    const version = this.versionsRepository.create({ ...dto, paper_id: paper.id });
    return this.versionsRepository.save(version);
  }

  async getVersions(paperId: string, query: PaginationQueryDto) {
    const paper = await this.findDatabasePaper(paperId);
    const { page, size, skip, take } = getPagination(query);
    const [data, total] = await this.versionsRepository.findAndCount({
      where: { paper_id: paper.id },
      order: { version_number: 'ASC' },
      skip,
      take,
    });

    return toPaginatedResponse(data, total, page, size);
  }

  // --- Topics ---
  async addTopic(paperId: string, dto: AddPaperTopicDto) {
    const paper = await this.findDatabasePaper(paperId);
    const paperTopic = this.paperTopicsRepository.create({ paper_id: paper.id, ...dto });
    return this.paperTopicsRepository.save(paperTopic);
  }

  async removeTopic(paperId: string, topicId: number) {
    const paper = await this.findDatabasePaper(paperId);
    const pt = await this.paperTopicsRepository.findOneBy({ paper_id: paper.id, topic_id: topicId });
    if (!pt) throw new NotFoundException(`Topic #${topicId} not linked to Paper #${paper.id}`);
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
