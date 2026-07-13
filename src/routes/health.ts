import { Router } from 'express';
import type { RateLimiterMiddleware } from '../middleware/rateLimiter';

export function createHealthRouter(rateLimiter: RateLimiterMiddleware) {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const limiterHealth = await rateLimiter.healthCheck();
    const healthy = limiterHealth.ok;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      rateLimiter: limiterHealth,
    });
  });

  return router;
}
