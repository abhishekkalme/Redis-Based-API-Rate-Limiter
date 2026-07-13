import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const rateLimitBlocked = new Rate('rate_limit_blocked');
const latencyTrend = new Trend('request_latency_ms');

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Ramp up to 50 VUs
    { duration: '1m', target: 100 },   // Ramp to 100 VUs
    { duration: '2m', target: 200 },   // Ramp to 200 VUs (stress test)
    { duration: '1m', target: 100 },   // Scale down
    { duration: '30s', target: 0 },    // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<50', 'p(99)<100'],  // 95% under 50ms, 99% under 100ms
    http_req_failed: ['rate<0.01'],
    rate_limit_blocked: ['rate<0.5'], // Expect <50% blocked (10 req/min per IP from same VUs)
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${BASE_URL}/api/resource`, {
    headers: { 'X-Forwarded-For': `192.168.1.${__VU}` },
  });

  latencyTrend.add(res.timings.duration);

  const isBlocked = res.status === 429;
  rateLimitBlocked.add(isBlocked);

  check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
    'has rate limit headers': (r) => r.headers['RateLimit-Remaining'] !== undefined,
    'response time < 50ms': (r) => r.timings.duration < 50,
  });

  sleep(0.5);
}
