// How a web-chat turn ended and whether it counts against the allowance
// (plan decision L4). Pure: functions/api/gpt/chat.ts decides with it and
// TurnStore.finish writes the result (gpt_turn_reservations.outcome and
// charged, migrations/0066). No text is ever part of it.

/**
 * gpt_turn_reservations.outcome:
 *   answered           the model finished the answer; charged
 *   truncated          the answer stopped at the length limit; never charged
 *   client_gone        the visitor pressed Stop or left; charged only once
 *                      GPT_STOP_CHARGE_MIN_CHARS characters had reached them
 *   upstream_error     the provider failed before or during the answer
 *   no_model           nothing could answer: no key, every model cooling or
 *                      unknown, the account, its credits or a pack's attempt
 *                      ceiling refused
 *   refused            the provider refused this one request (moderation, a
 *                      request-level 400)
 *   context_too_large  the message did not fit the context budget
 */
export type TurnOutcome =
  | "answered"
  | "truncated"
  | "client_gone"
  | "upstream_error"
  | "no_model"
  | "refused"
  | "context_too_large";

/** finish_reason of an answer cut off at the length limit (OpenRouter and Z.ai). */
const TRUNCATING_FINISH_REASONS: ReadonlySet<string> = new Set([
  "length",
  "model_context_window_exceeded",
]);

export function isTruncated(finishReason: string | null | undefined): boolean {
  return !!finishReason && TRUNCATING_FINISH_REASONS.has(finishReason);
}

const NO_MODEL_CODES: ReadonlySet<string> = new Set([
  "no_key",
  "models_cooling",
  "model_unavailable",
  "account_unavailable",
  "paid_credit_exhausted",
  "balance_exhausted",
  "budget_exhausted",
]);

/** The outcome of a turn without an answer, from the walker's or the stream's failure code. */
export function failureOutcome(code: string): TurnOutcome {
  if (code === "aborted") return "client_gone";
  if (code === "content_refused" || code === "bad_request") return "refused";
  return NO_MODEL_CODES.has(code) ? "no_model" : "upstream_error";
}

/** What the stream pump saw once a model had started answering. */
export interface StreamedAnswer {
  /** Whether any non-blank answer text arrived from the model. */
  hasText: boolean;
  /** Answer characters that reached the visitor (writes that succeeded). */
  deliveredChars: number;
  /** The upstream sent its end of stream ([DONE]). */
  completed: boolean;
  /** The upstream's failure code when it broke mid-answer, else null. */
  upstreamCode: string | null;
  /** The visitor stopped or left (a failed write or request.signal). */
  clientGone: boolean;
  finishReason?: string;
}

export interface AnswerSettlement {
  outcome: TurnOutcome;
  charged: boolean;
  /** gpt_turn_reservations.cancel_reason: 'client_gone' when the visitor left. */
  cancelReason: "client_gone" | null;
}

/**
 * Settle a turn whose model started answering (decision L4), in this order:
 * 1. cut at the length limit → truncated, never charged, even when the
 *    visitor left after the cut;
 * 2. the visitor stopped or left → client_gone, charged only when at least
 *    stopChargeMinChars characters reached them (0 = never);
 * 3. the provider broke mid-answer or never finished → not charged;
 * 4. otherwise answered, charged.
 */
export function settleStreamedAnswer(
  answer: StreamedAnswer,
  stopChargeMinChars: number,
): AnswerSettlement {
  const cancelReason = answer.clientGone ? "client_gone" : null;
  if (answer.hasText && isTruncated(answer.finishReason))
    return { outcome: "truncated", charged: false, cancelReason };
  if (answer.clientGone)
    return {
      outcome: "client_gone",
      charged:
        stopChargeMinChars > 0 &&
        answer.hasText &&
        answer.deliveredChars >= stopChargeMinChars,
      cancelReason,
    };
  if (answer.upstreamCode)
    return { outcome: failureOutcome(answer.upstreamCode), charged: false, cancelReason };
  if (!answer.completed || !answer.hasText)
    return { outcome: "upstream_error", charged: false, cancelReason };
  return { outcome: "answered", charged: true, cancelReason };
}
