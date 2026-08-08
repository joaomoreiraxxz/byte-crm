const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database. Running migrations...');

    // In Docker, migrations are copied to /app/migrations
    // Locally, they are in src/database/migrations
    const migrationsDir = fs.existsSync(path.join(__dirname, '../migrations')) 
      ? path.join(__dirname, '../migrations') 
      : path.join(__dirname, '../src/database/migrations');

    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      console.log(`Executing ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      console.log(`✓ ${file} executed successfully.`);
    }

    console.log('All migrations executed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
