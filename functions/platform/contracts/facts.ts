// Platform contract: Facts — the ONLY data allowed into a final user-facing
// answer. Grounding (fail-closed) will compare rendered output against the
// FactSheets produced by executed tools; anything outside them is rejected.
// Values are scalars on purpose: no nested blobs, no free-form objects a
// model could smuggle invented content through.

export type FactValue = string | number | boolean | null;

export interface FactSheet {
  /** Tool that produced these facts (audit trail for grounding failures). */
  toolName: string;
  values: Readonly<Record<string, FactValue>>;
}
