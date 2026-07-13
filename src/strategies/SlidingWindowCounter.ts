import type { RateLimitResult, KeyContext, StrategyConfig } from '../types';
import type { IStorage } from '../storage/IStorage';
import type { IStrategy } from './IStrategy';

export class SlidingWindowCounter implements IStrategy {
  readonly name = 'sliding-window-counter';
  private config: StrategyConfig;

  constructor(config: StrategyConfig) {
    this.config = config;
  }

  async check(storage: IStorage, key: string, _context: KeyContext): Promise<RateLimitResult> {
    const data = await storage.increment(key, this.config.windowMs, this.config.max);
    return {
      allowed: data.allowed,
      current: data.count,
      limit: data.limit,
      remaining: Math.max(0, data.limit - data.count),
      retryAfter: data.retryAfter,
    };
  }
}
