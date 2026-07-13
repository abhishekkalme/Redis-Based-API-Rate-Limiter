import fs from 'fs';
import path from 'path';
import type { RedisClientType } from 'redis';
import type { StorageData, IStorage } from './IStorage';
import { logger } from '../monitoring/logger';

function loadLua(name: string): string {
  const p = path.join(__dirname, '..', 'lua', `${name}.lua`);
  return fs.readFileSync(p, 'utf-8');
}

export class RedisStorage implements IStorage {
  private client: RedisClientType;
  private available = true;
  private scripts: Map<string, string> = new Map();

  constructor(client: RedisClientType) {
    this.client = client;
    this.loadScripts();
  }

  private loadScripts() {
    try {
      this.scripts.set('token_bucket', loadLua('token_bucket'));
      this.scripts.set('leaky_bucket', loadLua('leaky_bucket'));
      this.scripts.set('sliding_window_log', loadLua('sliding_window_log'));
      this.scripts.set('sliding_window_counter', loadLua('sliding_window_counter'));
    } catch (err) {
      logger.error({ err }, 'Failed to load Lua scripts');
      this.available = false;
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  async increment(key: string, windowMs: number, max: number): Promise<StorageData> {
    try {
      const script = this.scripts.get('sliding_window_counter')!;
      const result = await this.client.eval(script, {
        keys: [key],
        arguments: [String(windowMs), String(max)],
      }) as number[];
      return { allowed: result[0] === 1, count: result[1], limit: result[2], retryAfter: result[3] };
    } catch (err) {
      logger.error({ err, key }, 'Redis increment failed');
      this.available = false;
      return { allowed: true, count: 0, limit: max, retryAfter: 0 };
    }
  }

  async slidingWindowLog(key: string, windowMs: number, max: number, now: number): Promise<StorageData> {
    try {
      const script = this.scripts.get('sliding_window_log')!;
      const result = await this.client.eval(script, {
        keys: [key],
        arguments: [String(windowMs), String(max), String(now)],
      }) as number[];
      return { allowed: result[0] === 1, count: result[1], limit: result[2], retryAfter: result[3] };
    } catch (err) {
      logger.error({ err, key }, 'Redis slidingWindowLog failed');
      this.available = false;
      return { allowed: true, count: 0, limit: max, retryAfter: 60 };
    }
  }

  async tokenBucket(key: string, maxTokens: number, refillRate: number, cost: number, now: number): Promise<StorageData> {
    try {
      const script = this.scripts.get('token_bucket')!;
      const result = await this.client.eval(script, {
        keys: [key],
        arguments: [String(maxTokens), String(refillRate), String(now), String(cost)],
      }) as number[];
      return { allowed: result[0] === 1, count: result[1], limit: result[2], retryAfter: result[3] };
    } catch (err) {
      logger.error({ err, key }, 'Redis tokenBucket failed');
      this.available = false;
      return { allowed: true, count: 0, limit: maxTokens, retryAfter: 60 };
    }
  }

  async leakyBucket(key: string, maxTokens: number, leakRate: number, cost: number, now: number): Promise<StorageData> {
    try {
      const script = this.scripts.get('leaky_bucket')!;
      const result = await this.client.eval(script, {
        keys: [key],
        arguments: [String(maxTokens), String(leakRate), String(now), String(cost)],
      }) as number[];
      return { allowed: result[0] === 1, count: result[1], limit: result[2], retryAfter: result[3] };
    } catch (err) {
      logger.error({ err, key }, 'Redis leakyBucket failed');
      this.available = false;
      return { allowed: true, count: 0, limit: maxTokens, retryAfter: 60 };
    }
  }

  async quit(): Promise<void> {
    await this.client.disconnect();
  }
}
