// What the paid stage puts into a tool island (BUILD-PLAN 07.10.2026,
// Build-0 contracts). main.tsx mounts the presentation form and the photo
// island and hands both the same slots; the billing code decides what is
// inside them. A tool never imports billing code: it only calls a slot,
// after hydration, where its own layout leaves room for it.
import type { ReactNode } from 'react';

/** Where the tariffs section is asked for: under a finished free result, or on the card of a spent limit. */
export type TariffsPlace = 'after_result' | 'limit';

export interface IslandSlots {
  /**
   * The neutral «Tariflar» section (DECISIONS §1(д)): no call to buy, no
   * timer, nothing chosen in advance. On the limit card the tool's own first
   * line says when the free unit is back; the section comes after it.
   */
  tariffs?(place: TariffsPlace): ReactNode;
  /** «Mening paketim»: the running tariffs, what is left, the order number and receipts (/me). */
  myPack?(): ReactNode;
}
