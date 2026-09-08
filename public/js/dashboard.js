const BASE = '';

let history = [];
let autoSpamming = false;
let autoInterval = null;
let requestCount = 0;
let allowedCount = 0;
let blockedCount = 0;

const DEFAULT_IP = '192.168.1.100';

let resetTimerInterval = null;
let resetTargetTime = 0;

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast toast-${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function animateValue(el, start, end, duration) {
  const startTime = performance.now();
  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (end - start) * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function updateSummary() {
  const totalEl = document.getElementById('sumTotal');
  const allowedEl = document.getElementById('sumAllowed');
  const blockedEl = document.getElementById('sumBlocked');
  const rateEl = document.getElementById('sumRate');

  animateValue(totalEl, parseInt(totalEl.textContent) || 0, requestCount, 200);
  animateValue(allowedEl, parseInt(allowedEl.textContent) || 0, allowedCount, 200);
  animateValue(blockedEl, parseInt(blockedEl.textContent) || 0, blockedCount, 200);
  rateEl.textContent = requestCount > 0
    ? Math.round((allowedCount / requestCount) * 100) + '%'
    : '-';
}

function updateLastResponse(status, latency, retryAfter) {
  const dot = document.getElementById('lastDot');
  const info = document.getElementById('lastInfo');
  if (status === 200) {
    dot.className = 'last-response-dot allowed';
    info.innerHTML = `<strong style="color:#22c55e">200 OK</strong> &mdash; ${latency}ms latency, request allowed`;
  } else if (status === 429) {
    dot.className = 'last-response-dot blocked';
    info.innerHTML = `<strong style="color:#ef4444">429 Blocked</strong> &mdash; retry after <strong id="lastRetryTimer">${retryAfter}s</strong>`;
  } else {
    dot.className = 'last-response-dot blocked';
    info.innerHTML = `<strong style="color:#eab308">${status}</strong> &mdash; ${latency}ms`;
  }
}

function startResetCountdown(seconds) {
  if (resetTimerInterval) clearInterval(resetTimerInterval);
  resetTargetTime = Date.now() + seconds * 1000;
  resetTimerInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((resetTargetTime - Date.now()) / 1000));
    document.getElementById('statRetryAfter').textContent = remaining;
    const timerEl = document.getElementById('lastRetryTimer');
    if (timerEl) timerEl.textContent = remaining + 's';
    if (remaining <= 0) clearInterval(resetTimerInterval);
  }, 250);
}

function resetEmptyState() {
  const empty = document.getElementById('emptyState');
  if (requestCount > 0) {
    empty.style.display = 'none';
  } else {
    empty.style.display = 'block';
  }
}

async function fetchHealth() {
  try {
    const r = await fetch(`${BASE}/health`);
    const d = await r.json();
    const dot = document.getElementById('healthDot');
    const text = document.getElementById('healthText');
    const storageBadge = document.getElementById('storageBadge');

    storageBadge.textContent = `storage: ${d.rateLimiter.storage} · redis: ${d.rateLimiter.redis}`;

    if (d.status === 'ok') {
      dot.className = 'health-dot green';
      text.textContent = 'Healthy';
    } else {
      dot.className = 'health-dot yellow';
      text.textContent = 'Degraded';
    }
  } catch {
    document.getElementById('healthDot').className = 'health-dot red';
    document.getElementById('healthText').textContent = 'Unreachable';
  }
}

