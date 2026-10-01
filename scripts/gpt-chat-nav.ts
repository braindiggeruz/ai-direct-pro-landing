// Summary-nav link selection for `pageType: 'gpt-chat'`.
//
// Lives in its own module so tests can assert the contract without importing
// prerender.ts, which runs its whole prerender pass on import.
//
// Why this exists. The gpt-chat branch renders a full-viewport chat app plus a
// compact, VISIBLE summary section, and deliberately does not call
// renderInternalLinks() — the long-form material lives on the guide page. But
// `internalLinks` was still authored in the page JSON and silently dropped, so
// /uz/gpt-uzbek-tilida/ declared 14 links and 7 never reached the markup
// (/uz/arizalarni-avtomatlashtirish/, /uz/telegram-bot-biznes-uchun/,
// /uz/gpt-telegram-instagram-ideya/, /ru/tarify-ai-chat/, /ru/gpt-chat/,
// /uz/javob/, /uz/maxfiylik-siyosati/), and /ru/gpt-chat/ lost 2. The audit
// graph counted them, so no gate failed while the links did not exist.
//
// Declared links now join the same nav, deduplicated against the curated list
// and against anything the body prose already links — so the page gains no
// second navigation block and no duplicate href.
import type { Page } from '../src/shared/types';

export type NavLink = { href: string; text: string };

export function gptChatNavLinks(page: Page): NavLink[] {
  const uz = page.locale === 'uz';
  // /uz/chat-bot-narxi/ prices business bots (from 990 000 so‘m), not the free
  // chat, so the Uzbek link says so instead of «Tariflar» (paid-chat plan
  // WP-12, F10): a chat visitor must not read it as the chat's own price.
  const curated: NavLink[] = uz
    ? [
        { href: '/uz/gpt-chat-qollanma/', text: 'AI-chat qo‘llanmasi' },
        { href: '/uz/chat-bot-narxi/', text: 'Biznes bot narxlari' },
        { href: '/uz/biznes-uchun-ai-bot/', text: 'Biznes uchun AI' },
        { href: '/uz/blog/', text: 'Blog' },
      ]
    : [
        { href: '/ru/gpt-chat-guide/', text: 'Гайд по AI-чату' },
        { href: '/ru/tarify-ai-chat/', text: 'Тарифы' },
        { href: '/ru/gpt-dlya-biznesa/', text: 'AI для бизнеса' },
        { href: '/ru/blog/', text: 'Блог' },
      ];

  const seen = new Set<string>(curated.map((l) => l.href));
  const bodyLinked = new Set<string>();
  for (const block of page.bodyBlocks || []) {
    for (const l of block.links || []) if (l.target) bodyLinked.add(l.target);
    if (block.href) bodyLinked.add(block.href);
  }

  const declared: NavLink[] = [];
  for (const l of page.internalLinks || []) {
    if (!l.target || !l.anchor) continue;
    if (seen.has(l.target) || bodyLinked.has(l.target)) continue;
    seen.add(l.target);
    declared.push({ href: l.target, text: l.anchor });
  }
  return [...curated, ...declared];
}
