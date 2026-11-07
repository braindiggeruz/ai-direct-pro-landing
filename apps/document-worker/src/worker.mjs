import { fork } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { ApiError } from './client.mjs';
import { DocumentError, validateJob, MAX_PDF_BYTES } from './schema.mjs';

export function backoffMs(failures, baseMs = 20000, random = Math.random) {
  const capped = Math.min(300000, baseMs * 2 ** Math.min(Math.max(failures - 1, 0), 5));
  return Math.min(300000, Math.round(capped * (1 + random() * 0.1)));
}

// Chromium and its Playwright controller exist only inside this short-lived child.
export function renderIsolated(job, options, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DocumentError('timeout'));
    const childEnv = {};
    for (const key of ['PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'LANG', 'PLAYWRIGHT_BROWSERS_PATH']) {
      if (process.env[key]) childEnv[key] = process.env[key];
    }
    const child = fork(new URL('./render-child.mjs', import.meta.url), [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'advanced',
      execArgv: ['--max-old-space-size=192'], env: childEnv,
      detached: process.platform !== 'win32', windowsHide: true,
    });
    let settled = false;
    const kill = () => {
      if (process.platform !== 'win32') {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      } else child.kill('SIGKILL');
    };
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      kill();
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(new DocumentError('timeout'));
    const timer = setTimeout(abort, options.timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', () => finish(new DocumentError('render_failed')));
    child.once('exit', () => finish(new DocumentError('render_failed')));
    child.once('message', message => {
      if (!message?.ok) return finish(new DocumentError(message?.code === 'invalid_payload' ? 'invalid_payload' : 'render_failed'));
      if (!Buffer.isBuffer(message.pdf) || message.pdf.length > MAX_PDF_BYTES || message.pdf.subarray(0, 5).toString() !== '%PDF-') return finish(new DocumentError('render_failed'));
      finish(null, { pdf: message.pdf, pages: message.pages, renderRssBytes: message.rssBytes });
    });
    child.send({ type: job.type, payload: job.payload, options }, error => { if (error) finish(new DocumentError('render_failed')); });
  });
}

export function createWorker({ config, api, render = renderIsolated, log = () => {}, now = Date.now, random = Math.random }) {
  const idleAbort = new AbortController();
  let activeAbort;
  const state = { stopping: false, busy: false, lastPollAt: 0, completed: 0, failed: 0, apiFailures: 0 };
  let loopPromise;
  let maintenancePromise;
  async function maintenanceLoop() {
    let cursor = null; let failures = 0;
    const interval = config.maintenanceMs ?? 60000;
    while (!state.stopping) {
      let waitMs = interval;
      try {
        const result = await api.maintenance(cursor, idleAbort.signal);
        cursor = result.cursor; failures = 0;
        if (result.expired || result.orphanObjectsDeleted) log({ event: 'document_maintenance_completed', expired: result.expired, orphanObjectsDeleted: result.orphanObjectsDeleted });
      } catch {
        if (state.stopping) break;
        failures++; waitMs = backoffMs(failures, interval, random);
        log({ event: 'document_maintenance_unavailable', retryAfterMs: waitMs });
      }
      try { await delay(waitMs, undefined, { signal: idleAbort.signal }); } catch { break; }
    }
  }
  async function processJob(job) {
    const started = now();
    state.busy = true; activeAbort = new AbortController();
    let timer;
    try {
      validateJob(job);
      const budget = Math.min(config.jobTimeoutMs, job.leaseExpiresAt - now() - 5000);
      // Reserve 15s for the upload; never render beyond the ledger lease.
      if (budget <= 15000) throw new DocumentError('timeout');
      timer = setTimeout(() => activeAbort?.abort(), budget);
      const result = await render(job, { timeoutMs: budget - 15000, executablePath: config.executablePath }, activeAbort.signal);
      await api.complete(job, result.pdf, activeAbort.signal);
      state.completed++;
      log({ event: 'document_completed', type: job.type, attempt: job.attempt, durationMs: Math.max(0, now() - started), pdfBytes: result.pdf.length, pages: result.pages, nodeRssBytes: process.memoryUsage().rss, renderNodeRssBytes: result.renderRssBytes });
    } catch (error) {
      state.failed++;
      const reason = error?.code === 'invalid_payload' ? 'invalid_payload' : error?.code === 'timeout' || activeAbort.signal.aborted ? 'timeout' : 'render_failed';
      // A stale lease is already authoritative. Complete may have committed even if its response was lost.
      // The server fail endpoint is conditional on the same live lease and cannot overwrite ready.
      if (!(error instanceof ApiError && error.status === 409) && typeof job?.id === 'string' && typeof job?.leaseToken === 'string') {
        try { await api.fail(job, reason); } catch { log({ event: 'document_fail_report_unavailable' }); }
      }
      log({ event: 'document_failed', reason, durationMs: Math.max(0, now() - started), nodeRssBytes: process.memoryUsage().rss });
    } finally { clearTimeout(timer); state.busy = false; activeAbort = undefined; }
  }
  async function loop() {
    let failures = 0;
    while (!state.stopping) {
      let waitMs = config.pollMs;
      try {
        const job = await api.claim(idleAbort.signal); state.lastPollAt = now(); failures = 0;
        if (job) { await processJob(job); waitMs = 0; }
      } catch {
        if (state.stopping) break;
        failures++; state.apiFailures++;
        waitMs = backoffMs(failures, config.pollMs, random);
        log({ event: 'document_api_unavailable', retryAfterMs: waitMs });
      }
      if (state.stopping) break;
      try { await delay(waitMs, undefined, { signal: idleAbort.signal }); } catch { break; }
    }
  }
  return {
    state,
    start() {
      if (typeof api.maintenance === 'function') maintenancePromise ??= maintenanceLoop();
      loopPromise ??= loop(); return loopPromise;
    },
    async stop() {
      state.stopping = true; idleAbort.abort();
      const timer = setTimeout(() => activeAbort?.abort(), config.shutdownMs);
      try { await Promise.allSettled([loopPromise, maintenancePromise]); } finally { clearTimeout(timer); }
    },
    processJob,
  };
}
