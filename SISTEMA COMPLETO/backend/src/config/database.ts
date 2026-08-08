import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { env } from './env.js';

const poolConfig: PoolConfig = {
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
  application_name: 'bytecrm_backend',
};

export const pool = new Pool(poolConfig);

// Graceful connection validation
pool.on('error', (err) => {
  console.error('[DATABASE] Unexpected pool error:', err.message);
});

pool.on('connect', (client) => {
  client.query("SET timezone = 'America/Sao_Paulo'");
});

/**
 * Execute a parameterized query with automatic connection management.
 * Uses positional parameters ($1, $2, ...) to prevent SQL injection.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (env.NODE_ENV === 'development' && duration > 500) {
    console.warn(`[DATABASE] Slow query (${duration}ms):`, text.substring(0, 100));
  }

  return result;
}

/**
 * Execute multiple queries within a single transaction (ACID).
 * Automatically rolls back on error.
 */
export async function transaction<T>(
  callback: (client: {
    query: <R extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[]
    ) => Promise<QueryResult<R>>;
  }) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback({
      query: <R extends QueryResultRow>(text: string, params?: unknown[]) =>
        client.query<R>(text, params),
    });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check database connectivity
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW() as now');
    console.log('[DATABASE] Connected at:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('[DATABASE] Connection failed:', error);
    return false;
  }
}

export default { pool, query, transaction, checkConnection };
