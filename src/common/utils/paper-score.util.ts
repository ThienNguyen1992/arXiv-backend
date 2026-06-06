export interface AuthorScoringInfo {
  h_index?: number;
  total_citations?: number;
  paper_count?: number;
  unique_coauthors?: number;
}

export interface PaperStatistics {
  view_count?: number;
  download_count?: number;
  bookmark_count?: number;
}

export interface PaperScoringInput {
  published_date?: Date;
  updated_date?: Date;
  citation_count?: number;
  journal_ref?: string;
  abstract?: string;
  comments?: string;
  comment_count?: number;
  version?: number;
  has_code?: boolean;
  has_dataset?: boolean;
  authors?: AuthorScoringInfo[];
  statistics?: PaperStatistics;
  // Cho phép truyền thêm trọng số tùy chỉnh
  weights?: {
    citation?: number;
    recency?: number;
    author?: number;
    engagement?: number;
    quality?: number;
  };
}

export class PaperScorer {
  private defaultWeights = {
    citation: 0.35,
    recency: 0.20,
    author: 0.20,
    engagement: 0.15,
    quality: 0.10,
  };

  public calculateScore(paper: PaperScoringInput) {
    const weights = { ...this.defaultWeights, ...(paper.weights || {}) };

    const scores = {
      citation: this.calculateCitationScore(paper),
      recency: this.calculateRecencyScore(paper),
      author: this.calculateAuthorScore(paper),
      engagement: this.calculateEngagementScore(paper),
      quality: this.calculateQualityScore(paper),
    };

    let totalScore =
      scores.citation * weights.citation +
      scores.recency * weights.recency +
      scores.author * weights.author +
      scores.engagement * weights.engagement +
      scores.quality * weights.quality;

    totalScore = this.applyPenalties(paper, totalScore);

    const finalScore = Math.max(0, Math.min(totalScore, 100));

    return {
      total_score: Math.round(finalScore * 100) / 100,
      component_scores: {
        citation: Math.round(scores.citation * 100) / 100,
        recency: Math.round(scores.recency * 100) / 100,
        author: Math.round(scores.author * 100) / 100,
        engagement: Math.round(scores.engagement * 100) / 100,
        quality: Math.round(scores.quality * 100) / 100,
      },
      rank: this.getRank(finalScore),
    };
  }

  private calculateCitationScore(paper: PaperScoringInput): number {
    const totalCitations = paper.citation_count || 0;
    if (!paper.published_date) return 0;

    let paperAge = (new Date().getTime() - paper.published_date.getTime()) / (1000 * 3600 * 24 * 365.25);
    if (paperAge < 0.1) paperAge = 0.1;

    const citationsPerYear = totalCitations / paperAge;
    // Giả lập điểm citation (Do chưa có list citations chi tiết để tính decay và h-index của paper)
    const rawScore = 0.6 * Math.min(citationsPerYear / 10, 1.0) + 0.4 * Math.min(totalCitations / 50, 1.0);
    return rawScore * 100;
  }

  private calculateRecencyScore(paper: PaperScoringInput): number {
    if (!paper.published_date) return 0;
    
    const daysSincePublished = (new Date().getTime() - paper.published_date.getTime()) / (1000 * 3600 * 24);
    const halfLifeDays = 730; // 2 years
    const decayRate = Math.LN2 / halfLifeDays;
    
    const recencyScore = 100 * Math.exp(-decayRate * daysSincePublished);
    
    let updateBonus = 0;
    if (paper.updated_date) {
      const daysSinceUpdated = (new Date().getTime() - paper.updated_date.getTime()) / (1000 * 3600 * 24);
      updateBonus = 10 * Math.exp(-decayRate * daysSinceUpdated);
    }
    
    return Math.min(recencyScore + updateBonus, 100);
  }

  private calculateAuthorScore(paper: PaperScoringInput): number {
    if (!paper.authors || paper.authors.length === 0) return 0;

    const authorScores = paper.authors.map(author => {
      const hScore = Math.min((author.h_index || 0) / 50, 1.0) * 40;
      const citationScore = Math.min((author.total_citations || 0) / 1000, 1.0) * 30;
      const productivityScore = Math.min((author.paper_count || 0) / 100, 1.0) * 20;
      const collabScore = Math.min((author.unique_coauthors || 0) / 50, 1.0) * 10;
      return hScore + citationScore + productivityScore + collabScore;
    });

    authorScores.sort((a, b) => b - a);
    const topAuthors = authorScores.slice(0, 3);
    const sum = topAuthors.reduce((acc, val) => acc + val, 0);
    
    return topAuthors.length > 0 ? sum / topAuthors.length : 0;
  }

  private calculateEngagementScore(paper: PaperScoringInput): number {
    const stats = paper.statistics || {};
    const views = stats.view_count || 0;
    const downloads = stats.download_count || 0;
    const bookmarks = stats.bookmark_count || 0;
    const comments = paper.comment_count || 0;

    const viewScore = Math.min(views / 1000, 1.0) * 25;
    const downloadScore = Math.min(downloads / 500, 1.0) * 35;
    const bookmarkScore = Math.min(bookmarks / 100, 1.0) * 25;
    const commentScore = Math.min(comments / 20, 1.0) * 15;

    let conversionBonus = 0;
    if (views > 0) {
      const conversionRatio = downloads / views;
      conversionBonus = Math.min(conversionRatio * 100, 20);
    }

    const rawScore = viewScore + downloadScore + bookmarkScore + commentScore;
    return Math.min(rawScore + conversionBonus, 100);
  }

  private calculateQualityScore(paper: PaperScoringInput): number {
    let score = 0;

    if (paper.journal_ref) {
      score += this.getVenueRanking(paper.journal_ref);
    }

    const abstractLength = paper.abstract ? paper.abstract.split(' ').length : 0;
    if (abstractLength >= 150 && abstractLength <= 300) {
      score += 15;
    } else if (abstractLength > 100) {
      score += 10;
    }

    if (paper.has_code) score += 15;
    if (paper.has_dataset) score += 10;

    const version = paper.version || 1;
    if (version > 1) {
      score += Math.min(version * 2, 10);
    }

    return Math.min(score, 100);
  }

  private getVenueRanking(journalRef: string): number {
    const topVenues: Record<string, number> = {
      'NeurIPS': 30, 'ICML': 30, 'ICLR': 28,
      'CVPR': 28, 'ICCV': 28, 'ECCV': 26,
      'ACL': 28, 'EMNLP': 26, 'NAACL': 24,
      'Nature': 30, 'Science': 30, 'Cell': 28,
    };

    const lowerRef = journalRef.toLowerCase();
    for (const [venue, score] of Object.entries(topVenues)) {
      if (lowerRef.includes(venue.toLowerCase())) {
        return score;
      }
    }
    return 10;
  }

  private applyPenalties(paper: PaperScoringInput, score: number): number {
    let finalScore = score;
    
    if (paper.published_date) {
      const paperAge = (new Date().getTime() - paper.published_date.getTime()) / (1000 * 3600 * 24 * 365.25);
      if (paperAge > 3 && (!paper.citation_count || paper.citation_count === 0)) {
        finalScore *= 0.7;
      }
    }

    if (!paper.abstract || paper.abstract.length < 50) {
      finalScore *= 0.8;
    }

    if (paper.authors && paper.authors.length === 1) {
      finalScore *= 0.9;
    }

    return finalScore;
  }

  private getRank(score: number): string {
    if (score >= 80) return 'Excellent';
    if (score >= 65) return 'Very Good';
    if (score >= 50) return 'Good';
    if (score >= 35) return 'Average';
    return 'Below Average';
  }
}
