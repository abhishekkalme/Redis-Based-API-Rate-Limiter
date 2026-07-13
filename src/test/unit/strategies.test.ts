import { describe, it, expect } from 'vitest';
import { TokenBucket } from '../../strategies/TokenBucket';
import { LeakyBucket } from '../../strategies/LeakyBucket';
import { SlidingWindowLog } from '../../strategies/SlidingWindowLog';
import { SlidingWindowCounter } from '../../strategies/SlidingWindowCounter';
import { MemoryStorage } from '../../storage/MemoryStorage';

function makeConfig(overrides = {}) {
  return {
    name: 'token-bucket' as const,
    windowMs: 60_000,
    max: 10,
    bucketSize: 10,
    refillRate: 10 / 60,
    ...overrides,
  };
}

describe('TokenBucket', () => {
  it('allows requests up to capacity', async () => {
    const storage = new MemoryStorage();
    const strategy = new TokenBucket(makeConfig());

    for (let i = 0; i < 10; i++) {
      const result = await strategy.check(storage, 'test:ip:1', { ip: '1' });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9 - i);
    }
  });

  it('blocks when tokens exhausted', async () => {
    const storage = new MemoryStorage();
    const strategy = new TokenBucket(makeConfig({ max: 3, bucketSize: 3, refillRate: 0 }));

    for (let i = 0; i < 3; i++) {
      const result = await strategy.check(storage, 'test:ip:2', { ip: '2' });
      expect(result.allowed).toBe(true);
    }

    const blocked = await strategy.check(storage, 'test:ip:2', { ip: '2' });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });
});

describe('LeakyBucket', () => {
  it('allows burst then blocks', async () => {
    const storage = new MemoryStorage();
    const strategy = new LeakyBucket(makeConfig({ name: 'leaky-bucket', max: 5, bucketSize: 5, refillRate: 5 / 60 }));

    for (let i = 0; i < 5; i++) {
      const result = await strategy.check(storage, 'test:ip:3', { ip: '3' });
      expect(result.allowed).toBe(true);
    }

    const blocked = await strategy.check(storage, 'test:ip:3', { ip: '3' });
    expect(blocked.allowed).toBe(false);
  });
});

describe('SlidingWindowLog', () => {
  it('allows requests within window', async () => {
    const storage = new MemoryStorage();
    const strategy = new SlidingWindowLog(makeConfig({ name: 'sliding-window-log' }));

    for (let i = 0; i < 10; i++) {
      const result = await strategy.check(storage, 'test:ip:4', { ip: '4' });
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks when window is full', async () => {
    const storage = new MemoryStorage();
    const strategy = new SlidingWindowLog(makeConfig({ name: 'sliding-window-log', max: 2 }));

    await strategy.check(storage, 'test:ip:5', { ip: '5' });
    await strategy.check(storage, 'test:ip:5', { ip: '5' });
    const blocked = await strategy.check(storage, 'test:ip:5', { ip: '5' });

    expect(blocked.allowed).toBe(false);
  });
});

describe('SlidingWindowCounter', () => {
  it('allows up to max then blocks', async () => {
    const storage = new MemoryStorage();
    const strategy = new SlidingWindowCounter(makeConfig({ name: 'sliding-window-counter' }));

    for (let i = 0; i < 10; i++) {
      const result = await strategy.check(storage, 'test:ip:6', { ip: '6' });
      expect(result.allowed).toBe(true);
    }

    const blocked = await strategy.check(storage, 'test:ip:6', { ip: '6' });
    expect(blocked.allowed).toBe(false);
  });
});

describe('MemoryStorage fallback', () => {
  it('handles multiple keys independently', async () => {
    const storage = new MemoryStorage();
    const strategy = new TokenBucket(makeConfig({ max: 2, bucketSize: 2, refillRate: 0 }));

    await strategy.check(storage, 'key:a', { ip: 'a' });
    await strategy.check(storage, 'key:a', { ip: 'a' });
    const aBlocked = await strategy.check(storage, 'key:a', { ip: 'a' });
    expect(aBlocked.allowed).toBe(false);

    const bResult = await strategy.check(storage, 'key:b', { ip: 'b' });
    expect(bResult.allowed).toBe(true);
  });

  it('is always available', () => {
    const storage = new MemoryStorage();
    expect(storage.isAvailable()).toBe(true);
  });
});
