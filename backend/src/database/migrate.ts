import { pool } from '../config/database.js';
import fs from 'fs';
import path from 'path';

async function runMigrations() {
  console.log('Starting database migrations...');
  
  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    
    for (const file of files) {
      console.log(`Executing ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      // Execute each migration inside a transaction if possible, or just raw
      await pool.query(sql);
      console.log(`✓ ${file} executed successfully.`);
    }
    
    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
