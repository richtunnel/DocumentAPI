import { Router } from 'express';
import { fifoQueueService } from '../shared/services/fifoQueue.service';
import { logger } from '../shared/services/logger.service';
import { requireAuth } from '../middleware/security.middleware';

const monitoringRouter = Router();

/**
 * GET /api/v1/monitoring/queues
 * Get queue statistics
 */
monitoringRouter.get('/queues',
  requireAuth(['demographics:read']),
  async (req: Request, res: Response) => {
    try {
      const demographicsStats = await fifoQueueService.getQueueStats('demographics');
      const webhooksStats = await fifoQueueService.getQueueStats('webhooks');
      const documentsStats = await fifoQueueService.getQueueStats('documents');

      res.json({
        timestamp: new Date().toISOString(),
        queues: {
          demographics_processing_fifo: demographicsStats,
          webhook_notifications_fifo: webhooksStats,
          document_processing: documentsStats
        },
        processing_stats: {
          total_active_messages: demographicsStats.activeMessages + webhooksStats.activeMessages + documentsStats.activeMessages,
          queue_health: 'healthy'
        }
      });
    } catch (error) {
      logger.error('Error getting queue stats', { error });
      res.status(500).json({
        error: 'Failed to get queue status',
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * GET /api/v1/monitoring/metrics
 * Get system metrics
 */
monitoringRouter.get('/metrics',
  requireAuth(['demographics:read']),
  async (req: Request, res: Response) => {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      res.json({
        timestamp: new Date().toISOString(),
        server: {
          uptime: process.uptime(),
          node_version: process.version,
          environment: process.env.NODE_ENV || 'unknown'
        },
        memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024),
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        }
      });
    } catch (error) {
      logger.error('Error getting system metrics', { error });
      res.status(500).json({
        error: 'Failed to get system metrics',
        timestamp: new Date().toISOString()
      });
    }
  }
);

export default monitoringRouter;