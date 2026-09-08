import type { Request, Response, NextFunction } from 'express';
import type { RateLimitResult, KeyContext, RateLimiterConfig, TierConfig } from '../types';
import type { IStorage } from '../storage/IStorage';
import type { IStrategy } from '../strategies/IStrategy';
import { createStrategy } from '../strategies';
import { redisHealth, rateLimitDecisions } from '../monitoring/metrics';
import { logger } from '../monitoring/logger';
import { getRedisClient, isRedisAvailable } from '../config/redis';
import { RedisStorage } from '../storage/RedisStorage';
import { MemoryStorage } from '../storage/MemoryStorage';
import { extractClientIp } from '../utils/ip';

function determineUserId(req: Request): string | undefined {
  return (req as any).user?.id
    || (req.headers['x-api-key'] as string)
    || undefined;
}

export class RateLimiterMiddleware {
  private storage!: IStorage;
  private strategies: Map<string, IStrategy> = new Map();
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    this.initialize();
  }

  private async initialize() {
    try {
      const client = await getRedisClient();
      if (isRedisAvailable()) {
        this.storage = new RedisStorage(client);
        redisHealth.set(1);
        logger.info('Rate limiter using Redis storage');
      } else {
        this.storage = new MemoryStorage();
        redisHealth.set(0);
        logger.warn('Rate limiter using in-memory storage (not distributed)');
      }
    } catch (err) {
      this.storage = new MemoryStorage();
      redisHealth.set(0);
      logger.error({ err }, 'Rate limiter initialization failed, using in-memory storage (not distributed)');
    }

    this.strategies.set('default', createStrategy(this.config.default));

    if (this.config.tiers) {
      for (const [tier, tierConfig] of Object.entries(this.config.tiers)) {
        if (tierConfig) {
          this.strategies.set(tier, createStrategy(tierConfig));
        }
      }
    }
  }

  private getTierStrategies(context: KeyContext): Array<{ tier: string; strategy: IStrategy; key: string }> {
    const result: Array<{ tier: string; strategy: IStrategy; key: string }> = [];
    const prefix = this.config.keyPrefix || 'rate_limit';

    result.push({
      tier: 'default',
      strategy: this.strategies.get('default')!,
      key: `${prefix}:default:${context.ip}`,
    });

    if (context.userId && this.strategies.has('user')) {
      result.push({
        tier: 'user',
        strategy: this.strategies.get('user')!,
        key: `${prefix}:user:${context.userId}`,
      });
    }

    if (context.endpoint && this.strategies.has('endpoint')) {
      result.push({
        tier: 'endpoint',
        strategy: this.strategies.get('endpoint')!,
        key: `${prefix}:endpoint:${context.method}:${context.endpoint}`,
      });
    }

    return result;
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!this.storage || this.strategies.size === 0) {
        await this.initialize();
      }

      const context: KeyContext = {
        ip: extractClientIp(req) || 'unknown',
        userId: determineUserId(req),
        endpoint: req.route?.path || req.path,
        method: req.method,
      };

      const tierStrategies = this.getTierStrategies(context);
      let mostRestrictive: RateLimitResult | null = null;
      let blockedResult: RateLimitResult | null = null;

      for (const { tier, strategy, key } of tierStrategies) {
        const result = await strategy.check(this.storage, key, context);
        rateLimitDecisions.labels({ strategy: strategy.name, tier, allowed: String(result.allowed) }).inc();

        if (!result.allowed) {
          blockedResult = result;
          break;
        }

        // Track the most restrictive (lowest remaining)
        if (!mostRestrictive || result.remaining < mostRestrictive.remaining) {
          mostRestrictive = result;
        }
      }

      const finalResult = blockedResult || mostRestrictive;

      if (!finalResult) {
        return next();
      }

      res.setHeader('RateLimit-Limit', finalResult.limit);
      res.setHeader('RateLimit-Remaining', Math.max(0, finalResult.remaining));
      res.setHeader('RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + finalResult.retryAfter));

      if (blockedResult) {
        logger.warn({
          ip: context.ip,
          userId: context.userId,
          path: req.path,
          current: finalResult.current,
          limit: finalResult.limit,
        }, 'Rate limit exceeded');

        return res.status(429).json({
          error: 'Too many requests. Please try again later.',
          retryAfter: finalResult.retryAfter,
          current: finalResult.current,
          limit: finalResult.limit,
        });
      }

      next();
    };
  }

  async healthCheck(): Promise<{ ok: boolean; storage: string; strategies: string[]; redis: string }> {
    return {
      ok: this.storage?.isAvailable() ?? false,
      storage: this.storage?.constructor.name ?? 'not initialized',
      strategies: Array.from(this.strategies.keys()),
      redis: isRedisAvailable() ? 'connected' : 'disconnected',
    };
  }

  async syncStorage() {
    try {
      const client = await getRedisClient();
      if (isRedisAvailable() && !(this.storage instanceof RedisStorage)) {
        this.storage = new RedisStorage(client);
        redisHealth.set(1);
        logger.info('Rate limiter switched to Redis storage');
      }
    } catch {
      // keep current storage
    }
  }
}
