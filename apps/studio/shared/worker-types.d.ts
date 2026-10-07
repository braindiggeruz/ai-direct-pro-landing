// Node rehearsal scripts import real Worker handlers. Import only their
// binding types; Workers' global Element/Response must not shadow the DOM
// used by Playwright and the browser application.
import type * as Cloudflare from '@cloudflare/workers-types';
declare global {
  type D1Database = Cloudflare.D1Database;
  type D1PreparedStatement = Cloudflare.D1PreparedStatement;
  type D1Result<T = unknown> = Cloudflare.D1Result<T>;
  type KVNamespace = Cloudflare.KVNamespace;
  type Queue<T = unknown> = Cloudflare.Queue<T>;
  type R2Bucket = Cloudflare.R2Bucket;
  type Fetcher = Cloudflare.Fetcher;
  type Ai = Cloudflare.Ai;
}
export {};
