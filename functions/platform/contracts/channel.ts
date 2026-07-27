// Platform contract: channel adapters. A channel normalizes raw transport
// input into an Inbound envelope and renders channel-neutral Outbound into
// its own wire format. Nothing here may reference Telegram/WhatsApp types —
// those live in functions/channels/<id>/ behind this interface.
import type { Locale } from './context';

export interface ChannelIdentityRef {
  /** Channel id, e.g. 'telegram' | 'webchat'. */
  channel: string;
  /** Stable external user id within that channel. */
  externalId: string;
}

export type InboundMessage =
  | { kind: 'text'; text: string }
  | { kind: 'command'; command: string; payload?: string }
  | { kind: 'action'; actionId: string }
  | { kind: 'media'; mediaKind: 'photo' | 'voice' | 'audio' | 'document'; ref: string; caption?: string };

export interface Inbound {
  identity: ChannelIdentityRef;
  /** Channel-scoped thread/chat reference (opaque to the platform). */
  threadRef: string;
  /** Dedup key derived from the transport (e.g. telegram update_id). */
  idempotencyKey: string;
  locale?: Locale;
  message: InboundMessage;
}

export interface OutboundChoice {
  id: string;
  label: string;
}

export interface OutboundCardField {
  label: string;
  value: string;
}

/** Channel-neutral structured content. Channel adapters own wire rendering. */
export interface OutboundCard {
  /** Opaque reference; never rendered as business text by the platform. */
  ref: string;
  title: string;
  description?: string;
  fields: readonly OutboundCardField[];
  actions?: readonly OutboundChoice[];
}

export interface Outbound {
  text: string;
  choices?: readonly OutboundChoice[];
  card?: OutboundCard;
  /** Channel-native media reference (e.g. telegram file_id) when reusable. */
  mediaRef?: string;
}

export interface ChannelCapabilities {
  buttons: boolean;
  media: boolean;
  streaming: boolean;
}

export interface ChannelAdapter {
  id: string;
  capabilities: ChannelCapabilities;
  /** Returns null for transport noise that is not a platform message. */
  ingest(raw: unknown): Inbound | null;
  /** Renders to the channel wire format; the adapter owns delivery specifics. */
  render(out: Outbound): unknown;
}
