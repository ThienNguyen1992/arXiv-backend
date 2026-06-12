import { Paper } from '../papers/entities/paper.entity';
import { ArxivPaperDto } from '../papers/papers.service';

/** Paper snapshot in notification — aligned with Elasticsearch `papers` index fields. */
export interface NotificationPaperSnapshot {
  arxiv_id: string;
  title: string;
  abstract: string;
  authors: string[] | null;
  published_at: string | null;
  pdf_url: string;
  categories: string[];
  topicId: number;
  topicCode: string;
}

export function snapshotFromArxivPaper(
  paper: ArxivPaperDto,
  topic: { id: number; code: string },
): NotificationPaperSnapshot {
  const arxivId = paper.arxiv_id || paper.id;
  return {
    arxiv_id: arxivId,
    title: paper.title,
    abstract: paper.summary?.replace(/\s+/g, ' ').trim() ?? '',
    authors: paper.authors?.length ? paper.authors : null,
    published_at: paper.publishedDate,
    pdf_url: paper.pdfLink ?? `https://arxiv.org/pdf/${arxivId}.pdf`,
    categories: paper.allCategories ?? [],
    topicId: topic.id,
    topicCode: topic.code,
  };
}

export function snapshotFromDbPaper(
  paper: Paper,
  topic: { id: number; code: string },
): NotificationPaperSnapshot {
  return {
    arxiv_id: paper.arxiv_id,
    title: paper.title,
    abstract: paper.abstract?.replace(/\s+/g, ' ').trim() ?? '',
    authors: null,
    published_at: paper.published_at?.toISOString() ?? null,
    pdf_url: `https://arxiv.org/pdf/${paper.arxiv_id}.pdf`,
    categories: [],
    topicId: topic.id,
    topicCode: topic.code,
  };
}
