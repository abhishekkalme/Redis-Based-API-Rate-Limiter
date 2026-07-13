import type { RateLimitResult, KeyContext, StrategyConfig } from '../types';
import type { IStorage } from '../storage/IStorage';
import type { IStrategy } from './IStrategy';

export class TokenBucket implements IStrategy {
  readonly name = 'token-bucket';
  private config: StrategyConfig;

  constructor(config: StrategyConfig) {
    this.config = config;
  }

  get maxTokens(): number {
    return this.config.bucketSize ?? this.config.max;
  }

  get refillRate(): number {
    return this.config.refillRate ?? (this.config.max / (this.config.windowMs / 1000));
  }

  async check(storage: IStorage, key: string, _context: KeyContext): Promise<RateLimitResult> {
    const now = Date.now();
    const data = await storage.tokenBucket(key, this.maxTokens, this.refillRate, 1, now);
    return {
      allowed: data.allowed,
      current: data.count,
      limit: data.limit,
      remaining: Math.max(0, data.limit - data.count),
      retryAfter: data.retryAfter,
    };
  }
}
