import type { RateLimitResult, KeyContext, StrategyConfig } from '../types';
import type { IStorage } from '../storage/IStorage';
import type { IStrategy } from './IStrategy';

export class SlidingWindowLog implements IStrategy {
  readonly name = 'sliding-window-log';
  private config: StrategyConfig;

  constructor(config: StrategyConfig) {
    this.config = config;
  }

  async check(storage: IStorage, key: string, _context: KeyContext): Promise<RateLimitResult> {
    const now = Date.now();
    const data = await storage.slidingWindowLog(key, this.config.windowMs, this.config.max, now);
    return {
      allowed: data.allowed,
      current: data.count,
      limit: data.limit,
      remaining: Math.max(0, data.limit - data.count),
      retryAfter: data.retryAfter,
    };
  }
}
