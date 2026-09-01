const ADMIN_ASSET = /^assets\/AdminRoot-[A-Za-z0-9_-]+\.js$/;

/** Compare the executing admin chunk, not a manifest fetched after the tab
 * opened: that manifest may already describe a newer release. */
export function hasNewAdminRelease(moduleUrl: string, value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const manifest = value as { schema?: unknown; commit?: unknown; probes?: unknown };
  if (manifest.schema !== 1 || typeof manifest.commit !== 'string' || !/^[a-f0-9]{40}$/.test(manifest.commit)
    || !Array.isArray(manifest.probes) || manifest.probes.length > 20) return false;
  let loaded: string;
  try { loaded = new URL(moduleUrl).pathname.replace(/^\//, ''); } catch { return false; }
  if (!ADMIN_ASSET.test(loaded)) return false;
  const probes = manifest.probes.filter((probe): probe is { path: string; sha256: string } => Boolean(probe)
    && typeof probe === 'object' && typeof probe.path === 'string' && ADMIN_ASSET.test(probe.path)
    && typeof probe.sha256 === 'string' && /^[a-f0-9]{64}$/.test(probe.sha256));
  return probes.length === 1 && probes[0].path !== loaded;
}
