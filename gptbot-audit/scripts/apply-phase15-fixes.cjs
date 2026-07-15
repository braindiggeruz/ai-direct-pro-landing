#!/usr/bin/env node
/**
 * Phase 1-5 — CRO, SEO, UX, and analytics improvements.
 * Run: node scripts/apply-phase15-fixes.cjs
 */
const fs = require('fs');

function replaceInFile(file, replacements) {
  let c = fs.readFileSync(file, 'utf-8');
  let changed = false;
  for (const [from, to] of replacements) {
    if (c.includes(from)) {
      c = c.split(from).join(to);
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(file, c);
  return changed;
}

let fixCount = 0;

// ═══════════════════════════════════════════════════════════
// PHASE 1.1 — Add mobile sticky CTA to gpt-chat page
// ═══════════════════════════════════════════════════════════
// Currently showStickyCta is only for pageType 'money' or 'niche'.
// We extend it to also include 'gpt-chat' pages.
{
  const f = 'scripts/prerender.ts';
  let c = fs.readFileSync(f, 'utf-8');
  // Line 511: showByline is for money/niche. Line 517: showStickyCta uses showByline.
  // We need to add gpt-chat to showStickyCta independently.
  const before = c;
  c = c.replace(
    'const showStickyCta = showByline && !!(page.ctaPrimaryHref || global.defaultCTA.href);',
    `const showStickyCta = (showByline || page.pageType === 'gpt-chat') && !!(page.ctaPrimaryHref || global.defaultCTA.href);`
  );
  if (c !== before) {
    fs.writeFileSync(f, c);
    fixCount++; console.log('P1.1: Added sticky CTA to gpt-chat page');
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 1.2 — Add clear-chat button to AI chat console
// ═══════════════════════════════════════════════════════════
{
  const f = 'src/gpt-chat/components/AiChatConsole.tsx';
  let c = fs.readFileSync(f, 'utf-8');
  const before = c;

  // Add clear chat handler after onRetry definition
  c = c.replace(
    'const showB2B = assistantCount >= B2B_AFTER && !b2bDismissed && !limitReached;',
    `const onClearChat = () => {
    setMessages([]);
    saveHistory([], config.locale);
    setSessionId(null);
    saveSessionId(null, config.locale);
    setLimitReached(false);
    startedRef.current = false;
    track(EV.startChat, { locale: config.locale, action: 'clear_chat' });
    focusInput();
  };

  const showB2B = assistantCount >= B2B_AFTER && !b2bDismissed && !limitReached;`
  );

  // Add clear chat button in the top bar, before the language switcher
  c = c.replace(
    `<div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl bg-white/[0.04] overflow-hidden text-[11px]" role="group" aria-label={config.locale === 'uz' ? 'Til' : 'Язык'}">`,
    `<div className="flex items-center gap-2">
          <button type="button" onClick={onClearChat} disabled={busy || messages.length === 0} aria-label={config.locale === 'uz' ? 'Chatni tozalash' : 'Очистить чат'} title={config.locale === 'uz' ? 'Chatni tozalash' : 'Очистить чат'} className="min-h-11 w-11 inline-flex items-center justify-center rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
          <div className="flex items-center rounded-xl bg-white/[0.04] overflow-hidden text-[11px]" role="group" aria-label={config.locale === 'uz' ? 'Til' : 'Язык'}>`
  );

  if (c !== before) {
    fs.writeFileSync(f, c);
    fixCount++; console.log('P1.2: Added clear-chat button to AI console');
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 1.3 — Add scroll-to-bottom button to AI chat message list
// ═══════════════════════════════════════════════════════════
{
  const f = 'src/gpt-chat/components/AiChatMessageList.tsx';
  let c = fs.readFileSync(f, 'utf-8');
  const before = c;

  // Add scroll state and scroll-to-bottom button
  c = c.replace(
    'export function AiChatMessageList(',
    `function ScrollToBottomButton({ t, onClick }: { t: ChatStrings; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t.scrollToBottom || '↓'}
      title={t.scrollToBottom || '↓'}
      className="sticky bottom-2 left-1/2 -translate-x-1/2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 border border-white/15 text-white/70 hover:text-white hover:bg-white/20 transition-colors backdrop-blur-sm"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
    </button>
  );
}

export function AiChatMessageList(`
  );

  // Add scroll position tracking
  c = c.replace(
    'const endRef = useRef<HTMLDivElement>(null);',
    `const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);`
  );

  // Replace the auto-scroll effect with a smarter version that tracks scroll position
  c = c.replace(
    `// Auto-scroll to the latest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);`,
    `// Auto-scroll to the latest message when near the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom || messages.length <= 1) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setShowScrollBtn(!isNearBottom && messages.length > 2);
  };

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setShowScrollBtn(false);
  };`
  );

  // Wrap the message list in a scrollable container with onScroll
  c = c.replace(
    `<div className="relative z-[1] flex-1 space-y-4" data-testid="ai-chat-messages">`,
    `<div ref={scrollRef} onScroll={onScroll} className="relative z-[1] flex-1 space-y-4 overflow-y-auto" data-testid="ai-chat-messages">`
  );

  // Add scroll-to-bottom button after the endRef div
  c = c.replace(
    '<div ref={endRef} />\n    </div>\n  );\n}',
    `<div ref={endRef} />
      {showScrollBtn && <ScrollToBottomButton t={t} onClick={scrollToBottom} />}
    </div>
  );
}`
  );

  if (c !== before) {
    fs.writeFileSync(f, c);
    fixCount++; console.log('P1.3: Added scroll-to-bottom button to AI chat');
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 1.4 — Add secondary CTA to homepage Hero (path to AI chat)
// ═══════════════════════════════════════════════════════════
{
  const f = 'src/components/Hero.tsx';
  let c = fs.readFileSync(f, 'utf-8');
  const before = c;

  // Add a "Try AI Chat" link after the trust badges, before the secondary CTA
  c = c.replace(
    `{/* Secondary CTA — subtle ghost link instead of competing button */}`,
    `{/* Secondary CTA — path to AI chat product */}\n              <a\n                data-testid="hero-cta-chat"\n                href="/ru/gpt-chat/"\n                onClick={() => track('click_hero_cta_chat')}\n                className="group inline-flex items-center gap-1.5 text-sm text-brand-cyan/80 hover:text-brand-cyan transition mt-2 font-medium"\n              >\n                {t.hero.ctaChat || 'Попробовать AI-чат'}\n                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="transition-transform group-hover:translate-x-0.5"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>\n              </a>\n\n              {/* Secondary CTA — subtle ghost link instead of competing button */}`
  );

  if (c !== before) {
    fs.writeFileSync(f, c);
    fixCount++; console.log('P1.4: Added secondary CTA to homepage Hero');
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 4.1 — Add id attributes to blog h2/h3 for TOC anchors
// ═══════════════════════════════════════════════════════════
{
  const f = 'scripts/prerender-blog.ts';
  let c = fs.readFileSync(f, 'utf-8');
  const before = c;

  // Add slugify function before renderBlock
  c = c.replace(
    'function renderBlock(b: BodyBlock): string {',
    `function slugify(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\\u0400-\\u04FF\\u00C0-\\u024F\\u0100-\\u017F ]/g, '')
    .trim()
    .replace(/\\s+/g, '-');
}

function renderBlock(b: BodyBlock, idx: number): string {`
  );

  // Add id to h2 and h3
  c = c.replace(
    "case 'h2': return `<h2 class=\"font-display text-3xl sm:text-4xl mt-14 mb-5 text-white\">${escapeText(b.text || '')}</h2>`;",
    "case 'h2': return `<h2 id=\"${slugify(b.text || '')}\" class=\"font-display text-3xl sm:text-4xl mt-14 mb-5 text-white scroll-mt-20\">${escapeText(b.text || '')}</h2>`;"
  );
  c = c.replace(
    "case 'h3': return `<h3 class=\"font-display text-2xl mt-10 mb-4 text-white\">${escapeText(b.text || '')}</h3>`;",
    "case 'h3': return `<h3 id=\"${slugify(b.text || '')}\" class=\"font-display text-2xl mt-10 mb-4 text-white scroll-mt-20\">${escapeText(b.text || '')}</h3>`;"
  );

  // Update the call site to pass index
  c = c.replace(
    "bodyBlocks.map((b) => renderBlock(b)).join('')",
    "bodyBlocks.map((b, i) => renderBlock(b, i)).join('')"
  );

  if (c !== before) {
    fs.writeFileSync(f, c);
    fixCount++; console.log('P4.1: Added id attributes to blog h2/h3');
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 4.2 — Add scroll-mt to prerender.ts h2/h3 headings too
// ═══════════════════════════════════════════════════════════
{
  const f = 'scripts/prerender.ts';
  let c = fs.readFileSync(f, 'utf-8');
  const before = c;

  // Add slugify + id to h2/h3 in prerender.ts renderBlock
  c = c.replace(
    "case 'h2': return `<h2 class=\"font-display text-3xl sm:text-4xl mt-14 mb-5 text-white\">${escapeText(b.text || '')}</h2>`;",
    "case 'h2': return `<h2 id=\"${slugify(b.text || '')}\" class=\"font-display text-3xl sm:text-4xl mt-14 mb-5 text-white scroll-mt-20\">${escapeText(b.text || '')}</h2>`;"
  );
  c = c.replace(
    "case 'h3': return `<h3 class=\"font-display text-2xl mt-10 mb-4 text-white\">${escapeText(b.text || '')}</h3>`;",
    "case 'h3': return `<h3 id=\"${slugify(b.text || '')}\" class=\"font-display text-2xl mt-10 mb-4 text-white scroll-mt-20\">${escapeText(b.text || '')}</h3>`;"
  );

  // Add slugify function before renderBlock in prerender.ts
  c = c.replace(
    'function renderBlock(b: BodyBlock): string {',
    `function slugify(text: string): string {
  return (text || '').toLowerCase().replace(/[^a-z0-9\\u0400-\\u04FF\\u00C0-\\u024F\\u0100-\\u017F ]/g, '').trim().replace(/\\s+/g, '-');
}

function renderBlock(b: BodyBlock): string {`
  );

  if (c !== before) {
    fs.writeFileSync(f, c);
    fixCount++; console.log('P4.2: Added id attributes to money page h2/h3');
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 2.1 — Add Telegram CTA to pricing page body
// ═══════════════════════════════════════════════════════════
{
  const f = 'content/pages/ru/tarify-ai-chat.json';
  let c = fs.readFileSync(f, 'utf-8');
  const before = c;

  // Add a CTA block before the "Коротко о главном" section
  c = c.replace(
    '{\n      "type": "h2",\n      "text": "Коротко о главном"\n    }',
    `{ "type": "cta", "text": "Обсудить тариф в Telegram", "href": "https://t.me/XGame_changerx" },
    {
      "type": "h2",
      "text": "Коротко о главном"
    }`
  );

  if (c !== before) {
    fs.writeFileSync(f, c);
    fixCount++; console.log('P2.1: Added Telegram CTA to pricing page body');
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 5.1 — Add scrollToBottom to i18n strings
// ═══════════════════════════════════════════════════════════
{
  const f = 'src/gpt-chat/i18n.ts';
  if (fs.existsSync(f)) {
    let c = fs.readFileSync(f, 'utf-8');
    const before = c;

    // Add scrollToBottom to both ru and uz string sets
    // Find the first occurrence of a common string property and add after it
    c = c.replace(
      /(implementBot: ['"`])([^'"`]*)(['"`],)/,
      `$1$2$3\n    scrollToBottom: '↓',`
    );

    // For UZ strings, find the UZ version
    const uzMatch = c.match(/uz:.*?implementBot/s);
    if (uzMatch) {
      c = c.replace(
        /(uz:[\s\S]*?implementBot: ['"`])([^'"`]*)(['"`],)/,
        `$1$2$3\n    scrollToBottom: '↓',`
      );
    }

    if (c !== before) {
      fs.writeFileSync(f, c);
      fixCount++; console.log('P5.1: Added scrollToBottom to i18n strings');
    } else {
      // Fallback: just add it as a loose property in the ChatStrings type
      console.log('P5.1: Could not find i18n insertion point, skipping (non-critical)');
    }
  }
}

console.log('\n=== Phase 1-5 complete: ' + fixCount + ' fixes applied ===');
