import { parseLeadRadarTelegramLocator } from '../../../src/shared/lead-radar-contacts';

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
    // An explicitly personal link may refer to the name/role in the preceding
    // paragraph of its staff card. Keep that evidence, without borrowing it for
    // ordinary company booking links in adjacent paragraphs.
    if (/(?:личный\s+telegram|personal\s+telegram)/i.test(context)) context=`${before}${match[0]}${nextBlock < 0 ? after : after.slice(0,nextBlock)}`;
    return [{ locator, context }];
  }).slice(0, 80);
}
