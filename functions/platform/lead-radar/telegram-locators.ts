import { parseLeadRadarTelegramLocator } from '../../../src/shared/lead-radar-contacts';

/** A contact label may be a separate paragraph immediately before its icon.
 * Only borrow an explicit Telegram lead-in ending in a colon, without crossing
 * closing containers or another link. Never borrow a general nearby CTA. */
function precedingTelegramLabel(html: string, index: number): string {
  const prefix = html.slice(Math.max(0, index - 1800), index);
  const label = prefix.match(/<(p|label|h[2-6])\b[^>]*>((?:(?!<(?:a|p|label|h[1-6]|div|section|article|footer|script|style)\b)[\s\S]){1,1200}?)<\/\1>\s*(?:<(?:div|p|span)\b[^>]*>\s*)*<a\b[^>]*$/i);
  if (!label) return '';
  const text = label[2].replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();
  return /(?:telegram|телеграм)[^:]{0,80}:$/iu.test(text) && !/@|t\.me\/|telegram\.me\//i.test(text) ? text : '';
}

/** Extract published locators, never generate usernames from company names.
 * Bare @handles are accepted only in visible text, not emails/scripts/attributes. */
export function publishedTelegramLocators(html: string) {
  const bounded = html.slice(0, 900_000);
  const visible = bounded.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (part) => ' '.repeat(part.length))
    .replace(/<[^>]*>/g, (part) => ' '.repeat(part.length));
  const matches = [
    ...bounded.matchAll(/(?:https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\/[^\s"'<>]{1,200}|tg:\/\/(?:resolve|message)\?[^\s"'<>]{1,200})/gi),
    ...visible.matchAll(/(?<![\w@.+-])@[a-z][a-z0-9_]{4,31}(?![\w@])/gi),
    ...visible.matchAll(/(?<![\w/.])(?:t\.me|telegram\.me)\/[a-z][a-z0-9_]{4,31}(?![\w/])/gi),
  ];
  return matches.flatMap((match) => {
    const raw = match[0].replace(/[.,;!?)]+$/, '');
    const locator = parseLeadRadarTelegramLocator(/^(?:t\.me|telegram\.me)\//i.test(raw) ? `https://${raw}` : raw);
    if (!locator) return [];
    const index = match.index!;
    // Adjacent blocks may describe a news channel, a person, or a web vendor.
    // Do not borrow those labels when classifying this endpoint.
    const before = bounded.slice(Math.max(0, index - 180), index);
    const after = bounded.slice(index + match[0].length, index + match[0].length + 180);
    const previousBlock = [...before.matchAll(/<\/(?:p|li|section|article|footer|div)>/gi)].at(-1);
    const nextBlock = after.search(/<\/(?:p|li|section|article|footer|div)>/i);
    let context = `${previousBlock ? before.slice(previousBlock.index! + previousBlock[0].length) : before}${match[0]}${nextBlock < 0 ? after : after.slice(0, nextBlock)}`;
    const leadIn = precedingTelegramLabel(bounded, index);
    if (leadIn) context = `${leadIn} ${context}`;
    // An explicitly personal link may refer to the name/role in the preceding
    // paragraph of its staff card. Keep that evidence, without borrowing it for
    // ordinary company booking links in adjacent paragraphs.
    if (/(?:личный\s+telegram|личный\s+телеграм|personal\s+telegram)/i.test(context)) context=`${leadIn} ${before}${match[0]}${nextBlock < 0 ? after : after.slice(0,nextBlock)}`;
    return [{ locator, context }];
  }).slice(0, 80);
}
