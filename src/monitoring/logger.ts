import pino from 'pino';
import { appConfig } from '../config';

export const logger = pino({
  level: appConfig.logLevel,
  transport: appConfig.nodeEnv === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  serializers: {
    req: (req) => ({ method: req.method, url: req.url, ip: req.ip }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
