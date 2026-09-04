// Shared observability helpers for Pages Functions.
//
// Why this exists:
//   A large part of this codebase writes *secondary* data — analytics events,
//   DDL probes, metrics counters, queue flushes. None of that may fail the
//   user-facing request, so it is all fire-and-forget. The historic way to
//   express that was `.catch(() => undefined)`, which also threw away the
//   only evidence that the write failed: a broken D1 binding, a missing
//   table or a saturated queue then looked identical to a healthy no-op.
//
//   These helpers keep the fire-and-forget semantics and restore the log.
//
// Log shape follows lib/api-errors.ts: a bracketed scope, then the message.
// `wrangler pages deployment tail` greps on the scope.

export type ErrorScope = string;

/**
 * Log an error that happened on a non-critical path.
 *
 * Safe to call with anything: `unknown`, a rejected non-Error value, or a
 * string. Never throws, so it cannot itself turn into an unhandled rejection
 * inside a `.catch()`.
 */
export function reportError(scope: ErrorScope, error: unknown): void {
  try {
    const e = error as Error | undefined;
    const message = e?.message || String(error ?? '');
    console.error(`[${scope}] ${message}`);
    if (e?.stack) {
      // First frames only — Workers log volume is billable and a full D1
      // stack is 30 lines of noise for a 2-line helper.
      console.error(`[${scope}] stack: ${e.stack.split('\n').slice(0, 4).join(' | ')}`);
    }
  } catch {
    // Logging must never break the caller.
  }
}

/**
 * A `.catch()` handler for non-critical promises.
 *
 *   await writeMetric(row).catch(swallow('telegram-store'));
 *   const store = await getStore(id).catch(swallow('market-access', null));
 *
 * The overloads matter: with no fallback the handler resolves to `undefined`,
 * preserving the type of the old `.catch(() => undefined)` it replaced. With a
 * fallback it resolves to exactly the fallback's type, so `.catch(swallow(s,
 * false))` keeps a `Promise<boolean>` a `Promise<boolean>` instead of widening
 * it to `boolean | undefined` and forcing `!` at every call site.
 */
export function swallow(scope: ErrorScope): (error: unknown) => undefined;
export function swallow<T>(scope: ErrorScope, fallback: T): (error: unknown) => T;
export function swallow<T>(scope: ErrorScope, fallback?: T): (error: unknown) => T | undefined {
  return (error: unknown) => {
    reportError(scope, error);
    return fallback;
  };
}
