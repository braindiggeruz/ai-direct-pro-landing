// Narrow P0.3 strangler bridge: exactly one Javob event is dual-written.
// Legacy analytics remain authoritative; the platform outbox is best-effort
// so an analytics failure never blocks a user reply.
import { createPlatformEventsService } from '../../platform/events';
import { logEvent, type Locale } from './store';

export interface JavobMessageReceivedEvent {
  updateId: number;
  itemId: string;
  pseudo: string;
  locale: Locale;
  language: string;
}

export async function logJavobMessageReceived(
  db: D1Database,
  input: JavobMessageReceivedEvent,
): Promise<void> {
  await logEvent(db, 'javob_message_received', input.pseudo, {
    locale: input.locale,
    lang: input.language,
  });

  try {
    const occurredAt = new Date().toISOString();
    await createPlatformEventsService(db).publish({
      idempotencyKey: `telegram:update:${input.updateId}:message.received`,
      event: {
        id: `javob-message-received:${input.updateId}`,
        type: 'message.received',
        occurredAt,
        orgId: null,
        agentId: 'javob',
        aggregate: `telegram-item:${input.itemId}`,
        payload: {
          channel: 'telegram',
          locale: input.locale,
          language: input.language,
          sourceType: 'direct',
        },
      },
    });
  } catch {
    // Safe, content-free failure policy: legacy logging and the user flow
    // continue even when runtime bootstrap/outbox append is unavailable.
    console.error('tg.platform_event bridge failed');
  }
}
