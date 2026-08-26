import { AUTH_ID_PATTERN, isRecord, OPERATION_ID_PATTERN } from './protocol';

export interface DurableAuthMetadata {
  version: 1;
  authId: string;
  operationId: string;
  mode: 'qr' | 'phone';
  expiresAt: string;
}

export type DurableAuthMode = DurableAuthMetadata['mode'];
export type SecretAuthAction = 'phone' | 'code' | 'resend' | 'password';

export function authActionAllowed(input: {
  mode: DurableAuthMode;
  state: string;
  action: SecretAuthAction;
}): boolean {
  if (input.action === 'password') return input.state === 'awaiting_password';
  if (input.mode !== 'phone') return false;
  if (input.action === 'phone') return input.state === 'awaiting_phone';
  return input.state === 'awaiting_code';
}

export function authChallengeMayBeCancelled(input: {
  authId: string;
  adoptedAuthId: string | undefined;
  state: string;
}): boolean {
  return input.state !== 'connected' && input.adoptedAuthId !== input.authId;
}

export function parseDurableAuthMetadata(
  value: unknown,
  nowMs: number,
): DurableAuthMetadata | null {
  if (!isRecord(value)
    || Object.keys(value).length !== 5
    || value.version !== 1
    || typeof value.authId !== 'string'
    || !AUTH_ID_PATTERN.test(value.authId)
    || typeof value.operationId !== 'string'
    || !OPERATION_ID_PATTERN.test(value.operationId)
    || (value.mode !== 'qr' && value.mode !== 'phone')
    || typeof value.expiresAt !== 'string') return null;
  const expiry = Date.parse(value.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= nowMs || expiry > nowMs + 15 * 60_000) return null;
  return value as unknown as DurableAuthMetadata;
}

export function authMetadataFrom(input: {
  authId: string;
  operationId: string;
  mode: 'qr' | 'phone';
  expiresAt: string;
}): DurableAuthMetadata {
  return {
    version: 1,
    authId: input.authId,
    operationId: input.operationId,
    mode: input.mode,
    expiresAt: input.expiresAt,
  };
}
