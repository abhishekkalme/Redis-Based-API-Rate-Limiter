import { Router } from 'express';

const router = Router();

router.get('/resource', (_req, res) => {
  res.json({
    message: 'Access granted to protected resource.',
    timestamp: new Date().toISOString(),
    instance: process.env.HOSTNAME || process.pid.toString(),
  });
});

export default router;
