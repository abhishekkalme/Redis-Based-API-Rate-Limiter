import type { StrategyConfig, StrategyName } from '../types';
import type { IStrategy } from './IStrategy';
import { TokenBucket } from './TokenBucket';
import { LeakyBucket } from './LeakyBucket';
import { SlidingWindowLog } from './SlidingWindowLog';
import { SlidingWindowCounter } from './SlidingWindowCounter';

const registry: Record<StrategyName, new (config: StrategyConfig) => IStrategy> = {
  'token-bucket': TokenBucket,
  'leaky-bucket': LeakyBucket,
  'sliding-window-log': SlidingWindowLog,
  'sliding-window-counter': SlidingWindowCounter,
};

export function createStrategy(config: StrategyConfig): IStrategy {
  const StrategyClass = registry[config.name];
  if (!StrategyClass) {
    throw new Error(`Unknown strategy: ${config.name}`);
  }
  return new StrategyClass(config);
}

export { IStrategy };
export { TokenBucket } from './TokenBucket';
export { LeakyBucket } from './LeakyBucket';
export { SlidingWindowLog } from './SlidingWindowLog';
export { SlidingWindowCounter } from './SlidingWindowCounter';
