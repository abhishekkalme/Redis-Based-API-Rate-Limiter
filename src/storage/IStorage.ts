export interface StorageData {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfter: number;
}

export interface IStorage {
  increment(key: string, windowMs: number, max: number): Promise<StorageData>;
  slidingWindowLog(key: string, windowMs: number, max: number, now: number): Promise<StorageData>;
  tokenBucket(key: string, maxTokens: number, refillRate: number, cost: number, now: number): Promise<StorageData>;
  leakyBucket(key: string, maxTokens: number, leakRate: number, cost: number, now: number): Promise<StorageData>;
  isAvailable(): boolean;
  quit(): Promise<void>;
}
