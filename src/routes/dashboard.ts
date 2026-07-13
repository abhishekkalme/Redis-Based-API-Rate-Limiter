import { Router, static as expressStatic } from 'express';
import path from 'path';

const router = Router();
const publicDir = path.join(__dirname, '..', '..', 'public');

router.use(expressStatic(publicDir));

router.get(['/', '/dashboard', '/ui'], (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

export default router;
