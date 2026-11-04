/**
 * Task K6: a typed, in-process event bus. One server process in v1, so no queue is needed.
 *
 * Use `EventQueue` inside a transaction and `bus.publish(queue)` AFTER it commits: handlers then run on data that is really
 * saved, and a handler that throws is logged and swallowed, so it can never undo the work that caused the event.
 */
import type { Logger } from '../logging/types';
import type { DomainEvents, EventHandler, EventName } from './events';

export type BusLogger = Pick<Logger, 'error'>;

/** Events collected while a transaction runs. Nothing is delivered until the bus publishes the queue. */
export class EventQueue {
  readonly items: { name: EventName; payload: unknown }[] = [];

  push<K extends EventName>(name: K, payload: DomainEvents[K]): void {
    this.items.push({ name, payload });
  }

  get size(): number {
    return this.items.length;
  }
}

export class EventBus {
  private readonly handlers = new Map<EventName, EventHandler<EventName>[]>();

  constructor(private readonly logger?: BusLogger) {}

  on<K extends EventName>(name: K, handler: EventHandler<K>): () => void {
    const list = this.handlers.get(name) ?? [];
    list.push(handler as unknown as EventHandler<EventName>);
    this.handlers.set(name, list);
    return () => {
      const current = this.handlers.get(name) ?? [];
      this.handlers.set(
        name,
        current.filter((h) => h !== (handler as unknown)),
      );
    };
  }

  /** Deliver one event to every listener, in order. A failing listener is logged and does not stop the others. */
  async emit<K extends EventName>(name: K, payload: DomainEvents[K]): Promise<void> {
    for (const handler of this.handlers.get(name) ?? []) {
      try {
        await handler(payload as DomainEvents[EventName]);
      } catch (err) {
        this.logger?.error({ event: name, err: err instanceof Error ? { name: err.name, message: err.message } : String(err) }, 'event handler failed');
      }
    }
  }

  /** Deliver everything a committed transaction collected, in the order it was collected. */
  async publish(queue: EventQueue): Promise<void> {
    for (const e of queue.items) await this.emit(e.name, e.payload as DomainEvents[EventName]);
    queue.items.length = 0;
  }
}
