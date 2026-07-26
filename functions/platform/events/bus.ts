import type { PlatformEvent } from '../contracts';

export type EventHandler<TEvent extends PlatformEvent = PlatformEvent> =
  (event: TEvent) => void | Promise<void>;

/** All subscribers run in registration order. Failures are reported only
 * after the remaining subscribers have had a chance to observe the event. */
export class EventDispatchError extends AggregateError {
  readonly eventType: string;
  readonly failureCount: number;

  constructor(eventType: string, errors: readonly unknown[]) {
    super([...errors], `event subscriber failure: ${eventType}`);
    this.name = 'EventDispatchError';
    this.eventType = eventType;
    this.failureCount = errors.length;
  }
}

/** Request-local, dependency-free event bus. No singleton or import-time
 * subscriptions: each composition root owns its bus explicitly. */
export class EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  subscribe(eventType: string, handler: EventHandler): () => void {
    const list = this.handlers.get(eventType) ?? [];
    list.push(handler);
    this.handlers.set(eventType, list);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.handlers.get(eventType);
      if (!current) return;
      const index = current.indexOf(handler);
      if (index >= 0) current.splice(index, 1);
      if (current.length === 0) this.handlers.delete(eventType);
    };
  }

  async emit(event: PlatformEvent): Promise<void> {
    const subscribers = [...(this.handlers.get(event.type) ?? [])];
    const failures: unknown[] = [];
    for (const subscriber of subscribers) {
      try {
        await subscriber(event);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new EventDispatchError(event.type, failures);
  }
}
