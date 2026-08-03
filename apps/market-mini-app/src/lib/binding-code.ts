/**
 * The one-time binding code, as it travels from the owner's screen to the
 * server.
 *
 * It is 32 bytes of CSPRNG rendered as 64 hex characters. The owner may have
 * seen it grouped for readability and may paste it back in any case, so a
 * little forgiveness at the edges is warranted — but only at the edges. Nothing
 * here substitutes a character, completes a missing one or shortens the value:
 * a code that lost a character stays wrong, which is exactly what it should do.
 */
export const BINDING_CODE_LENGTH = 64;

const CODE_PATTERN = /^[0-9a-f]{64}$/;

/** Strips only separators a display could have introduced, and folds case. */
export function normalizeBindingCode(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toLowerCase();
}

export function isBindingCode(value: string): boolean {
  return CODE_PATTERN.test(value);
}
