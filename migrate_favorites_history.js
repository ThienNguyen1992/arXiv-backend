/**
 * Migration script: Refactor Favorites and History to use arxiv_id
 *
 * Run with: node migrate_favorites_history.js
 */
const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'SuperAdmind@1234',
  database: 'backend_arxvi',
});

async function migrate() {
  await client.connect();
  console.log('Connected to database.');

  try {
    await client.query('BEGIN');

    // 1. Drop the old ManyToMany join table for favorites
    console.log('Dropping table users_favorite_papers...');
    await client.query(`DROP TABLE IF EXISTS "users_favorite_papers" CASCADE`);

    // 2. Delete all old history data
    console.log('Deleting all data from user_paper_history...');
    await client.query(`DELETE FROM "user_paper_history"`);

    // 3. Drop FK constraint on paper_id if exists, then drop the column
    console.log('Dropping FK and paper_id column from user_paper_history...');
    // Drop any FKs referencing paper_id
    const fkResult = await client.query(`
      SELECT tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'user_paper_history'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'paper_id'
    `);
    for (const row of fkResult.rows) {
      await client.query(`ALTER TABLE "user_paper_history" DROP CONSTRAINT "${row.constraint_name}"`);
      console.log(`  Dropped FK constraint: ${row.constraint_name}`);
    }

    // Check if paper_id column still exists before dropping
    const colResult = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'user_paper_history' AND column_name = 'paper_id'
    `);
    if (colResult.rows.length > 0) {
      await client.query(`ALTER TABLE "user_paper_history" DROP COLUMN "paper_id"`);
      console.log('  Dropped paper_id column.');
    }

    // 4. Add arxiv_id column to user_paper_history if not exists
    const arxivColResult = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'user_paper_history' AND column_name = 'arxiv_id'
    `);
    if (arxivColResult.rows.length === 0) {
      await client.query(`ALTER TABLE "user_paper_history" ADD COLUMN "arxiv_id" VARCHAR NOT NULL DEFAULT ''`);
      // Remove default after adding
      await client.query(`ALTER TABLE "user_paper_history" ALTER COLUMN "arxiv_id" DROP DEFAULT`);
      console.log('  Added arxiv_id column to user_paper_history.');
    }

    // 5. Add unique constraint on (user_id, arxiv_id) for history if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'user_paper_history'
            AND constraint_name = 'UQ_user_paper_history_user_arxiv'
        ) THEN
          ALTER TABLE "user_paper_history"
            ADD CONSTRAINT "UQ_user_paper_history_user_arxiv" UNIQUE ("user_id", "arxiv_id");
        END IF;
      END$$;
    `);
    console.log('  Ensured unique constraint on user_paper_history(user_id, arxiv_id).');

    // 6. Create user_favorites table if not exists
    console.log('Creating user_favorites table if not exists...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "user_favorites" (
        "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"    UUID NOT NULL,
        "arxiv_id"   VARCHAR NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_favorites_user_arxiv" UNIQUE ("user_id", "arxiv_id"),
        CONSTRAINT "FK_user_favorites_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    console.log('  user_favorites table ready.');

    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed, rolled back:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
