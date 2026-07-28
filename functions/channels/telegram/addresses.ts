import type { Outbound } from '../../platform/contracts';
import type {
  ChannelAddressBindingPort,
  ChannelDeliveryPort,
} from '../../platform/channels';
import {
  deliverTelegramMessages,
  renderTelegramOutbound,
  type TelegramDeliveryPort,
} from './render';

export const TELEGRAM_CHANNEL_ID = 'telegram';

export interface TelegramAddressBinder {
  bind(identityId: string, threadRef: string): Promise<void>;
}

/**
 * Inbound binding: every accepted update refreshes where this identity can be
 * reached. The namespace is the bot username, so an address bound through the
 * Agents bot can never be used to reach the same person through another bot.
 * The raw update, the Telegram profile and the language code are not stored.
 */
export function createTelegramAddressBinder(
  addresses: ChannelAddressBindingPort,
  botUsername: string,
): TelegramAddressBinder {
  return {
    async bind(identityId, threadRef) {
      await addresses.bind({
        identityId,
        channel: TELEGRAM_CHANNEL_ID,
        namespace: botUsername,
        threadRef,
      });
    },
  };
}

/**
 * Outbound delivery for messages that are not a reply to the current turn. It
 * reuses the same bounded renderer and client as the webhook, so a pushed
 * message can never carry markup the reply path would reject.
 */
export function createTelegramChannelDelivery(
  delivery: TelegramDeliveryPort,
  botUsername: string,
): ChannelDeliveryPort {
  return {
    channel: TELEGRAM_CHANNEL_ID,
    namespace: botUsername,
    async send(threadRef: string, messages: readonly Outbound[]) {
      if (messages.length === 0) return false;
      return deliverTelegramMessages(
        delivery,
        threadRef,
        renderTelegramOutbound(messages),
      );
    },
  };
}
