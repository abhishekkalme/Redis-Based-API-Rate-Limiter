import { createClient, type RedisClientType } from 'redis';
import { appConfig } from './index';
import { logger } from '../monitoring/logger';

let client: RedisClientType | null = null;
let isConnected = false;

function redactedTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '<unparseable url>';
  }
}

export async function getRedisClient(): Promise<RedisClientType> {
  if (client && isConnected) return client;

  logger.info({ target: redactedTarget(appConfig.redisUrl) }, 'Connecting to Redis');

  // rediss:// already implies TLS; setting socket.tls on top causes node-redis
  // to throw (tls option mismatch with URL protocol).
  const tlsFromScheme = appConfig.redisUrl.startsWith('rediss://');
  const useTlsSocket = appConfig.redisEnableTls && !tlsFromScheme;

  client = createClient({
    url: appConfig.redisUrl,
    socket: {
      ...(useTlsSocket ? { tls: {} as any } : {}),
      connectTimeout: 5000,
      reconnectStrategy: false,
    } as any,
  });

  client.on('error', (err) => {
    logger.error({ err, target: redactedTarget(appConfig.redisUrl) }, 'Redis client error');
    isConnected = false;
  });

  client.on('connect', () => {
    logger.info('Redis client connected');
    isConnected = true;
  });

  client.on('end', () => {
    logger.warn('Redis connection ended');
    isConnected = false;
  });

  try {
    await client.connect();
    isConnected = true;
  } catch (err) {
    logger.error({ err, target: redactedTarget(appConfig.redisUrl) }, 'Failed to connect to Redis, using memory fallback');
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
