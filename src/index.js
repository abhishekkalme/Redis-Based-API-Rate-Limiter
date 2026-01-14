const express = require('express');
require('dotenv').config();
const limiter = require('./middleware/rateLimiter');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

// Public route (not rate limited, if we wanted to exclude it, but here we apply globally for simplicity, 
// or we can apply middleware to specific routes)
app.get('/', (req, res) => {
  res.send('Welcome to the API Rate Limiter Demo! Try hitting /api/resource');
});

// Apply rate limiter to this specific route (or globally using app.use(limiter))
// For this demo, let's apply it to /api endpoints
app.use('/api', limiter);

app.get('/api/resource', (req, res) => {
  res.json({ 
      message: 'Access granted to protected resource.',
      timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
