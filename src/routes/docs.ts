import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Advanced API Rate Limiter',
      version: '2.0.0',
      description: 'A distributed rate limiting system supporting multiple algorithms (Token Bucket, Leaky Bucket, Sliding Window Log, Sliding Window Counter) with Redis-backed atomic operations.',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Development server' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/middleware/*.ts'],
};

const specs = swaggerJsdoc(options);

const router = Router();
router.use('/docs', swaggerUi.serve, swaggerUi.setup(specs));
router.get('/api-docs.json', (_req, res) => res.json(specs));

export default router;
