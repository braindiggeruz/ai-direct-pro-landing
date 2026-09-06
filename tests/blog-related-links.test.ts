import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedRelatedLinks } from '../scripts/blog-related-links';

test('related cards cannot expose draft or nonexistent articles', () => {
  const live = { target: '/ru/blog/live/', anchor: 'Published guide', priority: 1 };
  const cards = [
    { target: '/ru/blog/draft/', anchor: 'Unreviewed guide', priority: 2 },
    live,
    { target: '/uz/blog/nonexistent/', anchor: 'Missing guide', priority: 3 },
  ];
  const result = publishedRelatedLinks(cards, new Set(['/ru/blog/live/']));
  assert.deepEqual(result, [live]);
  assert.equal(result[0], live, 'retained cards keep their original data and identity');
  assert.equal(cards.length, 3, 'input is not mutated');
});

test('published article lookup ignores query and fragment without rewriting the card', () => {
  const cards = [
    { target: '/uz/blog/live?from=related#example', anchor: 'Example' },
    { target: 'https://gptbot.uz/ru/blog/live/?from=related#steps', anchor: 'Steps' },
    { target: 'https://gptbot.uz/ru/blog/draft/?from=related#steps', anchor: 'Draft' },
  ];
  const published = new Set(['/uz/blog/live/', 'https://gptbot.uz/ru/blog/live/']);
  assert.deepEqual(publishedRelatedLinks(cards, published), cards.slice(0, 2));
});

test('blog indexes, services and external navigation retain order and metadata', () => {
  const cards = [
    { target: '/ru/blog/', anchor: 'All articles' },
    { target: '/uz/blog?topic=ai', anchor: 'Uzbek articles' },
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'Service' },
    { target: 'https://gptbot.uz/uz/blog/', anchor: 'Index' },
    { target: 'https://example.com/ru/blog/draft/', anchor: 'External article' },
    { target: 'https://gptbot.uz.example.com/ru/blog/draft/', anchor: 'Other host' },
  ];
  assert.deepEqual(publishedRelatedLinks(cards, new Set()), cards);
});

test('empty selection suppresses article cards and empty input remains empty', () => {
  assert.deepEqual(publishedRelatedLinks([], new Set(['/ru/blog/live/'])), []);
  assert.deepEqual(publishedRelatedLinks([
    { target: '/ru/blog/withheld/', anchor: 'Withheld' },
  ], new Set()), []);
});
