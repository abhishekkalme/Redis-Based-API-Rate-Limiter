import client from 'prom-client';
import type { Request, Response } from 'express';

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ prefix: 'rate_limiter_' });

export const httpRequestDuration = new client.Histogram({
  name: 'rate_limiter_http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
});

export const rateLimitDecisions = new client.Counter({
  name: 'rate_limiter_decisions_total',
  help: 'Total rate limit decisions',
  labelNames: ['strategy', 'tier', 'allowed'],
});

export const rateLimitCurrentLoad = new client.Gauge({
  name: 'rate_limiter_current_requests',
  help: 'Current request count for tracked keys',
  labelNames: ['strategy', 'tier'],
});

export const activeRequests = new client.Gauge({
  name: 'rate_limiter_active_requests',
  help: 'Number of requests currently being processed',
});

export const redisHealth = new client.Gauge({
  name: 'rate_limiter_redis_health',
  help: 'Redis connection health (1 = connected, 0 = disconnected)',
});

export function metricsMiddleware(req: Request, res: Response, next: () => void) {
  const end = httpRequestDuration.startTimer();
  activeRequests.inc();

  res.on('finish', () => {
    end({ method: req.method, route: req.route?.path || req.path, status_code: res.statusCode });
    activeRequests.dec();
  });

  next();
}

export function getMetricsRoute() {
  return async (_req: Request, res: Response) => {
    res.set('Content-Type', client.register.contentType);
    res.send(await client.register.metrics());
  };
}