function parseHeaderInt(h, key, fallback) {
  const v = h.get(key);
  if (v === null || v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

function updateStats(limit, remaining, reset) {
  const current = Math.max(0, limit - remaining);

  const currentEl = document.getElementById('statCurrent');
  const limitEl = document.getElementById('statLimit');
  const remainingEl = document.getElementById('statRemaining');

  animateValue(currentEl, parseInt(currentEl.textContent) || 0, current, 300);
  limitEl.textContent = limit;
  remainingEl.textContent = remaining;

  const pct = limit > 0 ? (current / limit) * 100 : 0;
  const bar = document.getElementById('usageBar');
  bar.style.width = Math.min(pct, 100) + '%';
  bar.className = `bar-fill ${pct < 60 ? 'ok' : pct < 85 ? 'warn' : 'danger'}`;

  bar.classList.add('flash');
  setTimeout(() => bar.classList.remove('flash'), 400);

  const label = document.getElementById('usageBarLabel');
  label.textContent = Math.round(pct) + '%';

  ['statCurrent', 'statLimit', 'statRemaining'].forEach(id => {
    document.getElementById(id).className = `value ${pct < 60 ? 'ok' : pct < 85 ? 'warn' : 'danger'}`;
  });

  if (reset > 0) startResetCountdown(Math.max(0, reset - Math.floor(Date.now() / 1000)));
}

function addHistoryRow(data) {
  history.unshift(data);
  if (history.length > 200) history.pop();
  renderHistory();
}

function renderHistory() {
  const tbody = document.getElementById('historyBody');
  if (history.length === 0) {
    tbody.innerHTML = '';
    resetEmptyState();
    return;
  }

  tbody.innerHTML = history.map(r => {
    const isBlocked = r.status === 429;
    const rowClass = isBlocked ? ' class="row-blocked"' : '';
    let statusHtml;
    if (r.status === 200) statusHtml = '<span class="status-pill ok">200</span>';
    else if (r.status === 429) statusHtml = '<span class="status-pill err">429</span>';
    else if (r.status === 'ERR') statusHtml = '<span class="status-pill warn">ERR</span>';
    else statusHtml = `<span class="status-pill warn">${r.status}</span>`;
    const resetText = r.retryAfter !== '-' ? r.retryAfter + 's' : '-';
    return `<tr${rowClass}>
      <td style="color:#64748b;">${r.num}</td>
      <td style="color:#94a3b8;">${r.time.toLocaleTimeString()}</td>
      <td><span class="method-tag">${r.method}</span></td>
      <td>${statusHtml}</td>
      <td style="color:#94a3b8;">${r.latency}ms</td>
      <td>${r.current} / ${r.limit}</td>
      <td>${r.remaining}</td>
      <td>${resetText}</td>
      <td><span class="badge badge-ok" style="font-size:10px;">${r.strategy}</span> <span style="color:#64748b;font-size:11px;">${r.tier}</span></td>
    </tr>`;
  }).join('');
}

async function fireRequest() {
  const ip = document.getElementById('ipInput').value;
  const apiKey = document.getElementById('apiKeyInput').value;
  const strategy = document.getElementById('strategySelect').value;
  const badge = document.getElementById('strategyBadge');
  badge.textContent = strategy;
  badge.className = `badge badge-ok`;

  const fireBtn = document.getElementById('fireBtn');
  fireBtn.disabled = true;
  fireBtn.classList.add('sending');
  await makeRequest(ip, apiKey, strategy);
  fireBtn.classList.remove('sending');
  fireBtn.disabled = false;
}

async function makeRequest(ip, apiKey, strategy) {
  requestCount++;
  const num = requestCount;
  const start = performance.now();
  const reqHeaders = {};

  const finalIp = ip || DEFAULT_IP;
  reqHeaders['X-Forwarded-For'] = finalIp;
  if (apiKey) reqHeaders['X-API-Key'] = apiKey;

  let response;
  try {
    response = await fetch(`${BASE}/api/resource`, { headers: reqHeaders });
  } catch (err) {
    blockedCount++;
    updateSummary();
    addHistoryRow({
      num, time: new Date(), method: 'GET', status: 'ERR',
      latency: (performance.now() - start).toFixed(1),
      current: '-', limit: '-', remaining: '-', retryAfter: '-',
      tier: apiKey ? 'user' : 'ip', strategy, error: err.message,
    });
    updateLastResponse('ERR', (performance.now() - start).toFixed(1), '-');
    if (window.vizNotifyRequest) window.vizNotifyRequest(strategy, false);
    resetEmptyState();
    return;
  }

  const latency = (performance.now() - start).toFixed(1);
  const h = response.headers;
  const limit = parseHeaderInt(h, 'ratelimit-limit', 10);
  const remaining = parseHeaderInt(h, 'ratelimit-remaining', limit);
  const reset = parseHeaderInt(h, 'ratelimit-reset', 0);
  const current = limit - remaining;

  let body = {};
  try { body = await response.json(); } catch {}

  const bodyCurrent = body.current ?? current;
  const bodyLimit = body.limit ?? limit;
  const bodyRetryAfter = body.retryAfter ?? Math.max(0, reset - Math.floor(Date.now() / 1000));

  if (response.status === 429) {
    blockedCount++;
  } else {
    allowedCount++;
  }
  updateSummary();
  updateLastResponse(response.status, latency, bodyRetryAfter);

  addHistoryRow({
    num, time: new Date(), method: 'GET', status: response.status,
    latency, current: bodyCurrent, limit: bodyLimit,
    remaining, retryAfter: bodyRetryAfter,
    tier: apiKey ? 'user' : 'ip', strategy,
  });

  updateStats(limit, remaining, reset);

  const allowed = response.status !== 429;
  if (window.vizNotifyRequest) window.vizNotifyRequest(strategy, allowed);

  if (response.status === 429) {
    showToast(`Blocked (429) - retry after ${bodyRetryAfter}s`, 'error');
  }
  resetEmptyState();
}

function toggleAutoSpam() {
  const btn = document.getElementById('autoBtn');
  const progress = document.getElementById('autoProgress');
  if (autoSpamming) {
    clearInterval(autoInterval);
    autoSpamming = false;
    btn.textContent = 'Auto-Send (10)';
    btn.classList.remove('active');
    progress.textContent = '';
    document.getElementById('fireBtn').disabled = false;
    return;
  }

  autoSpamming = true;
  btn.textContent = 'Stop';
  btn.classList.add('active');

  let count = 0;
  document.getElementById('fireBtn').disabled = true;
  progress.textContent = `0/10`;

  autoInterval = setInterval(async () => {
    if (count >= 10) {
      clearInterval(autoInterval);
      autoSpamming = false;
      btn.textContent = 'Auto-Send (10)';
      btn.classList.remove('active');
      progress.textContent = '';
      document.getElementById('fireBtn').disabled = false;
      showToast('Auto-send complete - 10 requests sent', 'success');
      return;
    }
    count++;
    progress.textContent = `${count}/10`;
    const ip = document.getElementById('ipInput').value;
    const apiKey = document.getElementById('apiKeyInput').value;
    const strategy = document.getElementById('strategySelect').value;
    await makeRequest(ip, apiKey, strategy);
  }, 200);
}

function clearAll() {
  history = [];
  requestCount = 0;
  allowedCount = 0;
  blockedCount = 0;
  renderHistory();
  updateSummary();
  document.getElementById('statCurrent').textContent = '0';
  document.getElementById('statLimit').textContent = '10';
  document.getElementById('statLimit').className = 'value ok';
  document.getElementById('statRemaining').textContent = '10';
  document.getElementById('statRemaining').className = 'value ok';
  document.getElementById('statRetryAfter').textContent = '0';
  document.getElementById('usageBar').style.width = '0%';
  document.getElementById('usageBar').className = 'bar-fill ok';
  document.getElementById('usageBarLabel').textContent = '0%';
  document.getElementById('lastDot').className = 'last-response-dot idle';
  document.getElementById('lastInfo').textContent = 'No requests sent yet';
  if (resetTimerInterval) clearInterval(resetTimerInterval);
  resetEmptyState();
}

document.getElementById('fireBtn').addEventListener('click', fireRequest);
document.getElementById('autoBtn').addEventListener('click', toggleAutoSpam);
document.getElementById('clearBtn').addEventListener('click', clearAll);

document.getElementById('strategySelect').addEventListener('change', () => {
  clearAll();
  showToast(`Switched to ${document.getElementById('strategySelect').value}`, 'info');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'textarea') return;
    e.preventDefault();
    fireRequest();
  }
});

