import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const article = JSON.parse(readFileSync('content/blog/ru/chatgpt-i-claude-v-uzbekistane.json', 'utf8'));
const content = JSON.stringify({ intro: article.intro, body: article.body, faq: article.faq });
const sourceUrls = article.sources.map((source: { url: string }) => source.url);

test('individual ChatGPT plans do not promise family or team account sharing', () => {
  assert.doesNotMatch(content, /можно делить|до шести человек|семейная подписка/i);
  assert.match(content, /передавать общий логин семье или команде нельзя/);
  assert.ok(sourceUrls.includes('https://help.openai.com/en/articles/10471989-openai-account-sharing-policy'));
});

test('provider guide does not guarantee Uzbek card acceptance or unsupported local-wallet topups', () => {
  assert.doesNotMatch(content, /любого узбекского банка|пополняется через Payme|в один клик|комиссией 15[–-]30%|на 10[–-]15% выше/);
  assert.match(content, /не гарантирует успешное списание|гарантировать оплату.*нельзя/);
  assert.match(content, /не активирует ChatGPT Plus/);
  assert.ok(sourceUrls.includes('https://help.openai.com/en/articles/7232916-why-was-my-credit-card-declined'));
  assert.ok(sourceUrls.includes('https://support.google.com/googleplay/answer/2651410?hl=en'));
});

test('volatile paid-plan prices and universal registration promises are not presented as current facts', () => {
  assert.doesNotMatch(content, /61 000|242 000|300 000|\$5|89 государств|ещё 88 стран|Регистрация: 2 минуты|Полные лимиты/);
  assert.match(content, /цену.*checkout|checkout.*цену/);
  assert.match(content, /подтверждение телефона.*не является обязательным/);
  assert.ok(sourceUrls.includes('https://help.openai.com/en/articles/11989085-what-is-chatgpt-go'));
  assert.ok(sourceUrls.includes('https://help.openai.com/en/articles/8983040-what-does-phone-verification-look-like'));
});
