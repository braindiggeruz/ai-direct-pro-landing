import fs from 'node:fs';
import path from 'node:path';

// Vite's build manifest (build.manifest in vite.config.ts) is the authority on
// which file is an entry. Picking "the first file with this prefix" from
// dist/assets stops being safe once the chat has lazy chunks: a chunk can share
// an entry's prefix, and directory order decides which one a page loads.

/** One chunk of dist/.vite/manifest.json, keyed by its source (entries) or by `_name-hash.js`. */
export interface ManifestChunk {
  file: string;
  name?: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  /** Chunks this one imports statically: loaded with it. */
  imports?: string[];
  /** Chunks this one may import() later: loaded only when asked for. */
  dynamicImports?: string[];
  css?: string[];
}
export type ViteManifest = Record<string, ManifestChunk>;

export const MANIFEST_FILE = '.vite/manifest.json';

/** The rollupOptions.input of vite.config.ts, as manifest keys. */
export const ENTRIES = {
  landing: 'index.html',
  chat: 'src/gpt-chat/main.tsx',
  calculator: 'src/calculator/main.tsx',
} as const;

export function readViteManifest(dist: string): ViteManifest {
  const file = path.join(dist, MANIFEST_FILE);
  if (!fs.existsSync(file)) throw new Error(`Missing ${MANIFEST_FILE} in the build; run vite build (build.manifest) first.`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ViteManifest;
}

/** The root-relative URL of an entry's script: the one file a page may load for it. */
export function entryScript(manifest: ViteManifest, src: string): string {
  const chunk = manifest[src];
  if (!chunk?.isEntry || !/^assets\/[\w.-]+\.js$/.test(chunk.file)) {
    throw new Error(`Vite entry ${src} is not in the manifest; refusing to render pages without their script.`);
  }
  return `/${chunk.file}`;
}

/**
 * What an entry imports statically, as root-relative URLs, in the order the
 * manifest lists them (depth first): the files a page can ask for with
 * <link rel="modulepreload"> before the entry itself has been parsed.
 */
export function entryImports(manifest: ViteManifest, src: string): string[] {
  const seen = new Set<string>();
  const visit = (key: string) => {
    for (const next of manifest[key]?.imports ?? []) {
      if (seen.has(next) || !manifest[next]) continue;
      seen.add(next);
      visit(next);
    }
  };
  visit(src);
  return [...seen].map((key) => `/${manifest[key].file}`).filter((file) => /^\/assets\/[\w.-]+\.js$/.test(file));
}
