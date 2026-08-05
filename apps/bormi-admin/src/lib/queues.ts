/**
 * The moderation queue counts, read once for the whole session.
 *
 * `App` already asks the moderation queue for its `summary` so the rail can
 * carry badges. The command centre wants the same three numbers, and fetching
 * them a second time would mean two requests for one answer and a screen whose
 * rail and body could disagree about how many listings are waiting.
 *
 * So it is passed down rather than re-read. `null` means the summary is not
 * available - not that the queues are empty - and every consumer has to render
 * that as "unknown" rather than as a zero.
 */
import { createContext, useContext } from 'react';

/** Every moderation state plus `open_reports`, exactly as the server sends it. */
export type QueueSummary = Record<string, number>;

const QueueSummaryContext = createContext<QueueSummary | null>(null);

export const QueueSummaryProvider = QueueSummaryContext.Provider;

export function useQueueSummary(): QueueSummary | null {
  return useContext(QueueSummaryContext);
}