fetchHealth();
setInterval(fetchHealth, 5000);
resetEmptyState();

// ============ Algorithm Visualizations ============
(function() {
  const vizCanvases = {};
  let lastTime = performance.now();
  let vizAnimId = null;

  const ids = ['token-bucket', 'leaky-bucket', 'sliding-window-log', 'sliding-window-counter'];

  const S = {
    tokenBucket: {
      tokens: 7, maxTokens: 10, refillAccum: 0, refillMs: 1200,
      reqs: [], time: 0, genTimer: 0, genInterval: 1800
    },
    leakyBucket: {
      level: 3, capacity: 10, leakAccum: 0, leakMs: 800,
      reqs: [], time: 0, genTimer: 0, genInterval: 1200
    },
    slidingWindowLog: {
      marks: [], windowMs: 5000, maxCount: 10, time: 0, genTimer: 0, genInterval: 600
    },
    slidingWindowCounter: {
      prevCount: 4, currCount: 2, windowMs: 5000, time: 0, genTimer: 0, genInterval: 800
    }
  };

  function setupViz() {
    ids.forEach(id => {
      const canvas = document.getElementById('viz-' + id);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        canvas.width = rect.width * devicePixelRatio;
        canvas.height = rect.height * devicePixelRatio;
      };
      resize();
      window.addEventListener('resize', resize);
      vizCanvases[id] = { canvas, ctx, w: () => canvas.getBoundingClientRect().width, h: () => canvas.getBoundingClientRect().height };

      canvas.addEventListener('click', () => {
        const allowed = Math.random() > 0.3;
        vizNotifyRequest(id, allowed);
        if (allowed) showToast('Viz: request allowed', 'success');
        else showToast('Viz: request blocked', 'error');
      });
    });
  }

  function drawBg(ctx, w, h) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
  }

  // ---- Token Bucket ----
  function drawTokenBucket(ctx, w, h, s, dt) {
    drawBg(ctx, w, h);
    const pad = 10;

    const bw = w * 0.55, bh = h * 0.42;
    const bx = (w - bw) / 2, by = h - pad;

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by - bh);
    ctx.lineTo(bx + bw, by - bh);
    ctx.lineTo(bx + bw + 8, by);
    ctx.lineTo(bx - 8, by);
    ctx.closePath();
    ctx.stroke();

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(bx - 10, by - bh);
    ctx.lineTo(bx + bw + 10, by - bh);
    ctx.stroke();
    ctx.setLineDash([]);

    const cols = 4, spacing = 16, tokenR = 5;
    const stX = bx + (bw - (cols - 1) * spacing) / 2;
    const stY = by - bh + 10;

    for (let i = 0; i < s.maxTokens; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const cx = stX + col * spacing, cy = stY + row * spacing;
      ctx.beginPath();
      ctx.arc(cx, cy, tokenR, 0, Math.PI * 2);
      if (i < s.tokens) {
        const pct = i / s.maxTokens;
        ctx.fillStyle = pct < 0.3 ? '#ef4444' : pct < 0.6 ? '#eab308' : '#22c55e';
        ctx.fill();
      } else {
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    if (s.refilling) {
      s.refillProg += dt / 400;
      const rY = by - bh - 20 - (1 - s.refillProg) * 40;
      ctx.beginPath();
      ctx.arc(w / 2, rY, tokenR, 0, Math.PI * 2);
      ctx.fillStyle = '#60a5fa';
      ctx.fill();
      ctx.shadowColor = '#60a5fa40';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (s.refillProg >= 1) {
        s.refilling = false;
        s.tokens = Math.min(s.maxTokens, s.tokens + 1);
      }
    }
    if (!s.refilling && s.tokens < s.maxTokens) {
      s.refillAccum += dt;
      if (s.refillAccum >= s.refillMs) {
        s.refillAccum = 0;
        s.refilling = true;
        s.refillProg = 0;
      }
    }

    s.reqs = s.reqs.filter(r => r.prog < 1);
    s.reqs.forEach(r => {
      r.prog += dt / 350;
      const ay = pad + 10 + (1 - r.prog) * (by - bh - pad - 20);
      ctx.beginPath();
      ctx.moveTo(w / 2 - 5, ay + 5);
      ctx.lineTo(w / 2, ay);
      ctx.lineTo(w / 2 + 5, ay + 5);
      ctx.strokeStyle = r.allowed ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2, ay - 2, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = r.allowed ? '#22c55e' : '#ef4444';
      ctx.fill();
    });

    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('' + s.tokens + '/' + s.maxTokens, 6, 12);

    s.genTimer += dt;
    if (s.genTimer >= s.genInterval) {
      s.genTimer = 0;
      const allowed = s.tokens > 0;
      s.reqs.push({ prog: 0, allowed });
      if (allowed) s.tokens--;
      document.getElementById('badge-token-bucket').textContent = allowed ? 'allowed' : 'blocked';
      document.getElementById('badge-token-bucket').className = 'viz-badge ' + (allowed ? 'ok' : 'err');
    }
  }

  // ---- Leaky Bucket ----
  function drawLeakyBucket(ctx, w, h, s, dt) {
    drawBg(ctx, w, h);
    const pad = 10;
    s.time += dt;

    const bw = w * 0.5, bh = h * 0.45;
    const bx = (w - bw) / 2, by = h - 10;

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    const topIn = 6;
    ctx.beginPath();
    ctx.moveTo(bx - topIn, by - bh);
    ctx.lineTo(bx + bw + topIn, by - bh);
    ctx.lineTo(bx + bw + 4, by);
    ctx.lineTo(bx - 4, by);
    ctx.closePath();
    ctx.stroke();

    const fillH = (s.level / s.capacity) * bh;
    if (fillH > 0) {
      const grd = ctx.createLinearGradient(0, by - fillH, 0, by);
      grd.addColorStop(0, '#3b82f6');
      grd.addColorStop(1, '#1d4ed8');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(bx - topIn + 2, by - fillH);
      ctx.lineTo(bx + bw + topIn - 2, by - fillH);
      ctx.lineTo(bx + bw + 2, by - 2);
      ctx.lineTo(bx - 2, by - 2);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#60a5fa40';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const waveY = by - fillH;
      for (let x = bx - topIn; x <= bx + bw + topIn; x++) {
        const wy = waveY + Math.sin((x + s.time * 0.003) * 0.15) * 2;
        if (x === bx - topIn) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }

    if (s.level >= s.capacity) {
      ctx.fillStyle = '#ef444440';
      ctx.fillRect(bx - topIn + 2, by - bh, bw + topIn * 2 - 4, 8);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('X', w / 2, by - bh + 7);
    }

    s.leakAccum += dt;
    if (s.leakAccum >= s.leakMs && s.level > 0) {
      s.leakAccum = 0;
      s.level = Math.max(0, s.level - 0.5);
      s.drops = s.drops || [];
      s.drops.push({ x: w / 2 + (Math.random() - 0.5) * 20, y: by + 4, prog: 0 });
    }
    s.drops = (s.drops || []).filter(d => d.prog < 1);
    s.drops.forEach(d => {
      d.prog += dt / 600;
      d.y += dt * 0.08;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f680';
      ctx.fill();
    });

    s.reqs = s.reqs.filter(r => r.prog < 1);
    s.reqs.forEach(r => {
      r.prog += dt / 300;
      const ry = pad + 5 + (1 - r.prog) * (by - bh - pad - 10);
      ctx.beginPath();
      ctx.arc(w / 2, ry, 4, 0, Math.PI * 2);
      ctx.fillStyle = r.allowed ? '#22c55e' : '#ef4444';
      ctx.fill();
      if (r.prog > 0.8) {
        ctx.strokeStyle = (r.allowed ? '#22c55e' : '#ef4444') + '40';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const angle = (i / 3) * Math.PI + (1 - r.prog) * Math.PI;
          const dist = (1 - r.prog) * 20;
          ctx.beginPath();
          ctx.arc(w / 2 + Math.cos(angle) * dist, by - bh, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('' + Math.round(s.level * 10) / 10 + '/' + s.capacity, 6, 12);

    s.genTimer += dt;
    if (s.genTimer >= s.genInterval) {
      s.genTimer = 0;
      const allowed = s.level < s.capacity;
      s.reqs.push({ prog: 0, allowed });
      if (allowed) s.level = Math.min(s.capacity, s.level + 1);
      document.getElementById('badge-leaky-bucket').textContent = allowed ? 'allowed' : 'blocked';
      document.getElementById('badge-leaky-bucket').className = 'viz-badge ' + (allowed ? 'ok' : 'err');
    }
  }

  // ---- Sliding Window Log ----
  function drawSlidingWindowLog(ctx, w, h, s, dt) {
    drawBg(ctx, w, h);
    const pad = 10;
    s.time += dt;

    const ly = h * 0.6;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, ly);
    ctx.lineTo(w - pad, ly);
    ctx.stroke();

    const windowPx = (s.windowMs / 6000) * (w - pad * 2);
    const nowOffset = (s.time % 6000) / 6000 * (w - pad * 2);
    const winStart = nowOffset - windowPx;

    ctx.fillStyle = '#1e3a5f40';
    ctx.fillRect(pad + Math.max(0, winStart), ly - 15, Math.min(windowPx, w - pad - Math.max(pad, pad + winStart)), 30);

    ctx.strokeStyle = '#60a5fa60';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pad + Math.max(pad, pad + winStart), ly - 18);
    ctx.lineTo(pad + Math.max(pad, pad + winStart), ly + 18);
    ctx.moveTo(pad + Math.min(w - pad, pad + winStart + windowPx), ly - 18);
    ctx.lineTo(pad + Math.min(w - pad, pad + winStart + windowPx), ly + 18);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.moveTo(pad + nowOffset, ly - 10);
    ctx.lineTo(pad + nowOffset + 5, ly);
    ctx.lineTo(pad + nowOffset, ly + 10);
    ctx.lineTo(pad + nowOffset - 5, ly);
    ctx.closePath();
    ctx.fill();

    const cutoff = s.time - s.windowMs;
    s.marks = s.marks.filter(m => m.time > cutoff);

    s.marks.forEach(m => {
      const age = s.time - m.time;
      const alpha = Math.max(0.2, 1 - age / s.windowMs);
      const mx = pad + (m.time % 6000) / 6000 * (w - pad * 2);

      ctx.beginPath();
      ctx.arc(mx, ly - 8 - Math.sin(age * 0.002) * 4, 4, 0, Math.PI * 2);
      ctx.fillStyle = m.allowed ? 'rgba(34,197,94,' + alpha + ')' : 'rgba(239,68,68,' + alpha + ')';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(mx, ly - 6);
      ctx.lineTo(mx, ly + 6);
      ctx.strokeStyle = 'rgba(148,163,184,' + (alpha * 0.3) + ')';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    const inWindow = s.marks.filter(m => m.time > cutoff).length;
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('' + inWindow + '/' + s.maxCount, 6, 12);
    ctx.textAlign = 'right';
    ctx.fillText((s.windowMs / 1000) + 's window', w - 6, 12);

    s.genTimer += dt;
    if (s.genTimer >= s.genInterval) {
      s.genTimer = 0;
      const inWindow = s.marks.filter(m => m.time > s.time - s.windowMs).length;
      const allowed = inWindow < s.maxCount;
      s.marks.push({ time: s.time, allowed });
      document.getElementById('badge-sliding-window-log').textContent = allowed ? 'allowed' : 'blocked';
      document.getElementById('badge-sliding-window-log').className = 'viz-badge ' + (allowed ? 'ok' : 'err');
    }
  }

  // ---- Sliding Window Counter ----
  function drawSlidingWindowCounter(ctx, w, h, s, dt) {
    drawBg(ctx, w, h);
    s.time += dt;

    const pad = 10;
    const barW = (w - pad * 3) / 2;
    const barH = h * 0.55;
    const barY = h - pad;

    const prevH = (s.prevCount / 15) * barH;
    ctx.fillStyle = '#475569';
    ctx.fillRect(pad, barY - barH, barW, barH);
    const grdP = ctx.createLinearGradient(0, barY - prevH, 0, barY);
    grdP.addColorStop(0, '#eab308');
    grdP.addColorStop(1, '#854d0e');
    ctx.fillStyle = grdP;
    ctx.fillRect(pad, barY - prevH, barW, prevH);

    const currH = (s.currCount / 15) * barH;
    ctx.fillStyle = '#475569';
    ctx.fillRect(pad * 2 + barW, barY - barH, barW, barH);
    const grdC = ctx.createLinearGradient(0, barY - currH, 0, barY);
    grdC.addColorStop(0, '#22c55e');
    grdC.addColorStop(1, '#166534');
    ctx.fillStyle = grdC;
    ctx.fillRect(pad * 2 + barW, barY - currH, barW, currH);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('' + s.prevCount, pad + barW / 2, barY - prevH - 6);
    ctx.fillText('' + s.currCount, pad * 2 + barW + barW / 2, barY - currH - 6);

    ctx.fillStyle = '#64748b';
    ctx.font = '9px sans-serif';
    ctx.fillText('prev window', pad + barW / 2, barY - barH - 16);
    ctx.fillText('curr window', pad * 2 + barW + barW / 2, barY - barH - 16);

    const weight = (s.windowMs - (s.time % s.windowMs)) / s.windowMs;
    const approx = Math.round(s.prevCount * weight + s.currCount);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('approx: ' + approx, 6, 12);
    ctx.textAlign = 'right';
    ctx.fillText('' + s.prevCount + 'x' + weight.toFixed(2) + ' + ' + s.currCount, w - 6, 12);

    const nowX = pad * 2 + barW + (s.time % s.windowMs) / s.windowMs * barW;
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.moveTo(nowX, barY + 4);
    ctx.lineTo(nowX - 4, barY + 12);
    ctx.lineTo(nowX + 4, barY + 12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#64748b';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('now', nowX, barY + 22);

    s.genTimer += dt;
    if (s.genTimer >= s.genInterval) {
      s.genTimer = 0;
      const allowed = s.currCount < 15;
      if (allowed) s.currCount++;
      s.currCount = Math.min(15, s.currCount);
      document.getElementById('badge-sliding-window-counter').textContent = allowed ? 'allowed' : 'blocked';
      document.getElementById('badge-sliding-window-counter').className = 'viz-badge ' + (allowed ? 'ok' : 'err');
    }

    if (s.time % s.windowMs < dt) {
      s.prevCount = s.currCount;
      s.currCount = 0;
    }
  }

  function animate(time) {
    const dt = Math.min(time - lastTime, 50);
    lastTime = time;

    ids.forEach(id => {
      const vc = vizCanvases[id];
      if (!vc) return;
      const w = vc.w(), h = vc.h();
      if (w === 0 || h === 0) return;
      const ctx = vc.ctx;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

      switch (id) {
        case 'token-bucket': drawTokenBucket(ctx, w, h, S.tokenBucket, dt); break;
        case 'leaky-bucket': drawLeakyBucket(ctx, w, h, S.leakyBucket, dt); break;
        case 'sliding-window-log': drawSlidingWindowLog(ctx, w, h, S.slidingWindowLog, dt); break;
        case 'sliding-window-counter': drawSlidingWindowCounter(ctx, w, h, S.slidingWindowCounter, dt); break;
      }
    });

    vizAnimId = requestAnimationFrame(animate);
  }

  window.vizNotifyRequest = function(strategy, allowed) {
    switch (strategy) {
      case 'token-bucket':
        S.tokenBucket.reqs.push({ prog: 0, allowed });
        if (allowed) S.tokenBucket.tokens = Math.max(0, S.tokenBucket.tokens - 1);
        document.getElementById('badge-token-bucket').textContent = allowed ? 'allowed' : 'blocked';
        document.getElementById('badge-token-bucket').className = 'viz-badge ' + (allowed ? 'ok' : 'err');
        break;
      case 'leaky-bucket':
        S.leakyBucket.reqs.push({ prog: 0, allowed });
        if (allowed) S.leakyBucket.level = Math.min(S.leakyBucket.capacity, S.leakyBucket.level + 1);
        document.getElementById('badge-leaky-bucket').textContent = allowed ? 'allowed' : 'blocked';
        document.getElementById('badge-leaky-bucket').className = 'viz-badge ' + (allowed ? 'ok' : 'err');
        break;
      case 'sliding-window-log':
        S.slidingWindowLog.marks.push({ time: S.slidingWindowLog.time, allowed });
        document.getElementById('badge-sliding-window-log').textContent = allowed ? 'allowed' : 'blocked';
        document.getElementById('badge-sliding-window-log').className = 'viz-badge ' + (allowed ? 'ok' : 'err');
        break;
      case 'sliding-window-counter':
        if (allowed) S.slidingWindowCounter.currCount++;
        document.getElementById('badge-sliding-window-counter').textContent = allowed ? 'allowed' : 'blocked';
        document.getElementById('badge-sliding-window-counter').className = 'viz-badge ' + (allowed ? 'ok' : 'err');
        break;
    }
  };

  setupViz();
  animate(performance.now());
})();
