import type { StorageData, IStorage } from './IStorage';

interface BucketEntry {
  tokens: number;
  lastRefill: number;
}

interface CounterEntry {
  count: number;
  expiresAt: number;
}

export class MemoryStorage implements IStorage {
  private counters = new Map<string, CounterEntry>();
  private logs = new Map<string, number[]>();
  private buckets = new Map<string, BucketEntry>();

  isAvailable(): boolean {
    return true;
  }

  async increment(key: string, windowMs: number, max: number): Promise<StorageData> {
    const now = Date.now();
    const entry = this.counters.get(key);

    if (!entry || now > entry.expiresAt) {
      this.counters.set(key, { count: 1, expiresAt: now + windowMs });
      return { allowed: true, count: 1, limit: max, retryAfter: 0 };
    }

    entry.count++;
    if (entry.count <= max) {
      return { allowed: true, count: entry.count, limit: max, retryAfter: 0 };
    }

    const retryAfter = Math.ceil((entry.expiresAt - now) / 1000);
    return { allowed: false, count: entry.count, limit: max, retryAfter };
  }

  async slidingWindowLog(key: string, windowMs: number, max: number, now: number): Promise<StorageData> {
    const timestamps = this.logs.get(key) || [];
    const windowStart = now - windowMs;

    const filtered = timestamps.filter(t => t > windowStart);

    if (filtered.length < max) {
      filtered.push(now);
      this.logs.set(key, filtered);
      return { allowed: true, count: filtered.length, limit: max, retryAfter: 0 };
    }

    const oldest = filtered[0];
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, count: filtered.length, limit: max, retryAfter };
  }

  async tokenBucket(key: string, maxTokens: number, refillRate: number, cost: number, now: number): Promise<StorageData> {
    const entry = this.buckets.get(key);
    let tokens: number;
    let lastRefill: number;

    if (!entry) {
      tokens = maxTokens - cost;
      lastRefill = now;
      this.buckets.set(key, { tokens, lastRefill });
      return { allowed: true, count: 1, limit: maxTokens, retryAfter: 0 };
    }

    const elapsed = (now - entry.lastRefill) / 1000;
    const refill = Math.floor(elapsed * refillRate);
    tokens = Math.min(maxTokens, entry.tokens + refill);
    lastRefill = refill > 0 ? now : entry.lastRefill;

    if (tokens >= cost) {
      tokens -= cost;
      this.buckets.set(key, { tokens, lastRefill });
      return { allowed: true, count: maxTokens - tokens, limit: maxTokens, retryAfter: 0 };
    }

    const retryAfter = refillRate > 0 ? Math.ceil((cost - tokens) / refillRate) : 60;
    this.buckets.set(key, { tokens, lastRefill });
    return { allowed: false, count: maxTokens - tokens, limit: maxTokens, retryAfter };
  }

  async leakyBucket(key: string, maxTokens: number, leakRate: number, cost: number, now: number): Promise<StorageData> {
    return this.tokenBucket(key, maxTokens, leakRate, cost, now);
  }

  async quit(): Promise<void> {
    this.counters.clear();
    this.logs.clear();
    this.buckets.clear();
  }
}
