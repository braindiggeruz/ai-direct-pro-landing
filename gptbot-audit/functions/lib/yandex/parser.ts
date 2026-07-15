// Base64 + XML parser for Yandex Cloud Search API responses.
//
// The /v2/web/search endpoint returns the SERP as a Base64-encoded XML
// document (yandexsearch.dtd). We do not need a full XML library — a
// targeted regex pass is enough to extract the fields we use (group →
// doc → url/title/passages). The parser is defensive: any structural
// mismatch falls back to an empty list rather than throwing.
//
// We never inject the resulting strings into the page as raw HTML — the
// caller serialises them as text inside an admin React component. The
// parser still strips most HTML/script tags as a defence-in-depth
// measure.

import type { YandexSerpResult } from './types';

/** Decode standard Base64 (no URL-safe variants needed here). */
export function decodeBase64(b64: string): string {
  if (typeof b64 !== 'string' || !b64) return '';
  // Cloudflare Workers expose `atob` natively. The result is a binary
  // string that we then re-decode as UTF-8.
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

const TAG_STRIP = /<[^>]+>/g;

function stripTags(s: string): string {
  return s.replace(TAG_STRIP, ' ').replace(/\s+/g, ' ').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function clean(s: string, max = 240): string {
  const out = decodeEntities(stripTags(s)).trim();
  return out.length > max ? out.slice(0, max - 1) + '…' : out;
}

function safeDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const DOC_RE = /<doc[^>]*>([\s\S]*?)<\/doc>/gi;
const URL_RE = /<url[^>]*>([\s\S]*?)<\/url>/i;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const PASSAGE_RE = /<passage[^>]*>([\s\S]*?)<\/passage>/i;
const FOUND_RE = /<found priority="all">(\d+)<\/found>/i;

/**
 * Parse Yandex Cloud Search API XML response (after Base64 decode).
 * Returns up to 10 organic results + total found.
 */
export function parseYandexXml(xml: string): { organic: YandexSerpResult[]; foundTotal: number } {
  if (!xml) return { organic: [], foundTotal: 0 };

  let foundTotal = 0;
  const m = xml.match(FOUND_RE);
  if (m) foundTotal = Number(m[1]) || 0;

  const organic: YandexSerpResult[] = [];
  let idx = 0;
  for (const match of xml.matchAll(DOC_RE)) {
    if (idx >= 10) break;
    const block = match[1] || '';
    const urlM = block.match(URL_RE);
    const titleM = block.match(TITLE_RE);
    const passM = block.match(PASSAGE_RE);
    const url = urlM ? clean(urlM[1] || '', 800) : '';
    if (!url) continue;
    const domain = safeDomain(url);
    if (!domain) continue;
    organic.push({
      position: ++idx,
      title: titleM ? clean(titleM[1] || '', 240) : domain,
      url,
      domain,
      snippet: passM ? clean(passM[1] || '', 320) : undefined,
    });
  }
  return { organic, foundTotal };
}
