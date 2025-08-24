import { app, HttpRequest, HttpResponse } from '@azure/functions';

// in-memory stats (in production use redis or database)
const workerStatsInterface = {
  hybridWorker: {
    lastRun: null,
    totalExecutions: 0,
    totalProcessed: 0,
    averageProcessingTime: 0,
    lastBatchSize: 0
  },
  webhookWorker: {
    lastRun: null,
    totalExecutions: 0, 
    totalProcessed: 0,
    successRate: 0
  }
};

async function workerStats(request: HttpRequest): Promise<HttpResponse> {
  return new HttpResponse({
    jsonBody: {
      timestamp: new Date().toISOString(),
      workers: workerStats,
      performance: {
        hybrid_worker_efficiency: workerStatsInterface.hybridWorker.totalProcessed / workerStatsInterface.hybridWorker.totalExecutions || 0,
        webhook_success_rate: workerStatsInterface.webhookWorker.successRate,
        system_health: 'healthy' // add some logic based on your metrics
      }
    }
  });
}

app.http('workerStats', {
  methods: ['GET'],
  route: 'monitor/workers',
  handler: workerStats
});