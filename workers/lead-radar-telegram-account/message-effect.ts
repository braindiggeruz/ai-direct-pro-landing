import { sha256Hex } from './crypto';
import type { TelegramTransportMedia } from './protocol';

export type TelegramEffectMediaIdentity = Pick<
  TelegramTransportMedia,
  'media_id' | 'media_digest' | 'mime_type' | 'size_bytes'
>;

/** One canonical digest frame shared by gateway, Durable Object and reconcile. */
export function telegramMessagePayloadDigest(input: {
  accountRef: string;
  username: string;
  text: string;
  randomId: string;
  media?: TelegramEffectMediaIdentity | null;
}): Promise<string> {
  return sha256Hex([
    input.accountRef,
    input.username,
    input.text,
    input.randomId,
    JSON.stringify(input.media
      ? [input.media.media_id, input.media.media_digest, input.media.mime_type, input.media.size_bytes]
      : null),
    'paid:reject',
  ]);
}
