export type StrategyName =
  | 'token-bucket'
  | 'leaky-bucket'
  | 'sliding-window-log'
  | 'sliding-window-counter';

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  retryAfter: number;
}

export interface StrategyConfig {
  name: StrategyName;
  windowMs: number;
  max: number;
  refillRate?: number;
  bucketSize?: number;
}

export interface TierConfig {
  ip: StrategyConfig;
  user: StrategyConfig;
  endpoint: StrategyConfig;
}

export interface RateLimiterConfig {
  default: StrategyConfig;
  tiers?: Partial<TierConfig>;
  keyPrefix?: string;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  redisUrl: string;
  redisEnableTls: boolean;
  defaultStrategy: StrategyName;
  logLevel: string;
}

export interface KeyContext {
  ip: string;
  userId?: string;
  endpoint?: string;
  method?: string;
}
