import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';

@Injectable()
export class StatisticsService {
  constructor(private readonly elasticsearchService: ElasticsearchService) {}

  async getOverview() {
    try {
      const response = await this.elasticsearchService.search({
        index: 'papers',
        size: 0,
        aggs: {
          primary_categories: {
            terms: {
              field: 'primary_category.keyword',
              size: 20
            }
          },
          min_date: {
            min: { field: 'published_at' }
          },
          max_date: {
            max: { field: 'published_at' }
          }
        }
      } as any);

      const total = response.hits.total ? (typeof response.hits.total === 'number' ? response.hits.total : (response.hits.total as any).value) : 0;
      const buckets = (response.aggregations as any)?.primary_categories?.buckets || [];
      
      const topCategories = buckets.map((b: any) => ({
        category: b.key,
        count: b.doc_count,
        percentage: total > 0 ? ((b.doc_count / total) * 100).toFixed(2) : 0
      }));

      return {
        total_papers: total,
        date_range: {
          from: (response.aggregations as any)?.min_date?.value_as_string || null,
          to: (response.aggregations as any)?.max_date?.value_as_string || null,
        },
        top_categories: topCategories
      };
    } catch (error: any) {
      throw new InternalServerErrorException(`ES Error: ${error.message}`);
    }
  }

  async getTopTopics(limit: number = 20) {
    try {
      const response = await this.elasticsearchService.search({
        index: 'papers',
        size: 0,
        aggs: {
          topics: {
            terms: {
              field: 'categories.keyword',
              size: limit,
              order: { _count: 'desc' }
            }
          }
        }
      } as any);
      const total = response.hits.total ? (typeof response.hits.total === 'number' ? response.hits.total : (response.hits.total as any).value) : 0;
      const buckets = (response.aggregations as any)?.topics?.buckets || [];
      
      return {
        topics: buckets.map((b: any) => ({
          topic: b.key,
          count: b.doc_count,
          percentage: total > 0 ? ((b.doc_count / total) * 100).toFixed(2) : 0,
          primary_category: b.key.split('.')[0]
        }))
      };
    } catch (error: any) {
      throw new InternalServerErrorException(`ES Error: ${error.message}`);
    }
  }

  async getTrends(topicCodes: string[], interval: string = 'year', fromYear?: number, toYear?: number) {
    try {
      const mustClauses: any[] = [];
      if (topicCodes && topicCodes.length > 0) {
        mustClauses.push({ terms: { 'categories.keyword': topicCodes } });
      }

      if (fromYear || toYear) {
        const rangeObj: any = {};
        if (fromYear) rangeObj.gte = `${fromYear}-01-01`;
        if (toYear) rangeObj.lte = `${toYear}-12-31`;
        mustClauses.push({ range: { published_at: rangeObj } });
      }

      const queryObj = mustClauses.length > 0 ? { bool: { must: mustClauses } } : { match_all: {} };

      const response = await this.elasticsearchService.search({
        index: 'papers',
        size: 0,
        query: queryObj,
        aggs: {
          topics: {
            terms: {
              field: 'categories.keyword',
              size: 50
            },
            aggs: {
              timeline: {
                date_histogram: {
                  field: 'published_at',
                  calendar_interval: interval,
                  min_doc_count: 0
                }
              }
            }
          }
        }
      } as any);

      const topicsData: any = {};
      const buckets = (response.aggregations as any)?.topics?.buckets || [];

      buckets.forEach((bucket: any) => {
        if (topicCodes.length > 0 && !topicCodes.includes(bucket.key)) return;

        const timelineBuckets = bucket.timeline?.buckets || [];
        const timeline: any[] = [];

        for (let i = 0; i < timelineBuckets.length; i++) {
          const current = timelineBuckets[i].doc_count;
          let growthRate: string | null = null;
          
          if (i > 0) {
            const previous = timelineBuckets[i-1].doc_count;
            if (previous > 0) {
              growthRate = (((current - previous) / previous) * 100).toFixed(2);
            }
          }

          timeline.push({
            date: timelineBuckets[i].key_as_string,
            count: current,
            growth_rate: growthRate
          });
        }

        topicsData[bucket.key] = {
          total: bucket.doc_count,
          timeline
        };
      });

      return {
        topics: topicsData
      };
    } catch (error: any) {
      throw new InternalServerErrorException(`ES Error: ${error.message}`);
    }
  }

