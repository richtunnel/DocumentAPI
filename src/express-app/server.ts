import app from './app';
import { initializeDatabase } from '../config/database';
import { logger } from '../shared/services/logger.service';

const PORT = process.env.PORT || 3000;
let server: ReturnType<typeof app.listen> | null = null;

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    logger.info('Database initialized successfully');

    // Start server
    server = app.listen(PORT, () => {
      logger.info(`Demographics API server started`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
      });
    });

    return server;
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  } else {
    logger.warn('No server instance found during SIGTERM');
    process.exit(0);
  }
});

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

export { app, startServer };