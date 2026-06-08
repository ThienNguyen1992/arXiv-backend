import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';

@Injectable()
export class StatisticsService {
  constructor(private readonly elasticsearchService: ElasticsearchService) {}

  // ==========================================
  // I. TRENDS DASHBOARD (Visualization)
  // ==========================================

  async getTopicVelocity(topics?: string[], interval: string = 'month') {
    try {
      const mustClauses: any[] = [];
      if (topics && topics.length > 0) {
        mustClauses.push({ terms: { 'categories.keyword': topics } });
      }

      const response = await this.elasticsearchService.search({
        index: 'papers',
        size: 0,
        query: mustClauses.length > 0 ? { bool: { must: mustClauses } } : { match_all: {} },
        aggs: {
          topics: {
            terms: { field: 'categories.keyword', size: 10 },
            aggs: {
              timeline: {
                date_histogram: { field: 'published_at', calendar_interval: interval, min_doc_count: 0 }
              }
            }
          }
        }
      } as any);

      const buckets = (response.aggregations as any)?.topics?.buckets || [];
      const result = buckets.map((b: any) => ({
        topic: b.key,
        total: b.doc_count,
        timeline: (b.timeline?.buckets || []).map((tb: any) => ({
          date: tb.key_as_string,
          count: tb.doc_count
        }))
      }));

      return result;
    } catch (error: any) {
      throw new InternalServerErrorException(`ES Error: ${error.message}`);
    }
  }

  async getHotKeywordsCloud(days: number = 30, size: number = 50) {
    try {
      const date = new Date();
      date.setDate(date.getDate() - days);
      const fromDate = date.toISOString();

      const response = await this.elasticsearchService.search({
        index: 'papers',
        size: 0,
        query: {
          range: { published_at: { gte: fromDate } }
        },
        aggs: {
          hot_keywords: {
            significant_text: { field: 'abstract', size }
          }
        }
      } as any);

      const buckets = (response.aggregations as any)?.hot_keywords?.buckets || [];
      return buckets.map((b: any) => ({
        text: b.key,
        value: b.score
      }));
    } catch (error: any) {
      throw new InternalServerErrorException(`ES Error: ${error.message}`);
    }
  }

  async getActivityHeatmap(limit: number = 10) {
    try {
      const response = await this.elasticsearchService.search({
        index: 'papers',
        size: 0,
        aggs: {
          topics1: {
            terms: { field: 'categories.keyword', size: limit },
            aggs: {
              topics2: {
                terms: { field: 'categories.keyword', size: limit }
              }
            }
          }
        }
      } as any);

      const matrix: any[] = [];
      const buckets = (response.aggregations as any)?.topics1?.buckets || [];
      
      buckets.forEach((b1: any) => {
        const t1 = b1.key;
        (b1.topics2?.buckets || []).forEach((b2: any) => {
          const t2 = b2.key;
          if (t1 !== t2) {
            matrix.push({ source: t1, target: t2, value: b2.doc_count });
          }
        });
      });

      return matrix;
    } catch (error: any) {
      throw new InternalServerErrorException(`ES Error: ${error.message}`);
    }
  }

  async getCategoryRace(interval: string = 'year') {
    try {
      const response = await this.elasticsearchService.search({
        index: 'papers',
        size: 0,
        aggs: {
          timeline: {
            date_histogram: { field: 'published_at', calendar_interval: interval, min_doc_count: 0 },
            aggs: {
              topics: {
                terms: { field: 'categories.keyword', size: 10 }
              }
            }
          }
        }
      } as any);

      const buckets = (response.aggregations as any)?.timeline?.buckets || [];
      const raceData = buckets.map((b: any) => {
        const obj: any = { date: b.key_as_string };
        (b.topics?.buckets || []).forEach((tb: any) => {
          obj[tb.key] = tb.doc_count;
        });
        return obj;
      });

      return raceData;
    } catch (error: any) {
      throw new InternalServerErrorException(`ES Error: ${error.message}`);
    }
  }

