import type { RateLimitResult, KeyContext, StrategyConfig } from '../types';
import type { IStorage } from '../storage/IStorage';
import type { IStrategy } from './IStrategy';

export class LeakyBucket implements IStrategy {
  readonly name = 'leaky-bucket';
  private config: StrategyConfig;

  constructor(config: StrategyConfig) {
    this.config = config;
  }

  get maxWater(): number {
    return this.config.bucketSize ?? this.config.max;
  }

  get leakRate(): number {
    return this.config.refillRate ?? (this.config.max / (this.config.windowMs / 1000));
  }

  async check(storage: IStorage, key: string, _context: KeyContext): Promise<RateLimitResult> {
    const now = Date.now();
    const data = await storage.leakyBucket(key, this.maxWater, this.leakRate, 1, now);
    return {
      allowed: data.allowed,
      current: data.count,
      limit: data.limit,
      remaining: Math.max(0, data.limit - data.count),
      retryAfter: data.retryAfter,
    };
  }
}
