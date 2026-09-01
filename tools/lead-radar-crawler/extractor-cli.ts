/** Bounded stdin/stdout bridge; no credentials, files or network are inputs. */
import { CRAWLER_EXTRACTOR_MAX_INPUT, CrawlerExtractionError, extractCrawlerResult } from './extractor';

const timer = setTimeout(() => { process.stderr.write('extractor_timeout\n'); process.exit(2); }, 10_000);
try {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > CRAWLER_EXTRACTOR_MAX_INPUT) throw new CrawlerExtractionError('extractor_input_too_large');
    chunks.push(buffer);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const output = await extractCrawlerResult(input.job, input.result);
  process.stdout.write(JSON.stringify(output));
} catch (error) {
  process.stderr.write(`${error instanceof CrawlerExtractionError ? error.code : 'extractor_invalid_input'}\n`);
  process.exitCode = 2;
} finally {
  clearTimeout(timer);
}
