import { createClient, type RedisClientType } from 'redis';
import { appConfig } from './index';
import { logger } from '../monitoring/logger';

let client: RedisClientType | null = null;
let isConnected = false;

export async function getRedisClient(): Promise<RedisClientType> {
  if (client && isConnected) return client;

  client = createClient({
    url: appConfig.redisUrl,
    socket: {
      ...(appConfig.redisEnableTls ? { tls: {} as any } : {}),
      reconnectStrategy: (retries: number) => Math.min(retries * 100, 3000),
    } as any,
  });

  client.on('error', (err) => {
    logger.error({ err }, 'Redis client error');
    isConnected = false;
  });

  client.on('connect', () => {
    logger.info('Redis client connected');
    isConnected = true;
  });

  client.on('end', () => {
    isConnected = false;
  });

  try {
    await client.connect();
    isConnected = true;
  } catch (err) {
    logger.error({ err }, 'Failed to connect to Redis, using memory fallback');
    isConnected = false;
  }

  return client;
}

export function isRedisAvailable(): boolean {
  return isConnected;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.disconnect();
    client = null;
    isConnected = false;
  }
}
