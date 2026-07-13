import { createApp } from './app';
import { appConfig } from './config';
import { logger } from './monitoring/logger';
import { closeRedis, getRedisClient } from './config/redis';

async function main() {
  const { app } = await createApp();

  const server = app.listen(appConfig.port, () => {
    logger.info({ port: appConfig.port, strategy: appConfig.defaultStrategy }, 'Rate limiter server started');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down gracefully...');
    server.close(async () => {
      await closeRedis();
      logger.info('Server shut down complete');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'Unhandled rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    process.exit(1);
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
