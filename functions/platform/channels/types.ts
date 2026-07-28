import type { Locale } from '../contracts';
import type { Outbound } from '../contracts';

export const CHANNEL_ADDRESS_STATUSES = ['active', 'revoked'] as const;

export type ChannelAddressStatus = (typeof CHANNEL_ADDRESS_STATUSES)[number];

/**
 * Durable delivery address for one platform identity inside one bot namespace.
 *
 * The address is a transport detail, never an authority: it answers "where can
 * this identity be reached" and nothing else. Tenant membership, store
 * ownership and conversation ownership are always re-derived from the domain
 * before anything is sent.
 *
 * `namespace` isolates bots that share a channel: an address bound through the
 * Agents bot can never be used to reach the same person through the Javob or
 * lead bot, because a lookup always carries both channel and namespace.
 */
export interface ChannelAddress {
  id: string;
  identityId: string;
  channel: string;
  namespace: string;
  threadRef: string;
  status: ChannelAddressStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelAddressKey {
  identityId: string;
  channel: string;
  namespace: string;
}

export interface BindChannelAddressInput extends ChannelAddressKey {
  threadRef: string;
}

/**
 * Channel-neutral outbound delivery. Agents receive this port and never import
 * a channel adapter; the concrete implementation lives in functions/channels.
 */
export interface ChannelDeliveryPort {
  /** Channel id this port can deliver to, e.g. 'telegram'. */
  readonly channel: string;
  /** Bot namespace this port is bound to. */
  readonly namespace: string;
  send(
    threadRef: string,
    messages: readonly Outbound[],
    locale: Locale,
  ): Promise<boolean>;
}

/** Narrow write port handed to a channel adapter for inbound binding. */
export interface ChannelAddressBindingPort {
  bind(input: BindChannelAddressInput): Promise<void>;
}
