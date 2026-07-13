import type { RateLimitResult, KeyContext } from '../types';
import type { IStorage } from '../storage/IStorage';

export interface IStrategy {
  readonly name: string;
  check(storage: IStorage, key: string, context: KeyContext): Promise<RateLimitResult>;
}
