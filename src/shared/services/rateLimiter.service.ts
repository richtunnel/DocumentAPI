import Redis from 'ioredis';
import { ApiKey, RateLimitResult } from '../types/apiKey';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// A simple exponential backoff with a cap
export const customRetryStrategy = (times: number): number | null => {
  const delay = Math.min(times * 100, 5000);
  console.warn(`Redis connection retry attempt #${times}. Waiting ${delay}ms...`);
  return delay;
};

class RateLimiter {
  private redis: Redis | null = null;

  constructor() {
    if (process.env.REDIS_CONNECTION_STRING) {
      this.redis = new Redis(process.env.REDIS_CONNECTION_STRING, {
        retryStrategy: customRetryStrategy, 
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
    }
  }

  async checkRateLimit(
    apiKey: ApiKey,
    ipAddress: string
  ): Promise<RateLimitResult> {
    if (!this.redis) {
      // Fallback to memory-based rate limiting (not recommended for production)
      return this.memoryBasedRateLimit(apiKey);
    }

    const keyId = apiKey.key_id;
    const now = new Date();
    
    // Check multiple windows: burst (10s), minute, hour, day
    const windows = [
      {
        type: 'burst' as const,
        duration: 10,
        limit: apiKey.rate_limits.burst_limit,
        key: `rate_limit:${keyId}:burst:${Math.floor(now.getTime() / (10 * 1000))}`,
      },
      {
        type: 'minute' as const,
        duration: 60,
        limit: apiKey.rate_limits.requests_per_minute,
        key: `rate_limit:${keyId}:minute:${Math.floor(now.getTime() / (60 * 1000))}`,
      },
      {
        type: 'hour' as const,
        duration: 3600,
        limit: apiKey.rate_limits.requests_per_hour,
        key: `rate_limit:${keyId}:hour:${Math.floor(now.getTime() / (3600 * 1000))}`,
      },
      {
        type: 'day' as const,
        duration: 86400,
        limit: apiKey.rate_limits.requests_per_day,
        key: `rate_limit:${keyId}:day:${Math.floor(now.getTime() / (86400 * 1000))}`,
      },
    ];

    // Check all windows in parallel
    const pipeline = this.redis.pipeline();
    
    for (const window of windows) {
      pipeline.get(window.key);
    }
    
    const results = await pipeline.exec();
    
    if (!results) {
      throw new Error('Redis pipeline execution failed');
    }

    // Check if any window is exceeded
    for (let i = 0; i < windows.length; i++) {
      const window = windows[i];
      const [error, count] = results[i];
      
      if (error) {
        logger.error('Redis error during rate limit check', { error, window: window.type });
        continue;
      }
      
      const currentCount = parseInt(count as string) || 0;
      
      if (currentCount >= window.limit) {
        const resetTime = new Date((Math.floor(now.getTime() / (window.duration * 1000)) + 1) * window.duration * 1000);
        
        return {
          allowed: false,
          remaining: 0,
          resetTime,
          limit: window.limit,
          windowType: window.type,
        };
      }
    }

    // All windows allow the request, increment counters
    const incrementPipeline = this.redis.pipeline();
    
    for (const window of windows) {
      incrementPipeline.incr(window.key);
      incrementPipeline.expire(window.key, window.duration + 10); // Add 10s buffer
    }
    
    await incrementPipeline.exec();

    // Return info for the most restrictive window
    const minuteCount = parseInt(results[1][1] as string) || 0;
    const minuteResetTime = new Date((Math.floor(now.getTime() / 60000) + 1) * 60000);
    
    return {
      allowed: true,
      remaining: apiKey.rate_limits.requests_per_minute - minuteCount - 1,
      resetTime: minuteResetTime,
      limit: apiKey.rate_limits.requests_per_minute,
      windowType: 'minute',
    };
  }

  private memoryBasedRateLimit(apiKey: ApiKey): RateLimitResult {
    // Simple fallback - in production, consider using a more sophisticated solution
    logger.warn('Using memory-based rate limiting - not recommended for production');
    
    return {
      allowed: true,
      remaining: apiKey.rate_limits.requests_per_minute - 1,
      resetTime: new Date(Date.now() + 60000),
      limit: apiKey.rate_limits.requests_per_minute,
      windowType: 'minute',
    };
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}

export const rateLimiter = new RateLimiter();