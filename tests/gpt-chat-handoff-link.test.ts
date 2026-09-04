import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveHandoffLink } from '../src/gpt-chat/handoff';

test('a linked handoff opens the bot deep link that can claim the token', () => {
  const payload = `w_${'a'.repeat(32)}`;
  const deepLink = `https://t.me/gptbotuz_bot?start=${payload}`;
  assert.deepEqual(resolveHandoffLink('ru', { href: deepLink, linked: true, payload }), {
    href: deepLink,
    channel: 'bot',
    withSession: true,
  });
});

test('an unlinked or malformed mint falls back to the human without claiming context', () => {
  for (const minted of [
    null,
    { href: 'https://t.me/gptbotuz_bot?start=site_ru', linked: false, payload: null },
    { href: 'https://t.me/gptbotuz_bot?start=site_ru', linked: true, payload: null },
  ]) {
    const link = resolveHandoffLink('ru', minted);
    assert.equal(link.channel, 'studio');
    assert.equal(link.withSession, false);
    assert.match(link.href, /^https:\/\/t\.me\/XGame_changerx\?text=/);
    assert.ok(!link.href.includes('w_'));
  }
});
