-- Run once if an existing dev database was created from the old Paper schema.
-- The old auto-generated many-to-many tables keep foreign keys to "papers",
-- which can block TypeORM synchronize while moving to the article schema.

DROP TABLE IF EXISTS papers_topics CASCADE;
DROP TABLE IF EXISTS users_favorite_papers CASCADE;
