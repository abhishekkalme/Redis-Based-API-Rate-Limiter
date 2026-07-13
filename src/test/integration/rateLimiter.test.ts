import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app';
import type { Express } from 'express';

let app: Express;

beforeAll(async () => {
  const result = await createApp();
  app = result.app;
});

describe('GET /', () => {
  it('returns API info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Advanced API Rate Limiter');
    expect(res.body.strategies).toContain('token-bucket');
  });
});

describe('GET /api/resource', () => {
  it('returns access granted on first request', async () => {
    const res = await request(app)
      .get('/api/resource')
      .set('X-Forwarded-For', '10.0.0.1');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Access granted to protected resource.');
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });

  it('rate limits after exceeding limit', async () => {
    const ip = '10.0.0.2';

    for (let i = 0; i < 10; i++) {
      await request(app)
        .get('/api/resource')
        .set('X-Forwarded-For', ip);
    }

    const blocked = await request(app)
      .get('/api/resource')
      .set('X-Forwarded-For', ip);

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBeTruthy();
    expect(blocked.body.retryAfter).toBeGreaterThan(0);
    expect(blocked.body.current).toBeGreaterThanOrEqual(10);
    expect(blocked.body.limit).toBe(10);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.uptime).toBeGreaterThan(0);
    expect(res.body.rateLimiter.strategies).toContain('default');
  });
});

describe('GET /metrics', () => {
  it('returns prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('rate_limiter_');
  });
});
