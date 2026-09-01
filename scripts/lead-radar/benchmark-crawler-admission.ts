/** Offline v2 admission measurements. NOT a Cloudflare CPU certification.
 * No network, credentials, D1 or production access. Extraction is measured
 * separately and MUST run locally, not in the Pages admission request.
 */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCrawlerResult, crawlerDigest, crawlerEvidence } from '../../functions/platform/lead-radar/crawler';
import { extractCrawlerResult } from '../../tools/lead-radar-crawler/extractor';
import { CRAWLER_LIMITS, LEAD_RADAR_CRAWLER_SCHEMA, type LeadRadarCrawlerClaim } from '../../src/shared/lead-radar-crawler';

const NOW = '2026-08-31T12:00:00.000Z';
const identity = { name: 'Aksu Dental Clinic', phone: '+998901234567', address: null,
  city: 'Tashkent', website: 'https://crawler-fixture.uz/', canonical_key: 'fixture:aksu' };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const round = (n: number) => Math.round(n * 1000) / 1000;
function option(name: string, fallback: string): string {
  const at = process.argv.indexOf(name); return at < 0 ? fallback : process.argv[at + 1] ?? '';
}
async function fixture(kib: number) {
  const job: LeadRadarCrawlerClaim = { schema: LEAD_RADAR_CRAWLER_SCHEMA, id: 'lrcj_offline_fixture',
    orgId: 'org_fixture', companyId: 'company_fixture', identity, identityDigest: hash(JSON.stringify(identity)),
    url: identity.website, leaseGeneration: 1, leaseExpiresAt: '2026-08-31T12:03:00.000Z',
    deadlineAt: '2026-08-31T12:02:00.000Z', limits: CRAWLER_LIMITS, resumeUrls: [] };
  const pages = Array.from({ length: 5 }, (_, i) => {
    const head = `<html><h1>${identity.name}</h1><a href="tel:${identity.phone}">Clinic phone</a>`
      + Array.from({ length: 15 }, (_, n) => `<p>Напишите нам в Telegram: <a href="https://t.me/AksuClinic${i}_${n}">Запись в клинику</a></p>`).join('');
    const html = head + ' '.repeat(Math.max(0, Math.floor(kib * 1024 / 5) - Buffer.byteLength(head) - 7)) + '</html>';
    const url = i === 0 ? job.url : new URL(`contacts-${i}`, job.url).href;
    return { url, requestedUrl: url, html, status: 200 as const, fetchedAt: NOW, sha256: hash(html) };
  });
  const start = performance.now();
  const result = await extractCrawlerResult(job, { schema: job.schema, jobId: job.id, receiptId: 'receipt_offline_fixture',
    identityDigest: job.identityDigest, leaseGeneration: 1, status: 'completed', reason: 'ok', pages, retryAt: null, resumeUrls: [] });
  const extractionWallMs = round(performance.now() - start);
  return { raw: JSON.stringify(result), htmlBytes: pages.reduce((sum, p) => sum + Buffer.byteLength(p.html), 0), extractionWallMs };
}
async function admit(raw: string) {
  const result = parseCrawlerResult(JSON.parse(raw));
  await crawlerDigest(JSON.stringify(result));
  if (await crawlerDigest(JSON.stringify(identity)) !== result.identityDigest) throw new Error('fixture_identity');
  for (const page of result.pages) if (new URL(page.url).origin !== new URL(identity.website).origin
    || new URL(page.requestedUrl).origin !== new URL(identity.website).origin) throw new Error('fixture_origin');
  return (await crawlerEvidence(result, 'org_fixture', 'company_fixture')).length;
}
async function measure(raw: string, iterations: number) {
  const start = performance.now(); const cpu = process.cpuUsage();
  const thread = process.threadCpuUsage(); let evidence = 0;
  for (let i = 0; i < iterations; i++) evidence = await admit(raw);
  const used = process.cpuUsage(cpu); const threadUsed = process.threadCpuUsage(thread);
  return { evidence, iterations, meanCpuMs: round((used.user + used.system) / 1000 / iterations),
    meanThreadCpuMs: round((threadUsed.user + threadUsed.system) / 1000 / iterations),
    meanWallMs: round((performance.now() - start) / iterations) };
}
async function main() {
  const iterations = Number(option('--warm-runs', '100'));
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 500) throw new Error('invalid_iterations');
  if (process.argv.includes('--child')) {
    const kib = Number(option('--kib', '128'));
    if (!Number.isSafeInteger(kib) || kib < 16 || kib > 512) throw new Error('invalid_size');
    const input = await fixture(kib);
    const cold = await measure(input.raw, 1); const warm = await measure(input.raw, iterations);
    process.stdout.write(JSON.stringify({ kib, htmlBytes: input.htmlBytes, wireBytes: Buffer.byteLength(input.raw),
      extractionWallMs: input.extractionWallMs, cold, warm })); return;
  }
  const results = [16, 128, 512].map(kib => {
    const child = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--child', '--kib', String(kib),
      '--warm-runs', String(iterations)], { cwd: fileURLToPath(new URL('../../', import.meta.url)),
      encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 512 * 1024 });
    if (child.status !== 0 || child.error) throw new Error(`benchmark_child_failed: ${child.stderr}`);
    return JSON.parse(child.stdout);
  });
  process.stdout.write(JSON.stringify({ schema: 'crawler-admission-offline-benchmark.v2', node: process.version,
    measuredAt: new Date().toISOString(), notes: [
      'Full HTML parsing is local, measured separately; Pages receives metadata and at most 55 contact observations.',
      'Admission includes compact JSON validation, receipt/identity/evidence hashes and evidence construction.',
      'D1, auth, schema, body streaming, bundle startup and production runtime overhead excluded.',
      'Cold admission is first call in fresh process after local fixture extraction. Node timings are NOT Cloudflare CPU proof.',
    ], results }, null, 2) + '\n');
}
main().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1; });
