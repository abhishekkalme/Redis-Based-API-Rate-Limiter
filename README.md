# Advanced API Rate Limiter

A distributed rate limiting system supporting multiple algorithms with Redis-backed atomic operations, Docker orchestration, Prometheus monitoring, and a live dashboard.

## Features

### Rate Limiting Algorithms
| Algorithm | Behavior |
|---|---|
| **Token Bucket** (default) | Allows bursts up to capacity, refills steadily |
| **Leaky Bucket** | Smooths output to constant rate |
| **Sliding Window Log** | Precise tracking via sorted timestamps |
| **Sliding Window Counter** | Memory-efficient TTL counter |

### Tiered Limiting
| Tier | Default Limit | Key |
|---|---|---|
| Per-IP | 10 req/min | Client IP |
| Per-User | 20 req/min | `X-API-Key` header |
| Per-Endpoint | 30 req/min | Route path + method |

Most restrictive tier wins. All tiers use atomic Lua scripts on Redis.

### Observability
- **Prometheus** metrics at `/metrics` (latency histograms, decision counters, Redis health)
- **Pino** structured logging with request correlation
- **Grafana** dashboard pre-configured at `http://localhost:3001`
- **Health** endpoint at `/health`

### API Docs
- **Swagger UI** at `/docs` | **Dashboard** at `/dashboard`