  async getEmergingTopics(threshold: number = 50, minPapers: number = 10) {
    const currentYear = new Date().getFullYear();
    
    try {
      const response = await this.elasticsearchService.search({
        index: 'papers',
        size: 0,
        aggs: {
          topics: {
            terms: {
              field: 'categories.keyword',
              size: 500
            },
            aggs: {
              recent_years: {
                filter: {
                  range: { published_year: { gte: currentYear - 1 } }
                }
              },
              old_years: {
                filter: {
                  range: { published_year: { gte: currentYear - 4, lt: currentYear - 1 } }
                }
              }
            }
          }
        }
      } as any);

      const buckets = (response.aggregations as any)?.topics?.buckets || [];
      const emerging: any[] = [];

      buckets.forEach((bucket: any) => {
        const topic = bucket.key;
        const recentCount = bucket.recent_years?.doc_count || 0;
        const oldCount = bucket.old_years?.doc_count || 0;

        if (recentCount >= minPapers) {
          if (oldCount === 0) {
            emerging.push({
              topic,
              type: 'brand_new',
              recent_count: recentCount,
              old_count: 0,
              growth_rate: 'Infinity'
            });
          } else {
            const growthRate = ((recentCount - oldCount) / oldCount) * 100;
            if (growthRate >= threshold) {
              emerging.push({
                topic,
                type: 'rapidly_growing',
                recent_count: recentCount,
                old_count: oldCount,
                growth_rate: growthRate.toFixed(2)
              });
            }
          }
        }
      });

      return {
        emerging_topics: emerging.sort((a, b) => {
          if (a.growth_rate === 'Infinity') return -1;
          if (b.growth_rate === 'Infinity') return 1;
          return parseFloat(b.growth_rate) - parseFloat(a.growth_rate);
        })
      };

    } catch (error: any) {
      throw new InternalServerErrorException(`ES Error: ${error.message}`);
    }
  }

  async getTrendingScore(limit: number = 10) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    let last3MonthsStart = `${currentYear}-${String(currentMonth - 2).padStart(2, '0')}-01`;
    if (currentMonth <= 2) {
      last3MonthsStart = `${currentYear - 1}-${String(currentMonth + 10).padStart(2, '0')}-01`;
    }

    try {
      const response = await this.elasticsearchService.search({
        index: 'papers',
        size: 0,
        aggs: {
          topics: {
            terms: {
              field: 'categories.keyword',
              size: limit * 5
            },
            aggs: {
              recent_3_months: {
                filter: {
                  range: { published_at: { gte: last3MonthsStart } }
                }
              },
              this_year: {
                filter: {
                  term: { published_year: currentYear }
                }
              },
              last_year: {
                filter: {
                  term: { published_year: currentYear - 1 }
                }
              }
            }
          }
        }
      } as any);

      const buckets = (response.aggregations as any)?.topics?.buckets || [];
      const trending: any[] = [];

      const maxTotal = buckets.length > 0 ? Math.max(...buckets.map((b: any) => b.doc_count)) : 0;

      buckets.forEach((bucket: any) => {
        const topic = bucket.key;
        const total = bucket.doc_count;
        const recent3Months = bucket.recent_3_months?.doc_count || 0;
        const thisYear = bucket.this_year?.doc_count || 0;
        const lastYear = bucket.last_year?.doc_count || 0;

        const recencyScore = total > 0 ? (recent3Months / total) * 100 : 0;
        
        let growthRate = 0;
        if (lastYear > 0) {
          growthRate = ((thisYear - lastYear) / lastYear) * 100;
        } else if (thisYear > 0) {
          growthRate = 100;
        }
        const growthScore = Math.max(0, Math.min(growthRate, 100));
        
        const volumeScore = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

        const trendingScore = 0.4 * recencyScore + 0.4 * growthScore + 0.2 * volumeScore;

        trending.push({
          topic,
          trending_score: trendingScore.toFixed(2),
          breakdown: {
            recency: recencyScore.toFixed(2),
            growth: growthScore.toFixed(2),
            volume: volumeScore.toFixed(2)
          }
        });
      });

      const sorted = trending.sort((a, b) => parseFloat(b.trending_score) - parseFloat(a.trending_score)).slice(0, limit);

      return {
        trending_topics: sorted
      };

    } catch (error: any) {
      throw new InternalServerErrorException(`ES Error: ${error.message}`);
    }
  }
}
