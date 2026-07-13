import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import responseTime from 'response-time';
import { RateLimiterMiddleware } from './middleware/rateLimiter';
import { metricsMiddleware, getMetricsRoute, redisHealth } from './monitoring/metrics';
import { logger } from './monitoring/logger';
import { appConfig } from './config';
import { getRedisClient, isRedisAvailable } from './config/redis';
import resourceRouter from './routes/resource';
import { createHealthRouter } from './routes/health';
import docsRouter from './routes/docs';
import dashboardRouter from './routes/dashboard';
import path from 'path';

export async function createApp() {
  const app = express();

  const rateLimiterConfig = {
    default: {
      name: appConfig.defaultStrategy,
      windowMs: 60 * 1000,
      max: 10,
      bucketSize: 10,
      refillRate: 10 / 60,
    },
    tiers: {
      ip: { name: 'token-bucket' as const, windowMs: 60 * 1000, max: 10, bucketSize: 10, refillRate: 10 / 60 },
      user: { name: 'token-bucket' as const, windowMs: 60 * 1000, max: 20, bucketSize: 20, refillRate: 20 / 60 },
      endpoint: { name: 'sliding-window-counter' as const, windowMs: 60 * 1000, max: 30 },
    },
    keyPrefix: 'rate_limit_v2',
  };

  const rateLimiter = new RateLimiterMiddleware(rateLimiterConfig);

  // Production hardening (relax CSP for inline scripts in dashboard)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  }));
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '1kb' }));

  // Monitoring
  app.use(metricsMiddleware);
  app.use(responseTime((req, res, time) => {
    logger.debug({ method: req.method, url: req.url, durationMs: time.toFixed(2) }, 'request completed');
  }));

  // Public welcome route (no rate limit)
  app.get('/api/info', (_req, res) => {
    res.json({
      name: 'Advanced API Rate Limiter',
      version: '2.0.0',
      strategies: ['token-bucket', 'leaky-bucket', 'sliding-window-log', 'sliding-window-counter'],
      docs: '/docs',
      metrics: '/metrics',
      health: '/health',
      dashboard: '/dashboard',
    });
  });

  // Apply rate limiter to API routes
  app.use('/api', rateLimiter.middleware());
  app.use('/api', resourceRouter);

  // Observability routes (no rate limit)
  app.use(createHealthRouter(rateLimiter));
  app.get('/metrics', getMetricsRoute());

  // Dashboard UI
  app.use(dashboardRouter);

  // API docs
  app.use(docsRouter);

  // Periodic Redis health check
  setInterval(async () => {
    try {
      const client = await getRedisClient();
      await client.ping();
      redisHealth.set(1);
      rateLimiter.syncStorage();
    } catch {
      redisHealth.set(0);
      logger.warn('Redis health check failed');
    }
  }, 15000);

  return { app, rateLimiter };
}
