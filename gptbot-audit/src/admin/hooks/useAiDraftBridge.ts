// React hook that wires up the AI SEO Editor Bridge inside PageEditor /
// BlogEditor. Reads `?aiPatch=<runId>` from the URL, hybrid-fetches the
// approved-field snapshot (backend ledger → sessionStorage fallback), and
// hands the safe field patch back to the editor so it can prefill its local
// state.
//
// The hook itself never mutates the live page — it only returns:
//   - status / error messages for the banner;
//   - the approved field patch (safe-mapped);
//   - the list of skipped fields;
//   - a `clearDraft` callback used by the editor's "Clear AI draft" button.
//
// IMPORTANT: this hook does NOT call setState on the editor's data. The
// editor itself decides when to apply the patch (so editor-local validators
// can still run if needed).

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import {
  parseEditorRoute,
  mapApprovedFieldsToEditorDraft,
  draftStorageKey,
  type EditorTarget,
  type DraftHandoff,
} from '../../shared/ai-seo-bridge';

export interface AiDraftState {
  /** runId from the ledger / query param. */
  runId: string | null;
  /** Loading status. */
  status: 'idle' | 'loading' | 'ready' | 'mismatch' | 'error';
  /** Approved field snapshot mapped through bridge safety filter. */
  applied: Record<string, unknown>;
  /** Field keys received from ledger but dropped (forbidden / unsupported). */
  skipped: string[];
  /** Error string when status === 'error'. */
  error?: string;
  /** Whether the patch URL matches the editor's current entity. */
  matched: boolean;
  /** Source: backend or session fallback. */
  source?: 'backend' | 'session';
  /** Clear banner + query param so the editor exits AI-draft mode. */
  clearDraft: () => void;
  /** Set by the editor after it has prefilled its local state — used so the
   *  banner doesn't keep re-applying on every re-render. */
  markApplied: () => void;
  /** True once `markApplied` has been called. */
  isApplied: boolean;
}

interface UseAiDraftBridgeOptions {
  /** Editor entity URL — '/<locale>/<slug>/' for pages, '/<locale>/blog/<slug>/' for blog. */
  currentUrl: string;
  target: EditorTarget;
  /** True until the editor has loaded its content payload — we delay matching
   *  until the editor knows its own URL. */
  ready: boolean;
}

function readSessionFallback(runId: string): DraftHandoff | null {
  try {
    const raw = sessionStorage.getItem(draftStorageKey(runId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftHandoff;
    if (!parsed || typeof parsed !== 'object' || parsed.runId !== runId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useAiDraftBridge(opts: UseAiDraftBridgeOptions): AiDraftState {
  const [params, setParams] = useSearchParams();
  const runId = params.get('aiPatch') || null;

  const [status, setStatus] = useState<AiDraftState['status']>('idle');
  const [applied, setApplied] = useState<Record<string, unknown>>({});
  const [skipped, setSkipped] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [matched, setMatched] = useState<boolean>(true);
  const [source, setSource] = useState<'backend' | 'session' | undefined>(undefined);
  const [isApplied, setIsApplied] = useState(false);
  // Re-run when runId or editor-ready changes.
  const lastRunId = useRef<string | null>(null);

  useEffect(() => {
    // Reset to idle when runId disappears (e.g. clearDraft cleared the query).
    if (!runId) {
      if (lastRunId.current !== null) {
        setStatus('idle');
        setApplied({}); setSkipped([]); setError(undefined); setSource(undefined);
        setMatched(true); setIsApplied(false);
        lastRunId.current = null;
      }
      return;
    }
    if (!opts.ready) return;
    if (lastRunId.current === runId) return;
    lastRunId.current = runId;
    setStatus('loading');
    setIsApplied(false);

    void (async () => {
      // 1. Try backend ledger first.
      try {
        const res = await api.aiGetPatch(runId);
        if (res.ok) {
          const route = parseEditorRoute(res.url);
          if (!route || route.target !== opts.target) {
            setStatus('mismatch');
            setError(`AI draft target mismatch (run is for ${res.target}, editor is ${opts.target}).`);
            setMatched(false);
            return;
          }
          const editorRoute = parseEditorRoute(opts.currentUrl);
          if (!editorRoute || editorRoute.target !== route.target ||
              editorRoute.locale !== route.locale || editorRoute.slug !== route.slug) {
            setStatus('mismatch');
            setError(`AI draft is for ${res.url} but this editor is ${opts.currentUrl}.`);
            setMatched(false);
            return;
          }
          // Defense in depth — re-apply bridge safety filter on the client.
          const safe = mapApprovedFieldsToEditorDraft(res.applied, opts.target);
          setApplied(safe.patch);
          setSkipped([...new Set([...res.skipped, ...safe.skipped])]);
          setMatched(true);
          setSource('backend');
          setStatus('ready');
          return;
        }
        // Backend says not found / not applied / forbidden URL → try session fallback.
        setError(res.error);
      } catch (e) {
        setError((e as Error).message);
      }

      // 2. Session fallback (private mode / lost auth / preview deploys).
      const local = readSessionFallback(runId);
      if (!local) {
        setStatus('error');
        return;
      }
      if (local.target !== opts.target) {
        setStatus('mismatch');
        setError(`AI draft target mismatch (local copy is for ${local.target}).`);
        setMatched(false);
        return;
      }
      const editorRoute = parseEditorRoute(opts.currentUrl);
      if (!editorRoute || editorRoute.locale !== local.locale || editorRoute.slug !== local.slug) {
        setStatus('mismatch');
        setError(`AI draft is for ${local.url} but this editor is ${opts.currentUrl}.`);
        setMatched(false);
        return;
      }
      const safe = mapApprovedFieldsToEditorDraft(local.applied, opts.target);
      setApplied(safe.patch);
      setSkipped(safe.skipped);
      setMatched(true);
      setSource('session');
      setError(undefined);
      setStatus('ready');
    })();
  }, [runId, opts.ready, opts.currentUrl, opts.target]);

  const clearDraft = () => {
    if (runId) {
      try { sessionStorage.removeItem(draftStorageKey(runId)); } catch { /* ignore */ }
    }
    const next = new URLSearchParams(params);
    next.delete('aiPatch');
    setParams(next, { replace: true });
    setStatus('idle');
    setApplied({}); setSkipped([]); setError(undefined); setSource(undefined);
    setMatched(true); setIsApplied(false);
    lastRunId.current = null;
  };

  return {
    runId,
    status,
    applied,
    skipped,
    error,
    matched,
    source,
    isApplied,
    clearDraft,
    markApplied: () => setIsApplied(true),
  };
}
