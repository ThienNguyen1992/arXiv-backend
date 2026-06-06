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

    // Rename 'name' to 'title' in categories if it exists
    const categoryCols = await this.dataSource.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='categories' AND column_name='name';
    `);
    if (categoryCols.length > 0) {
      this.logger.log('Migrating categories table: renaming name to title');
      await this.dataSource.query('ALTER TABLE categories DROP COLUMN IF EXISTS description;');
      await this.dataSource.query('ALTER TABLE categories RENAME COLUMN name TO title;');
    }
    
    // Rename 'name' to 'title' in topics if it exists
    const topicCols = await this.dataSource.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='topics' AND column_name='name';
    `);
    if (topicCols.length > 0) {
      this.logger.log('Migrating topics table: renaming name to title');
      await this.dataSource.query('ALTER TABLE topics RENAME COLUMN name TO title;');
    }

    // Ensure users_favorite_papers table exists
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS users_favorite_papers (
        user_id UUID NOT NULL,
        paper_id UUID NOT NULL,
        PRIMARY KEY (user_id, paper_id),
        CONSTRAINT fk_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_paper FOREIGN KEY(paper_id) REFERENCES papers(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS user_paper_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        paper_id UUID NOT NULL,
        viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_history_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_history_paper FOREIGN KEY(paper_id) REFERENCES papers(id) ON DELETE CASCADE
      );
    `);
    this.logger.log('Ensured all standard tables exist.');


    const tablesExistResult = await this.dataSource.query(`
      SELECT table_name
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_name IN ('articles', 'article_topics');
    `);
    const existingTables = tablesExistResult.map((row: any) => row.table_name);

    if (existingTables.includes('articles')) {
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
        CREATE INDEX IF NOT EXISTS idx_articles_arxiv_id
        ON articles(arxiv_id);
      `);
    } else {
      this.logger.warn('Table "articles" does not exist yet. Skipping its trigger and index creation.');
    }

    if (existingTables.includes('article_topics')) {
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_article_topics_topic
        ON article_topics(topic_id);
      `);

      await this.dataSource.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_primary_topic
        ON article_topics(article_id)
        WHERE is_primary = TRUE;
      `);
    } else {
      this.logger.warn('Table "article_topics" does not exist yet. Skipping its index creation.');
    }

    this.logger.log('Article search trigger and PostgreSQL indexes are processed');
  }
}
