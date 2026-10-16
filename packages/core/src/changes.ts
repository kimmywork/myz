/**
 * Change notification port.
 *
 * Domains publish a lightweight event after any write; every context (other
 * dashboard tabs, readers, popup, content scripts) subscribes and refreshes.
 * This is an *event* channel, not a command queue: it carries no payload to
 * reconcile, only "what changed" so readers re-pull from the authoritative
 * single writer.
 */
export type ChangeDomain = "records" | "inbox" | "settings" | "sync";

export interface ChangeEvent {
  domain: ChangeDomain;
  /** Affected record/state ids, when cheap to know. */
  ids?: string[];
  /** Epoch millis the change was published. */
  at: number;
}

export interface ChangeBus {
  /** Notify subscribers that `domain` changed. */
  publish(event: { domain: ChangeDomain; ids?: string[] }): void;
  /** Subscribe to change events; returns an unsubscribe function. */
  subscribe(listener: (event: ChangeEvent) => void): () => void;
}
