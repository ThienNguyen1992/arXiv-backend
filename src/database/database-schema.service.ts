import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseSchemaService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseSchemaService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    if (this.dataSource.options.type !== 'postgres') {
      return;
    }

    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await this.dataSource.query(`
      CREATE OR REPLACE FUNCTION articles_search_trigger() RETURNS trigger AS $$
      begin
        new.search_vector :=
          setweight(to_tsvector('english', coalesce(new.title,'')), 'A') ||
          setweight(to_tsvector('english', coalesce(new.abstract,'')), 'B');
        return new;
      end
      $$ LANGUAGE plpgsql;
    `);

    await this.dataSource.query(`
      DROP TRIGGER IF EXISTS trg_articles_search_update ON articles;
    `);

    await this.dataSource.query(`
      CREATE TRIGGER trg_articles_search_update
      BEFORE INSERT OR UPDATE ON articles
      FOR EACH ROW EXECUTE FUNCTION articles_search_trigger();
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_articles_search_vector
      ON articles USING gin(search_vector);
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_article_topics_topic
      ON article_topics(topic_id);
    `);

    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_primary_topic
      ON article_topics(article_id)
      WHERE is_primary = TRUE;
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_articles_arxiv_id
      ON articles(arxiv_id);
    `);

    this.logger.log('Article search trigger and PostgreSQL indexes are ready');
  }
}
