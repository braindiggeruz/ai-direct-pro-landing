import { createServer } from 'node:http';
import { readConfig } from './config.mjs';
import { createApiClient } from './client.mjs';
import { createWorker } from './worker.mjs';

const log = value => process.stdout.write(`${JSON.stringify(value)}\n`);
let config;
try { config = readConfig(); } catch { log({ event: 'document_worker_config_invalid' }); process.exit(1); }
const worker = createWorker({ config, api: createApiClient(config), log });
const server = createServer((request, response) => {
  response.setHeader('cache-control', 'no-store');
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('x-content-type-options', 'nosniff');
  if ((request.method !== 'GET' && request.method !== 'HEAD') || request.url !== '/healthz') {
    response.writeHead(404); response.end('{"error":"not_found"}'); return;
  }
  response.writeHead(worker.state.stopping ? 503 : 200);
  response.end(JSON.stringify({ status: worker.state.stopping ? 'stopping' : 'ok', busy: worker.state.busy }));
});
server.requestTimeout = 5000; server.headersTimeout = 5000; server.keepAliveTimeout = 1000;
server.listen(config.port, '0.0.0.0', () => { log({ event: 'document_worker_started' }); void worker.start(); });
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  log({ event: 'document_worker_stopping' });
  const hardStop = setTimeout(() => process.exit(1), config.shutdownMs + 17000);
  await worker.stop();
  server.close(); server.closeAllConnections();
  clearTimeout(hardStop);
  log({ event: 'document_worker_stopped' });
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
server.on('error', () => { log({ event: 'document_worker_http_error' }); void shutdown(); });
