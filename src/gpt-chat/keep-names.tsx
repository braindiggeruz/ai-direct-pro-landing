import type { ReactNode } from "react";

/**
 * Brand and company names that a browser's page translation must leave as they
 * are (2026-11-23: on the owner's phone Chrome translated the Uzbek pay window
 * into Russian and showed «Нажмите» for Click, «Пейме» for Payme and «СВОБОДА —
 * ЭТО НЕБЕСА» for the seller). Chrome honours the HTML attribute `translate="no"`;
 * the class `notranslate` is the one Google Translate's own widget reads.
 *
 * `text` comes back as ONE span keyed by the text, with each of `names` in it in
 * its own translate="no" span; the rest of the sentence still translates.
 * - One span, not loose pieces: in a flex button (.gpt-primary has gap: 16px) loose
 *   pieces become separate flex items, the space between them collapses and the
 *   gap stands in its place («Оплатить через    Click»).
 * - Keyed by the text: a page translation swaps text nodes for its own <font>
 *   elements, and React throws when it removes, or inserts next to, a text node it
 *   no longer finds. A new text mounts a new span, so React never touches the
 *   pieces inside. Make it the only child, or put an element right after it:
 *   React inserts the new span before its next sibling.
 */
export function keepNames(text: string, names: readonly string[]): ReactNode {
  const parts: ReactNode[] = [];
  let rest = text;
  while (rest) {
    let at = -1;
    let hit = "";
    for (const name of names) {
      const index = name ? rest.indexOf(name) : -1;
      if (index >= 0 && (at < 0 || index < at || (index === at && name.length > hit.length))) {
        at = index;
        hit = name;
      }
    }
    if (at < 0) {
      parts.push(rest);
      break;
    }
    if (at > 0) parts.push(rest.slice(0, at));
    parts.push(<span key={parts.length} translate="no" className="notranslate">{hit}</span>);
    rest = rest.slice(at + hit.length);
  }
  return <span key={text}>{parts}</span>;
}
