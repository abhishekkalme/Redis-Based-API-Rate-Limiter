import dotenv from 'dotenv';
import type { AppConfig, StrategyName } from '../types';

dotenv.config();

export const appConfig: AppConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  redisEnableTls: process.env.REDIS_TLS === 'true',
  defaultStrategy: (process.env.RATE_LIMIT_STRATEGY || 'token-bucket') as StrategyName,
  logLevel: process.env.LOG_LEVEL || 'info',
};
