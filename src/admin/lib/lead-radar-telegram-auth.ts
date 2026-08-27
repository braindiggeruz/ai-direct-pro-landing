import type { LeadRadarTelegramAccountQr, LeadRadarTelegramAccountState } from './lead-radar-campaign';

// A fresh phone auth can follow local cleanup of the preceding provisional
// session. The Bridge may need one mailbox poll plus its bounded Telegram
// reconnect before it can publish the new one-use input channel.
export const TELEGRAM_PHONE_PREPARATION_TIMEOUT_MS = 45_000;

function preparationError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

/** Read-only readiness recovery for one explicit phone submission; never sends or retries a code. */
export async function awaitTelegramPhoneChallenge(
  initial: LeadRadarTelegramAccountQr,
  read: (authId: string, signal: AbortSignal) => Promise<LeadRadarTelegramAccountState>,
  options: { signal: AbortSignal; timeoutMs?: number; intervalMs?: number },
): Promise<LeadRadarTelegramAccountState & { qr: LeadRadarTelegramAccountQr }> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal.addEventListener('abort', cancel, { once: true });
  if (options.signal.aborted) cancel();
  const timer = setTimeout(cancel, options.timeoutMs ?? TELEGRAM_PHONE_PREPARATION_TIMEOUT_MS);
  const signal = controller.signal;
  const aborted = new Promise<never>((_resolve, reject) => {
    const fail = () => reject(preparationError(options.signal.aborted
      ? 'telegram_auth_cancelled' : 'telegram_bridge_preparation_timeout'));
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
  });
  // Handle cancellation even if a caller's read ignores its AbortSignal.
  void aborted.catch(() => {});
  try {
    for (;;) {
      if (signal.aborted) return await aborted;
      const state = await Promise.race([read(initial.authId, signal), aborted]);
      const next = state.qr;
      if (state.status !== 'pending' && state.status !== 'connecting') {
        throw preparationError('telegram_auth_state_changed');
      }
      if (!next || next.authId !== initial.authId || next.orgId !== initial.orgId
        || next.deviceId !== initial.deviceId) throw preparationError('telegram_auth_state_changed');
      if (!Number.isFinite(Date.parse(next.expiresAt)) || Date.parse(next.expiresAt) <= Date.now()) throw preparationError('telegram_auth_expired');
      if (state.pendingAction || (state.authState !== 'starting' && state.authState !== 'awaiting_phone')) {
        throw preparationError('telegram_auth_state_changed');
      }
      if (state.authState === 'awaiting_phone' && next.inputAction === 'phone'
        && next.inputCommandId && next.bridgeEncryptionKey) return { ...state, qr: next };
      let pause: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([new Promise<void>(resolve => { pause = setTimeout(resolve, options.intervalMs ?? 1_000); }), aborted]);
      } finally { if (pause !== undefined) clearTimeout(pause); }
    }
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener('abort', cancel);
  }
}
