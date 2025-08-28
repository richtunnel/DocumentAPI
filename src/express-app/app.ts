import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { loggingMiddleware } from '../middleware/logger.middleware';
import { errorMiddleware } from '../middleware/error.middleware';
import { securityMiddleware } from '../middleware/security.middleware';
import client from 'prom-client';

// Routes
import demographicsRoutes from '../routes/demographics.routes';
import documentsRoutes from '../routes/documents.routes';
import adminRoutes from '../routes/admin.route';
import healthRoutes from '../routes/health.route';
import monitoringRoutes from '../routes/monitor.routes';

const app = express();

// Metrics for development
if (process.env.NODE_ENV === 'development') {
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });
}

// Trust proxy for proper IP detection
app.set('trust proxy', 1);

// Global rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware stack
app.use(helmet());
app.use(globalLimiter);
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(securityMiddleware);
app.use(loggingMiddleware);

// API Routes (v1)
app.use('/api/v1/demographics', demographicsRoutes);
app.use('/api/v1/documents', documentsRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/monitoring', monitoringRoutes);

// Legacy routes (redirect to v1)
app.use('/api/demographics', (req, res) => res.redirect(301, '/api/v1' + req.originalUrl));
app.use('/api/documents', (req, res) => res.redirect(301, '/api/v1' + req.originalUrl));
app.use('/api/admin', (req, res) => res.redirect(301, '/api/v1' + req.originalUrl));
app.use('/api/health', (req, res) => res.redirect(301, '/api/v1' + req.originalUrl));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Demographics API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/v1/health',
      demographics: '/api/v1/demographics',
      documents: '/api/v1/documents',
      admin: '/api/v1/admin',
      monitoring: '/api/v1/monitoring',
    },
  });
});

// API version info
app.get('/api', (req, res) => {
  res.json({
    service: 'Demographics API',
    version: '1.0.0',
    availableVersions: ['v1'],
    currentVersion: 'v1',
    endpoints: {
      v1: {
        base: '/api/v1',
        demographics: '/api/v1/demographics',
        documents: '/api/v1/documents',
        admin: '/api/v1/admin',
        health: '/api/v1/health',
        monitoring: '/api/v1/monitoring',
      },
    },
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    code: 'ROUTE_NOT_FOUND',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      '/api/v1/health',
      '/api/v1/demographics',
      '/api/v1/documents',
      '/api/v1/admin',
      '/api/v1/monitoring',
    ],
  });
});

// Global error handler (must be last)
app.use(errorMiddleware);

export default app;