// Channel-space types: the platform contract surface channel adapters
// implement. Channels may import platform/contracts only — never agents/*.
// Telegram-specific code arrives in functions/channels/telegram/ at P0.2+.
export type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelIdentityRef,
  Inbound,
  InboundMessage,
  Locale,
  Outbound,
  OutboundChoice,
} from '../platform/contracts';
