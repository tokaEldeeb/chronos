/*
  Simulation script:
  - Enqueue N jobs across M tenants (with duplicates)
  - Start K worker processes
  - Randomly crash workers
  - Print metrics at the end
*/
/* eslint-disable no-console */
const { spawn, execSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const NUM_TENANTS = Number(process.env.SIM_TENANTS || 3);
const NUM_JOBS = Number(process.env.SIM_JOBS || 50);
const NUM_WORKERS = Number(process.env.SIM_WORKERS || 2);
const DURATION_MS = Number(process.env.SIM_DURATION_MS || 20000);
const CRASH_PROB = Number(process.env.SIM_CRASH_PROB || 0.2); // per tick
const CRASH_TICK_MS = Number(process.env.SIM_CRASH_TICK_MS || 1000);
const DUP_RATE = Number(process.env.SIM_DUP_RATE || 0.1);

function randUuid() {
  // naive uuid4-ish
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function http(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${url} ${res.status}: ${text}`);
  }
  return res.json();
}

async function enqueueJobs() {
  const tenants = Array.from({ length: NUM_TENANTS }, () => randUuid());
  const idempPerTenant = new Map(tenants.map((t) => [t, new Set()]));
  let submitted = 0;
  for (let i = 0; i < NUM_JOBS; i++) {
    const tenantId = tenants[i % tenants.length];
    const useDup = Math.random() < DUP_RATE && idempPerTenant.get(tenantId).size > 0;
    const idempotencyKey = useDup
      ? Array.from(idempPerTenant.get(tenantId))[Math.floor(Math.random() * idempPerTenant.get(tenantId).size)]
      : `sim-${tenantId}-${i}`;
    if (!useDup) idempPerTenant.get(tenantId).add(idempotencyKey);

    const isCompute = Math.random() < 0.5;
    const payload = isCompute
      ? { numbers: Array.from({ length: 5 }, () => Math.floor(Math.random() * 10)) }
      : { url: 'https://httpbin.org/get', method: 'GET' };
    const body = {
      tenantId,
      type: isCompute ? 'compute' : 'http_call',
      payload,
      priority: Math.floor(Math.random() * 5),
      idempotencyKey,
    };
    try {
      await http('POST', `${API_URL}/v1/jobs`, body);
      submitted++;
    } catch (e) {
      console.warn('enqueue error', e.message);
    }
  }
  return { tenants, submitted, uniquePerTenant: idempPerTenant };
}

function ensureWorkerBuilt() {
  const workerDist = path.resolve(__dirname, '../services/worker/dist/main.js');
  if (!existsSync(workerDist)) {
    console.log('Building worker...');
    execSync('npm run -w @chronos/worker build', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
  }
}

function startWorkers(k) {
  ensureWorkerBuilt();
  const procs = [];
  for (let i = 0; i < k; i++) {
    const p = spawn('node', ['services/worker/dist/main.js'], {
      cwd: path.resolve(__dirname, '..'),
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env },
    });
    procs.push(p);
  }
  return procs;
}

function crashLoop(procs) {
  const timer = setInterval(() => {
    if (Math.random() < CRASH_PROB && procs.length > 0) {
      const idx = Math.floor(Math.random() * procs.length);
      const p = procs[idx];
      console.log('Crashing worker', idx, p.pid);
      try { p.kill('SIGTERM'); } catch {}
      // respawn
      const np = spawn('node', ['services/worker/dist/main.js'], {
        cwd: path.resolve(__dirname, '..'),
        stdio: ['ignore', 'inherit', 'inherit'],
        env: { ...process.env },
      });
      procs[idx] = np;
    }
  }, CRASH_TICK_MS);
  return timer;
}

async function main() {
  console.log('Starting simulation...');
  // quick API check
  try { await http('GET', `${API_URL}/v1/metrics`); } catch { console.warn('API not responding yet'); }

  const { tenants, submitted, uniquePerTenant } = await enqueueJobs();
  console.log(`Submitted ${submitted} job requests across ${tenants.length} tenants`);

  const workers = startWorkers(NUM_WORKERS);
  const timer = crashLoop(workers);

  await new Promise((r) => setTimeout(r, DURATION_MS));
  clearInterval(timer);
  workers.forEach((p) => { try { p.kill('SIGTERM'); } catch {} });

  // wait settle
  await new Promise((r) => setTimeout(r, 2000));
  const metrics = await http('GET', `${API_URL}/v1/metrics`);
  console.log('Final metrics:', JSON.stringify(metrics, null, 2));

  // Expected lower bound is number of unique idempotency keys across tenants
  let expectedMin = 0;
  for (const s of uniquePerTenant.values()) expectedMin += s.size;
  console.log('Expected (min) unique jobs:', expectedMin);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