  // ==========================================
  // II. LEADERBOARD
  // ==========================================

  private getTimeFilterClause(timeframe: string) {
    const date = new Date();
    if (timeframe === 'today') date.setDate(date.getDate() - 1);
    else if (timeframe === 'week') date.setDate(date.getDate() - 7);
    else if (timeframe === 'month') date.setMonth(date.getMonth() - 1);
    else return null;

    return { range: { published_at: { gte: date.toISOString() } } };
  }

  async getTrendingPapers(timeframe: string = 'month', limit: number = 10) {
    try {
      const mustClauses: any[] = [];
      const timeFilter = this.getTimeFilterClause(timeframe);
      if (timeFilter) mustClauses.push(timeFilter);

      const response = await this.elasticsearchService.search({
        index: 'papers',
        size: limit,
        query: mustClauses.length > 0 ? { bool: { must: mustClauses } } : { match_all: {} },
        sort: [
          { score: { order: 'desc' } },
          { published_at: { order: 'desc' } }
        ]
      });

      return response.hits.hits.map(h => h._source);
    } catch (error: any) {
      throw new InternalServerErrorException(`ES Error: ${error.message}`);
    }
  }

  async getTopAuthors(timeframe: string = 'all', limit: number = 10) {
    try {
      const mustClauses: any[] = [];
      const timeFilter = this.getTimeFilterClause(timeframe);
      if (timeFilter) mustClauses.push(timeFilter);

      const response = await this.elasticsearchService.search({
        index: 'papers',
        size: 0,
        query: mustClauses.length > 0 ? { bool: { must: mustClauses } } : { match_all: {} },
        aggs: {
          authors: {
            terms: { field: 'authors.keyword', size: limit },
            aggs: {
              total_score: { sum: { field: 'score' } }
            }
          }
        }
      } as any);

      const buckets = (response.aggregations as any)?.authors?.buckets || [];
      return buckets.map((b: any) => ({
        author: b.key,
        paperCount: b.doc_count,
        totalScore: b.total_score?.value || 0
      }));
    } catch (error: any) {
      throw new InternalServerErrorException(`ES Error: ${error.message}`);
    }
  }

  async getRisingTopics(timeframe: string = 'month', limit: number = 10) {
    try {
      const date = new Date();
      if (timeframe === 'week') date.setDate(date.getDate() - 7);
      else if (timeframe === 'month') date.setMonth(date.getMonth() - 1);
      else date.setFullYear(date.getFullYear() - 1);

      const thresholdDate = date.toISOString();

      const response = await this.elasticsearchService.search({
        index: 'papers',
        size: 0,
        aggs: {
          topics: {
            terms: { field: 'categories.keyword', size: limit * 5 },
            aggs: {
              recent: {
                filter: { range: { published_at: { gte: thresholdDate } } }
              },
              old: {
                filter: { range: { published_at: { lt: thresholdDate } } }
              }
            }
          }
        }
      } as any);

      const buckets = (response.aggregations as any)?.topics?.buckets || [];
      const result: any[] = [];

      buckets.forEach((b: any) => {
        const topic = b.key;
        const recentCount = b.recent?.doc_count || 0;
        const oldCount = b.old?.doc_count || 0;
        
        let growthRate = 0;
        if (oldCount > 0) {
          growthRate = ((recentCount - oldCount) / oldCount) * 100;
        } else if (recentCount > 0) {
          growthRate = 100;
        }

        if (recentCount > 0) {
          result.push({
            topic,
            currentCount: recentCount,
            previousCount: oldCount,
            growthRate: growthRate.toFixed(2) + '%'
          });
        }
      });

      return result.sort((a, b) => parseFloat(b.growthRate) - parseFloat(a.growthRate)).slice(0, limit);
    } catch (error: any) {
      throw new InternalServerErrorException(`ES Error: ${error.message}`);
    }
  }
}
