import type {
  FactSheet,
  Locale,
  Outbound,
  RuntimeResponseDraft,
} from '../../../platform/contracts';
import type {
  ChannelAddressService,
  ChannelDeliveryPort,
} from '../../../platform/channels';
import { groundResponse } from '../../../platform/runtime';
import {
  composeHandoffResponse,
  projectHandoffReplyFacts,
  projectSellerNoticeFacts,
  type SotuvchiHandoffService,
} from '../handoff';
import {
  composeSellerOrdersResponse,
  projectNotificationFacts,
  type SotuvchiOrdersService,
} from '../orders';

export interface SotuvchiDispatchResult {
  delivered: number;
  skipped: number;
  failed: number;
}

export interface SotuvchiNotificationDispatcherDeps {
  handoff: SotuvchiHandoffService;
  orders: SotuvchiOrdersService;
  addresses: ChannelAddressService;
  delivery: ChannelDeliveryPort;
  /** Maximum intents delivered per opportunistic flush. */
  batchLimit?: number;
}

const DEFAULT_BATCH = 5;

/**
 * Opportunistic outbound dispatcher.
 *
 * There is no scheduler in this platform, so pending intents are flushed after
 * the turn that produced them and after any later turn in the same store. The
 * contract is therefore durable intent plus at-least-once attempt with
 * idempotent domain effects: a crash between "sent" and "settled" can repeat a
 * message, but never a domain change.
 */
export class SotuvchiNotificationDispatcher {
  private readonly batchLimit: number;

  constructor(private readonly deps: SotuvchiNotificationDispatcherDeps) {
    this.batchLimit = deps.batchLimit ?? DEFAULT_BATCH;
  }

  /** Grounded push: an unsupported number is never delivered. */
  private groundedMessages(
    draft: RuntimeResponseDraft,
    facts: FactSheet,
  ): readonly Outbound[] | null {
    const grounding = groundResponse(draft, [facts]);
    return grounding.status === 'failed' ? null : draft.messages;
  }

  private async sendTo(
    identityId: string,
    messages: readonly Outbound[],
    locale: Locale,
  ): Promise<boolean> {
    const address = await this.deps.addresses.find({
      identityId,
      channel: this.deps.delivery.channel,
      namespace: this.deps.delivery.namespace,
    });
    if (!address) return false;
    return this.deps.delivery.send(address.threadRef, messages, locale);
  }

  private async deliverSellerNotices(
    orgId: string,
    storeId: string,
    locale: Locale,
    result: SotuvchiDispatchResult,
  ): Promise<void> {
    const pending = await this.deps.handoff.listPendingSellerNotifications(
      orgId,
      storeId,
      this.batchLimit,
    );
    const owner = await this.deps.handoff.findStoreOwner(orgId, storeId);
    for (const handoff of pending) {
      if (!owner) {
        result.skipped += 1;
        continue;
      }
      const claimed = await this.deps.handoff.claimSellerNotification(
        orgId,
        handoff.id,
      );
      if (claimed !== 1) {
        result.skipped += 1;
        continue;
      }
      const values = projectSellerNoticeFacts(handoff, locale);
      const facts: FactSheet = { toolName: 'sotuvchi.handoff', values };
      const messages = this.groundedMessages(
        composeHandoffResponse(facts, locale),
        facts,
      );
      if (!messages || !await this.sendTo(owner, messages, locale)) {
        result.failed += 1;
        continue;
      }
      await this.deps.handoff.markSellerNotified(orgId, handoff.id);
      result.delivered += 1;
    }
  }

  private async deliverBuyerReplies(
    orgId: string,
    storeId: string,
    locale: Locale,
    result: SotuvchiDispatchResult,
  ): Promise<void> {
    const pending = await this.deps.handoff.listPendingBuyerDeliveries(
      orgId,
      storeId,
      this.batchLimit,
    );
    for (const handoff of pending) {
      const claimed = await this.deps.handoff.claimBuyerDelivery(
        orgId,
        handoff.id,
      );
      if (claimed !== 1) {
        result.skipped += 1;
        continue;
      }
      const values = projectHandoffReplyFacts(handoff, locale);
      const facts: FactSheet = { toolName: 'sotuvchi.handoff', values };
      const messages = this.groundedMessages(
        composeHandoffResponse(facts, locale),
        facts,
      );
      if (
        !messages
        || !await this.sendTo(handoff.buyerIdentityId, messages, locale)
      ) {
        // The answer stays stored and the handoff stays answered, so the next
        // flush retries without a second seller reply ever being possible.
        result.failed += 1;
        continue;
      }
      await this.deps.handoff.markBuyerDelivered(orgId, handoff.id);
      result.delivered += 1;
    }
  }

  /** P2.5 order intents, delivered through the same address and send path. */
  private async deliverOrderNotifications(
    orgId: string,
    storeId: string,
    locale: Locale,
    result: SotuvchiDispatchResult,
  ): Promise<void> {
    const pending = await this.deps.orders.listPendingNotifications(
      orgId,
      storeId,
      this.batchLimit,
    );
    const owner = await this.deps.handoff.findStoreOwner(orgId, storeId);
    for (const intent of pending) {
      const recipient = intent.audience === 'seller'
        ? owner
        : await this.deps.handoff.findOrderBuyerIdentity(orgId, intent.orderId);
      if (!recipient) {
        result.skipped += 1;
        continue;
      }
      if (!await this.deps.orders.claimNotification(orgId, storeId, intent.id)) {
        result.skipped += 1;
        continue;
      }
      const order = await this.deps.orders
        .readNotificationOrder(orgId, storeId, intent.orderId)
        .catch(() => null);
      if (!order) {
        await this.deps.orders.settleNotification(
          orgId,
          storeId,
          intent.id,
          'failed',
        );
        result.failed += 1;
        continue;
      }
      const values = projectNotificationFacts(intent.type, order, locale);
      const facts: FactSheet = { toolName: 'sotuvchi.notification', values };
      const messages = this.groundedMessages(
        composeSellerOrdersResponse(facts, locale),
        facts,
      );
      if (!messages || !await this.sendTo(recipient, messages, locale)) {
        await this.deps.orders.settleNotification(
          orgId,
          storeId,
          intent.id,
          'failed',
        );
        result.failed += 1;
        continue;
      }
      await this.deps.orders.settleNotification(
        orgId,
        storeId,
        intent.id,
        'sent',
      );
      result.delivered += 1;
    }
  }

  async flush(
    orgId: string,
    storeId: string,
    fallbackLocale: Locale = 'ru',
  ): Promise<SotuvchiDispatchResult> {
    const result: SotuvchiDispatchResult = {
      delivered: 0,
      skipped: 0,
      failed: 0,
    };
    const locale = await this.deps.handoff
      .findStoreLocale(orgId, storeId)
      .catch(() => null)
      ?? fallbackLocale;
    await this.deliverSellerNotices(orgId, storeId, locale, result);
    await this.deliverBuyerReplies(orgId, storeId, locale, result);
    await this.deliverOrderNotifications(orgId, storeId, locale, result);
    return result;
  }
}

export function createSotuvchiNotificationDispatcher(
  deps: SotuvchiNotificationDispatcherDeps,
): SotuvchiNotificationDispatcher {
  return new SotuvchiNotificationDispatcher(deps);
}
