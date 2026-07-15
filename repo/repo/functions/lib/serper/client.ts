// Backend-only Serper API client.
//
// Why backend-only:
//   - SERPER_API_KEY must NEVER reach the browser. It is read from
//     env.SERPER_API_KEY (Cloudflare Pages env) and used only inside
//     Cloudflare Pages Functions.
//   - The SPA receives the compact SerpDigest, never the raw upstream JSON.
//
// Defensive parsing: Serper's response shape can vary across endpoints; we
// only read the fields we use (organic, relatedSearches, peopleAlsoAsk).
// Unknown fields are ignored.

import type { Env } from '../../_types';
import type { Locale } from '../../../src/shared/types';
import type {
  SerpOrganicResult,
  SerpQuestion,
  SerpRelatedSearch,
  SerpSnapshot,
} from '../../../src/shared/serp';

interface RawOrganicItem {
  position?: number;
  link?: string;
  title?: string;
  snippet?: string;
}
interface RawPaaItem { question?: string; snippet?: string }
interface RawRelatedItem { query?: string }

interface RawSerperResponse {
  organic?: RawOrganicItem[];
  relatedSearches?: RawRelatedItem[];
  peopleAlsoAsk?: RawPaaItem[];
}

export interface SerperCallParams {
  q: string;
  locale: Locale;
  gl: string;
  hl: string;
  num: number;
  location?: string;
}

export interface SerperCallResult {
  snapshot: SerpSnapshot;
  /** Always 1 credit when this function is called (cache layer handles 0). */
  credits: 1;
}

const SERPER_ENDPOINT = 'https://google.serper.dev/search';
/** Trim long strings before persisting to keep cache + digest tiny. */
const TITLE_MAX = 140;
const SNIPPET_MAX = 220;

function trimStr(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function safeDomain(link: unknown): { domain: string; url: string } {
  if (typeof link !== 'string' || !link) return { domain: '', url: '' };
  try {
    const u = new URL(link);
    return { domain: u.hostname.replace(/^www\./, ''), url: u.toString() };
  } catch {
    return { domain: '', url: link };
  }
}

/** Parse a raw Serper /search response into our compact SerpSnapshot. */
export function parseSerperResponse(
  raw: unknown,
  params: SerperCallParams,
): SerpSnapshot {
  const data = (raw && typeof raw === 'object' ? raw : {}) as RawSerperResponse;

  const organic: SerpOrganicResult[] = Array.isArray(data.organic)
    ? data.organic.slice(0, 10).map((it, i) => {
      const { domain, url } = safeDomain(it?.link);
      return {
        position: typeof it?.position === 'number' ? it.position : i + 1,
        domain,
        url,
        title: trimStr(it?.title, TITLE_MAX),
        snippet: trimStr(it?.snippet, SNIPPET_MAX),
      };
    })
    : [];

  const related: SerpRelatedSearch[] = Array.isArray(data.relatedSearches)
    ? data.relatedSearches
      .slice(0, 8)
      .map((r) => ({ query: trimStr(r?.query, 120) }))
      .filter((r) => r.query.length > 0)
    : [];

  const questions: SerpQuestion[] = Array.isArray(data.peopleAlsoAsk)
    ? data.peopleAlsoAsk
      .slice(0, 8)
      .map((q) => ({
        question: trimStr(q?.question, 200),
        snippet: q?.snippet ? trimStr(q.snippet, SNIPPET_MAX) : undefined,
      }))
      .filter((q) => q.question.length > 0)
    : [];

  return {
    query: params.q,
    locale: params.locale,
    gl: params.gl,
    hl: params.hl,
    location: params.location,
    checkedAt: new Date().toISOString(),
    organic,
    related,
    questions,
  };
}

/** Call Serper. Throws on missing key or network/HTTP error. Caller layers
 *  the cache + cooldown around this. */
export async function callSerper(env: Env, params: SerperCallParams): Promise<SerperCallResult> {
  const apiKey = env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error('SERPER_API_KEY not configured');
  }
  const body: Record<string, unknown> = {
    q: params.q,
    gl: params.gl,
    hl: params.hl,
    num: Math.min(params.num || 10, 10),
  };
  if (params.location) body.location = params.location;

  const res = await fetch(SERPER_ENDPOINT, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    // Never include the API key in the error. Keep upstream message short.
    throw new Error(`Serper HTTP ${res.status}${txt ? `: ${txt.slice(0, 200)}` : ''}`);
  }
  const raw = (await res.json()) as unknown;
  const snapshot = parseSerperResponse(raw, params);
  return { snapshot, credits: 1 };
}
