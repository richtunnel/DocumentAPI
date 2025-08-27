import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { databaseService } from '../../shared/database/database.service';
import { queueService } from '../../shared/services/queue.service';
import { rateLimiter } from '../../shared/services/rateLimiter.service';
import { authMiddleware } from '../../middleware/auth.middleware';
import { logger } from '../../shared/services/logger.service';
import { AuthenticatedRequest } from '../../shared/types/express-extensions';
import { ApiKey } from '../../shared/types/demographics';

interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  details?: any;
  error?: string;
}

const router = Router();

/**
 * GET /api/v1/health
 * Perform system health check
 */
router.get(
  '/',
  authMiddleware({ allowAnonymous: true, requiredScopes: [] }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    const checks: HealthCheckResult[] = [];
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    let isAuthenticated = false;
    let authInfo: { lawFirm: string; keyId: string } | null = null;

    try {
      // Check authentication status
      const authReq = req as AuthenticatedRequest;
      if (authReq.auth) {
        isAuthenticated = true;
        authInfo = {
          lawFirm: authReq.auth.lawFirm,
          keyId: authReq.auth.keyId,
        };
        logger.info('Authenticated health check', {
          requestId: req.requestId,
          ...authInfo,
        });
      }

      // Database health check
      const dbCheck = await checkDatabase();
      checks.push(dbCheck);

      // Queue service health check
      const queueCheck = await checkQueueService();
      checks.push(queueCheck);

      // Rate limiter health check
      const rateLimiterCheck = await checkRateLimiter();
      checks.push(rateLimiterCheck);

      // Memory usage check
      const memoryCheck = checkMemoryUsage();
      checks.push(memoryCheck);

      // Determine overall status
      const unhealthyCount = checks.filter(check => check.status === 'unhealthy').length;
      const degradedCount = checks.filter(check => check.status === 'degraded').length;

      if (unhealthyCount > 0) {
        overallStatus = 'unhealthy';
      } else if (degradedCount > 0) {
        overallStatus = 'degraded';
      }

      const totalTime = Date.now() - startTime;

      const response = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.ENVIRONMENT || 'unknown',
        uptime: process.uptime(),
        responseTime: totalTime,
        authenticated: isAuthenticated,
        authInfo: isAuthenticated ? authInfo : undefined,
        checks: checks.reduce((acc, check) => {
          acc[check.service] = {
            status: check.status,
            responseTime: check.responseTime,
            details: check.details,
            error: check.error,
          };
          return acc;
        }, {} as Record<string, any>),
        summary: {
          total: checks.length,
          healthy: checks.filter(check => check.status === 'healthy').length,
          degraded: degradedCount,
          unhealthy: unhealthyCount,
        },
        requestId: req.requestId,
      };

      const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

      res.status(statusCode).json(response);
    } catch (error) {
      const totalTime = Date.now() - startTime;
      logger.error('Health check failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        requestId: req.requestId,
      });

      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check system failure',
        responseTime: totalTime,
        authenticated: false,
        requestId: req.requestId,
      });
    }
  }
);

async function checkDatabase(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    const pool = await databaseService.getPool();
    const result = await pool.request().query('SELECT 1 as health_check');

    const responseTime = Date.now() - startTime;

    if (result.recordset.length > 0 && result.recordset[0].health_check === 1) {
      return {
        service: 'database',
        status: responseTime > 5000 ? 'degraded' : 'healthy',
        responseTime,
        details: {
          connected: true,
          query_success: true,
        },
      };
    } else {
      return {
        service: 'database',
        status: 'unhealthy',
        responseTime,
        error: 'Invalid query result',
      };
    }
  } catch (error) {
    return {
      service: 'database',
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

async function checkQueueService(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    await queueService.ensureQueuesExist();
    const processQueueLength = await queueService.getQueueLength('process');
    const webhookQueueLength = await queueService.getQueueLength('webhook');

    const responseTime = Date.now() - startTime;
    const totalMessages = processQueueLength + webhookQueueLength;

    return {
      service: 'queue',
      status: responseTime > 3000 ? 'degraded' : 'healthy',
      responseTime,
      details: {
        process_queue_length: processQueueLength,
        webhook_queue_length: webhookQueueLength,
        total_messages: totalMessages,
        status: totalMessages > 1000 ? 'high_load' : 'normal',
      },
    };
  } catch (error) {
    return {
      service: 'queue',
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Queue service error',
    };
  }
}

async function checkRateLimiter(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    const testApiKey: ApiKey = {
      id: uuidv4(),
      partitionKey: 'health_check_partition',
      key_id: 'health_check',
      key_hash: 'dummy_hash',
      name: 'Health Check Key',
      law_firm: 'health_check_firm',
      created_by: uuidv4(),
      status: 'active',
      rate_limits: {
        requests_per_minute: 60,
        requests_per_hour: 3600,
        requests_per_day: 86400,
        burst_limit: 100,
      },
      scopes: [],
      usage_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await rateLimiter.checkRateLimit(testApiKey, '127.0.0.1');

    const responseTime = Date.now() - startTime;

    return {
      service: 'rate_limiter',
      status: responseTime > 2000 ? 'degraded' : 'healthy',
      responseTime,
      details: {
        redis_connected: !!process.env.REDIS_CONNECTION_STRING,
        fallback_mode: !process.env.REDIS_CONNECTION_STRING,
      },
    };
  } catch (error) {
    return {
      service: 'rate_limiter',
      status: 'degraded',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Rate limiter error',
    };
  }
}

function checkMemoryUsage(): HealthCheckResult {
  const startTime = Date.now();

  try {
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    };

    const responseTime = Date.now() - startTime;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (memUsageMB.heapUsed > 800) {
      status = 'unhealthy';
    } else if (memUsageMB.heapUsed > 400) {
      status = 'degraded';
    }

    return {
      service: 'memory',
      status,
      responseTime,
      details: {
        usage_mb: memUsageMB,
        uptime_seconds: Math.round(process.uptime()),
      },
    };
  } catch (error) {
    return {
      service: 'memory',
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Memory check error',
    };
  }
}

export default router;