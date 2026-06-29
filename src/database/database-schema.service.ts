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

    // Ensure favorites/history tables use arxiv_id (not legacy paper_id schema)
    await this.ensureUserPaperReferenceTables();

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS paper_similarities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        arxiv_id VARCHAR(30) NOT NULL,
        similar_arxiv_id VARCHAR(30) NOT NULL,
        similarity DOUBLE PRECISION NOT NULL,
        type VARCHAR(20) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_paper_similarities_pair UNIQUE (arxiv_id, similar_arxiv_id)
      );
      CREATE INDEX IF NOT EXISTS idx_paper_similarities_arxiv
        ON paper_similarities(arxiv_id);
      CREATE INDEX IF NOT EXISTS idx_paper_similarities_similar
        ON paper_similarities(similar_arxiv_id);
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

  private async ensureUserPaperReferenceTables() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS user_favorites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        arxiv_id VARCHAR NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_user_favorites_user_arxiv UNIQUE (user_id, arxiv_id),
        CONSTRAINT fk_user_favorites_user FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    const historyTable = await this.dataSource.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'user_paper_history';
    `);

    if (historyTable.length === 0) {
      await this.dataSource.query(`
        CREATE TABLE user_paper_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          arxiv_id VARCHAR NOT NULL,
          viewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_user_paper_history_user_arxiv UNIQUE (user_id, arxiv_id),
          CONSTRAINT fk_user_paper_history_user FOREIGN KEY (user_id)
            REFERENCES users(id) ON DELETE CASCADE
        );
      `);
      this.logger.log('Created user_paper_history table with arxiv_id.');
      return;
    }

    const paperIdColumn = await this.dataSource.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'user_paper_history' AND column_name = 'paper_id';
    `);

    if (paperIdColumn.length > 0) {
      this.logger.log('Migrating user_paper_history: dropping legacy paper_id column');
      await this.dataSource.query(`DELETE FROM user_paper_history`);
      const fkConstraints = await this.dataSource.query(`
        SELECT tc.constraint_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'user_paper_history'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'paper_id';
      `);
      for (const row of fkConstraints) {
        await this.dataSource.query(
          `ALTER TABLE user_paper_history DROP CONSTRAINT "${row.constraint_name}"`,
        );
      }
      await this.dataSource.query(`ALTER TABLE user_paper_history DROP COLUMN paper_id`);
    }

    const arxivIdColumn = await this.dataSource.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'user_paper_history' AND column_name = 'arxiv_id';
    `);

    if (arxivIdColumn.length === 0) {
      this.logger.log('Migrating user_paper_history: adding arxiv_id column');
      await this.dataSource.query(`
        ALTER TABLE user_paper_history
        ADD COLUMN arxiv_id VARCHAR NOT NULL DEFAULT '';
      `);
      await this.dataSource.query(`
        ALTER TABLE user_paper_history ALTER COLUMN arxiv_id DROP DEFAULT;
      `);
    }

    await this.dataSource.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'user_paper_history'
            AND constraint_name = 'uq_user_paper_history_user_arxiv'
        ) THEN
          ALTER TABLE user_paper_history
            ADD CONSTRAINT uq_user_paper_history_user_arxiv UNIQUE (user_id, arxiv_id);
        END IF;
      END$$;
    `);

    await this.dataSource.query(`DROP TABLE IF EXISTS users_favorite_papers CASCADE`);
    this.logger.log('Ensured user_favorites and user_paper_history tables use arxiv_id.');
  }
}
