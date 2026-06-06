export interface DuplicateCandidate {
  id?: string;
  arxiv_id?: string;
  doi?: string;
  title: string;
  abstract?: string;
  authors?: string[]; // Array of author full names
}

export interface DuplicateResult {
  paper: DuplicateCandidate;
  similarity: number; // 0 to 100
  type: 'exact' | 'near' | 'similar' | 'related';
}

export class PaperDuplicateDetector {
  /**
   * Detects duplicate and related papers by comparing a source paper against an array of candidates.
   */
  public detectDuplicates(
    paper: DuplicateCandidate,
    candidates: DuplicateCandidate[]
  ): DuplicateResult[] {
    const results: DuplicateResult[] = [];

    for (const candidate of candidates) {
      // 1. Quick Metadata Check (O(1))
      const metadataScore = this.checkMetadata(paper, candidate);

      // Exact match via ID or exact Title/Author combination
      if (metadataScore === 100) {
        results.push({ paper: candidate, similarity: 100, type: 'exact' });
        continue;
      }

      // If metadata is extremely low (e.g. completely different titles), skip deep content check
      if (metadataScore < 30) {
        continue;
      }

      // 2. Content Check (Abstract similarity via n-grams & Jaccard)
      const contentScore = this.checkContent(paper, candidate);

      // 3. Weighted Final Score: 60% Metadata, 40% Content
      const finalScore = metadataScore * 0.6 + contentScore * 0.4;

      // 4. Classification
      if (finalScore >= 90) {
        results.push({ paper: candidate, similarity: Math.round(finalScore * 100) / 100, type: 'near' });
      } else if (finalScore >= 70) {
        results.push({ paper: candidate, similarity: Math.round(finalScore * 100) / 100, type: 'similar' });
      } else if (finalScore >= 50) {
        results.push({ paper: candidate, similarity: Math.round(finalScore * 100) / 100, type: 'related' });
      }
    }

    // Sort descending by similarity
    return results.sort((a, b) => b.similarity - a.similarity);
  }

  private checkMetadata(p1: DuplicateCandidate, p2: DuplicateCandidate): number {
    // Exact ID matches
    if (p1.id && p2.id && p1.id === p2.id) return 100;
    if (p1.arxiv_id && p2.arxiv_id && p1.arxiv_id === p2.arxiv_id) return 100;
    if (p1.doi && p2.doi && p1.doi === p2.doi) return 100;

    // String similarity for Title (70% weight in metadata)
    const titleSim = this.calculateStringSimilarity(
      this.normalizeText(p1.title),
      this.normalizeText(p2.title)
    );

    // Similarity for Authors (30% weight in metadata)
    const authorSim = this.calculateAuthorSimilarity(p1.authors || [], p2.authors || []);

    return titleSim * 70 + authorSim * 30;
  }

  private checkContent(p1: DuplicateCandidate, p2: DuplicateCandidate): number {
    const abs1 = this.normalizeText(p1.abstract || '');
    const abs2 = this.normalizeText(p2.abstract || '');

    if (!abs1 || !abs2) return 0;

    // Jaccard similarity for words in abstract (Approximates TF-IDF overlapping)
    return this.calculateJaccardSimilarity(abs1, abs2) * 100;
  }

  /**
   * Normalizes text by lowercasing, removing punctuation, and collapsing whitespaces
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Combines Dice's Coefficient (Bigrams) and Jaccard (Words) for robust string comparison
   * Returns value between 0.0 and 1.0
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    
    const jaccard = this.calculateJaccardSimilarity(str1, str2);
    const dice = this.calculateDiceCoefficient(str1, str2);

    return jaccard * 0.4 + dice * 0.6; 
  }

  /**
   * Word-level Jaccard Similarity
   */
  private calculateJaccardSimilarity(str1: string, str2: string): number {
    const words1 = str1.split(' ').filter(w => w.length > 2);
    const words2 = str2.split(' ').filter(w => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return 0;

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    let intersection = 0;
    for (const word of set1) {
      if (set2.has(word)) intersection++;
    }

    const union = set1.size + set2.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Character-level Bigram Dice's Coefficient (Better for finding typos like "Levenstein" vs "Levenshtein")
   */
  private calculateDiceCoefficient(str1: string, str2: string): number {
    if (str1.length < 2 || str2.length < 2) return 0;

    const bigrams1 = this.getBigrams(str1);
    const bigrams2 = this.getBigrams(str2);

    let intersection = 0;
    for (const bg of bigrams1) {
      const idx = bigrams2.indexOf(bg);
      if (idx !== -1) {
        intersection++;
        bigrams2.splice(idx, 1); 
      }
    }

    const total = this.getBigrams(str1).length + this.getBigrams(str2).length;
    return total === 0 ? 0 : (2.0 * intersection) / total;
  }

  private getBigrams(str: string): string[] {
    const bigrams: string[] = [];
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.push(str.substring(i, i + 2));
    }
    return bigrams;
  }

  /**
   * Overlap calculation for Author arrays
   */
  private calculateAuthorSimilarity(authors1: string[], authors2: string[]): number {
    if (authors1.length === 0 && authors2.length === 0) return 1.0;
    if (authors1.length === 0 || authors2.length === 0) return 0;

    const names1 = authors1.map(a => this.normalizeText(a));
    const names2 = authors2.map(a => this.normalizeText(a));

    let intersection = 0;
    for (const name of names1) {
      // Allow partial matches (e.g. "John Doe" matches "John A. Doe")
      if (names2.some(n => n.includes(name) || name.includes(n))) {
        intersection++;
      }
    }

    const union = names1.length + names2.length - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
