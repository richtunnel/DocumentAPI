import sql from 'mssql';
import { logger } from '../azure-functions/monitor/winstonLogger';

const config: sql.config = {
  server: process.env.SQL_SERVER || 'localhost',
  database: process.env.SQL_DATABASE || 'demographics',
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  port: parseInt(process.env.SQL_PORT || '1433'),
  options: {
    encrypt: true, // Required for Azure SQL
    trustServerCertificate: process.env.NODE_ENV === 'development',
    connectTimeout: 30000,
    requestTimeout: 30000,
  },
  pool: {
    max: 20,
    min: 5,
    idleTimeoutMillis: 300000, // 5 minutes
    acquireTimeoutMillis: 60000, // 1 minute
  },
};

let pool: sql.ConnectionPool;

export async function initializeDatabase(): Promise<sql.ConnectionPool> {
  try {
    if (!pool) {
      pool = new sql.ConnectionPool(config);
      await pool.connect();
      logger.info('Connected to MSSQL database');
    }
    return pool;
  } catch (error) {
    logger.error('Database connection failed', { error });
    throw error;
  }
}

export function getPool(): sql.ConnectionPool {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.close();
    logger.info('Database connection closed');
  }
}