## Quick Start (Local Dev)

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [Redis](https://redis.io/) (optional — falls back to in-memory)

### Setup
```bash
npm install
npm run dev
```

Server starts at `http://localhost:3000`.

### Test
```bash
# 13 unit + integration tests
npm test

# With coverage
npm run test:coverage

# Manual curl test
curl http://localhost:3000/api/resource
```

## Usage

### API Endpoints

| Endpoint | Rate Limited | Description |
|---|---|---|
| `GET /` | No | API info & available strategies |
| `GET /api/resource` | Yes (10/min per IP) | Protected resource |
| `GET /api/resource` (with `X-API-Key` header) | Yes (20/min per user) | Higher per-user limit |
| `GET /health` | No | Health check with rate limiter status |
| `GET /metrics` | No | Prometheus metrics |
| `GET /docs` | No | Swagger UI |
| `GET /dashboard` | No | Live dashboard UI |
| `GET /ui` | No | Alias for dashboard |

### Rate Limit Headers

Every response includes:

| Header | Description |
|---|---|
| `RateLimit-Limit` | Max requests allowed in the window |
| `RateLimit-Remaining` | Requests remaining in the window |
| `RateLimit-Reset` | Unix timestamp when the limit resets |

When blocked (HTTP 429):
```json
{
  "error": "Too many requests. Please try again later.",
  "retryAfter": 42,
  "current": 10,
  "limit": 10
}
```

### Dashboard UI

Open `http://localhost:3000/dashboard` for a live visualization:

- **Rate Limit Status** — Real-time gauge with current/limit/remaining + animated progress bar
- **Control Panel** — Switch between 4 strategies, set API key for user tier, custom IP
- **Fire Request** — Send individual requests with instant feedback
- **Auto-Spam (10 req)** — Sends 10 rapid requests to trigger the rate limit
- **Request History** — Color-coded table (200=green, 429=red) with latency, headers, tier info
- **Health Indicator** — Live Redis + storage status



## Docker

### Full Stack (3 app instances + Nginx + Redis + Prometheus + Grafana)
```bash
npm run docker:up
```

Access:
- **API (via Nginx):** `http://localhost:80`
- **Grafana Dashboard:** `http://localhost:3001` (admin/admin)
- **Prometheus:** `http://localhost:9090`

### Architecture

```
Nginx (:80)
  |
  +-- app1 (:3000)
  +-- app2 (:3000)
  +-- app3 (:3000)
       |
       +-- Redis (:6379)
       +-- Prometheus (:9090)
              |
              +-- Grafana (:3001)
```



## Deploy to a Docker-Friendly PaaS

All three options below run your existing `Dockerfile` unchanged and preserve the
distributed Redis rate limiter. The only thing they don't run is
`docker-compose` itself, so Redis (and optionally Prometheus/Grafana) are added
as platform-native services instead of compose services.

> **Before deploying:** copy `.env.example` to `.env` and fill in values.
> On every platform below, `PORT` is injected automatically by the platform.

### Railway (full stack, closest to docker-compose)

Railway runs the `Dockerfile` directly and lets you add each service as its own
Railway service in one project.

1. Create a project and add a **service** from your GitHub repo (Railway auto-detects the `Dockerfile`).
2. Add a **Redis** plugin to the project and link it to the app service — Railway injects `REDIS_URL` automatically.
3. (Optional) Add **Prometheus** (`prom/prometheus`, mount `prometheus.yml`) and **Grafana** (`grafana/grafana`, mount `grafana/`) services in the same project for the full monitoring stack.
4. `railway.json` is already committed — it sets the Docker builder, `/health` healthcheck, and restarts on failure.
5. Deploy: `railway up` (or push to the linked branch).

The app reads `REDIS_URL` from the environment, so no code changes are needed.

### Fly.io (multi-region, machines)

1. `fly.toml` is committed — it builds with the `Dockerfile`, exposes port 3000, and health-checks `/health`.
2. Provision Redis (Fly Redis is Upstash-backed) and attach the URL as a secret:
   ```bash
   fly redis create
   fly secrets set REDIS_URL=<url-from-previous-step> REDIS_TLS=true
   ```
3. (Optional) Deploy Prometheus/Grafana as separate Fly apps using their public images.
4. Deploy: `fly deploy`.

### Render (simplest, app + managed Redis)

1. Create a **Web Service** → link repo → choose **Docker** as the environment (uses `Dockerfile`).
2. Add a **Redis** managed add-on; Render injects `REDIS_URL` into the web service.
3. Prometheus/Grafana are **not** part of Render's free tier — run them locally or via a separate host if you need the full monitoring stack.
4. Set `NODE_ENV=production` in the service's environment variables.

For every platform, the healthcheck at `/health` gates traffic, and the dashboard
is served at `/dashboard` (or `/ui`) on the same host.

## Load Testing

Requires [k6](https://k6.io/):
```bash
# Local
npm run benchmark

# Against Docker stack
BASE_URL=http://localhost npm run benchmark
```

Default thresholds:
- p95 latency < 50ms
- p99 latency < 100ms
- < 50% blocked rate (10 req/min per IP from same VU)

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | 3000 | Server port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `REDIS_TLS` | `false` | Enable TLS for Redis |
| `RATE_LIMIT_STRATEGY` | `token-bucket` | Default algorithm |
| `LOG_LEVEL` | `info` | Pino log level |
| `NODE_ENV` | `development` | Environment |

### Rate Limiter Config (in `src/app.ts`)

```typescript
{
  default: { name: 'token-bucket', windowMs: 60000, max: 10, bucketSize: 10, refillRate: 10/60 },
  tiers: {
    ip:       { name: 'token-bucket',          windowMs: 60000, max: 10, bucketSize: 10, refillRate: 10/60 },
    user:     { name: 'token-bucket',          windowMs: 60000, max: 20, bucketSize: 20, refillRate: 20/60 },
    endpoint: { name: 'sliding-window-counter', windowMs: 60000, max: 30 },
  }
}
```

## Project Structure

```
public/              # Frontend dashboard UI
├── index.html       # Dashboard markup (was dashboard.html)
├── css/
│   └── dashboard.css # Dashboard styles
└── js/
    └── dashboard.js  # Dashboard logic + visualizations
src/
├── config/           # Environment config + Redis client
├── strategies/       # Strategy pattern: TokenBucket, LeakyBucket, SlidingWindowLog, SlidingWindowCounter
├── storage/          # IStorage interface + RedisStorage (Lua) + MemoryStorage (fallback)
├── middleware/       # Tiered rate limiter middleware
├── monitoring/       # Prometheus metrics + Pino logger
├── routes/           # /api/resource, /health, /metrics, /docs, /dashboard
├── lua/              # 4 atomic Lua scripts for race-condition-free Redis
├── types/            # Shared TypeScript interfaces
├── utils/            # IP extraction utilities
├── test/unit/        # Strategy + storage unit tests
├── test/integration/ # Full HTTP integration tests
├── app.ts            # Express app setup
└── index.ts          # Entry point with graceful shutdown
```

## Tech Stack

- **Runtime:** Node.js 20+ with TypeScript
- **Framework:** Express 5
- **Database:** Redis 7 (with in-memory fallback)
- **Monitoring:** Prometheus + Grafana
- **Logging:** Pino
- **Testing:** Vitest + Supertest
- **Containerization:** Docker + Docker Compose
- **Load Balancing:** Nginx
- **Documentation:** Swagger/OpenAPI 3.0
- **Load Testing:** k6
