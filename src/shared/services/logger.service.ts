import winston from 'winston';

interface LogMetadata {
  requestId?: string;
  lawFirm?: string;
  keyId?: string;
  processingTime?: number;
  correlationId?: string;
  [key: string]: any;
}

class LoggerService {
  private logger: winston.Logger;

  constructor() {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

    // Create custom format
    const customFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.colorize({ all: isDevelopment }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : '';
        return isDevelopment 
          ? `${timestamp} [${level}]: ${message} ${metaStr}`
          : JSON.stringify({ timestamp, level, message, ...meta });
      })
    );

    // Configure transports
    const transports: winston.transport[] = [
      new winston.transports.Console({
        level: logLevel,
        format: isDevelopment 
          ? winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            )
          : customFormat,
        handleExceptions: true,
        handleRejections: true
      })
    ];

    // Add file transport for production
    if (!isDevelopment) {
      transports.push(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: customFormat,
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 5,
          tailable: true
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: customFormat,
          maxsize: 100 * 1024 * 1024, // 100MB
          maxFiles: 10,
          tailable: true
        })
      );
    }

    this.logger = winston.createLogger({
      level: logLevel,
      format: customFormat,
      defaultMeta: { 
        service: 'demographics-api',
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0'
      },
      transports,
      exitOnError: false
    });

    // Handle uncaught exceptions
    this.logger.exceptions.handle(
      new winston.transports.Console({
        format: winston.format.simple()
      })
    );

    // Handle unhandled promise rejections
    this.logger.rejections.handle(
      new winston.transports.Console({
        format: winston.format.simple()
      })
    );
  }

  info(message: string, meta?: LogMetadata): void {
    this.logger.info(message, meta);
  }

  error(message: string, meta?: LogMetadata): void {
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: LogMetadata): void {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: LogMetadata): void {
    this.logger.debug(message, meta);
  }

  // Method for request/response logging
  logRequest(method: string, path: string, statusCode: number, processingTime: number, meta?: LogMetadata): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    this.logger.log(level, `${method} ${path} ${statusCode}`, {
      ...meta,
      method,
      path,
      statusCode,
      processingTime
    });
  }

  // Method for API key events
  logApiKeyEvent(event: string, keyId: string, lawFirm: string, meta?: LogMetadata): void {
    this.logger.info(`API Key ${event}`, {
      ...meta,
      event,
      keyId,
      lawFirm
    });
  }

  // Method for queue events
  logQueueEvent(queueType: string, event: string, messageId: string, meta?: LogMetadata): void {
    this.logger.info(`Queue ${event}`, {
      ...meta,
      queueType,
      event,
      messageId
    });
  }

  // Method for database events
  logDatabaseEvent(operation: string, table: string, recordId: string, meta?: LogMetadata): void {
    this.logger.info(`Database ${operation}`, {
      ...meta,
      operation,
      table,
      recordId
    });
  }

  // Method for webhook events
  logWebhookEvent(event: string, webhookUrl: string, statusCode?: number, meta?: LogMetadata): void {
    const level = statusCode && statusCode >= 400 ? 'error' : 'info';
    this.logger.log(level, `Webhook ${event}`, {
      ...meta,
      event,
      webhookUrl,
      statusCode
    });
  }

  // Method for security events
  logSecurityEvent(event: string, ip: string, keyId?: string, meta?: LogMetadata): void {
    this.logger.warn(`Security ${event}`, {
      ...meta,
      event,
      ip,
      keyId
    });
  }

  // Method for performance monitoring
  logPerformance(operation: string, duration: number, meta?: LogMetadata): void {
    const level = duration > 5000 ? 'warn' : duration > 10000 ? 'error' : 'info';
    this.logger.log(level, `Performance: ${operation}`, {
      ...meta,
      operation,
      duration,
      performanceAlert: duration > 5000
    });
  }

  // Structured logging for business events
  logBusinessEvent(event: string, entityType: string, entityId: string, meta?: LogMetadata): void {
    this.logger.info(`Business Event: ${event}`, {
      ...meta,
      event,
      entityType,
      entityId,
      eventTimestamp: new Date().toISOString()
    });
  }
}

export const logger = new LoggerService();
export default logger;