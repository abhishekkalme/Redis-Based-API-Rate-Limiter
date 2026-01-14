# API Rate Limiter

A simple API Rate Limiter implementation using Node.js, Express, and Redis.

## Features

- Limits API requests to prevent overload (Default: 10 requests per minute).
- Uses Redis for scalable state management.
- Built with `express-rate-limit` and `rate-limit-redis`.

## Prerequisites

- [Node.js](https://nodejs.org/) (v14+)
- [Redis](https://redis.io/) (Running on `localhost:6379`)

## Installation

1. Clone the repository (or download source).
2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

1. Create a `.env` file in the root directory:
   ```env
   PORT=3000
   REDIS_URL=redis://localhost:6379
   ```

2. The application will automatically load these settings.

## Usage

1. **Start Redis server** (if not already running).

2. **Start the API server**:
   ```bash
   npm start
   # or
   node src/index.js
   ```
   Server runs on `http://localhost:3000`.

3. **Run Test Script**:
   ```bash
   node test_limiter.js
   ```
   This script mimics 12 requests to verify that the 11th and 12th are blocked.

## Endpoints

- `GET /` - Public endpoint.
- `GET /api/resource` - Rate limited endpoint (Max 10 req/min).
