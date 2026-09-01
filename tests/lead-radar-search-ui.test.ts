import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  leadRadarLateStageValue,
  leadRadarPulseSettlement,
  leadRadarSavedCardsProgress,
  leadRadarSearchPulseNotice,
  leadRadarSearchRateLimitCopy,
} from '../src/admin/pages/LeadRadar.tsx';

const ROOT = path.resolve(import.meta.dirname, '..');
const PAGE = readFileSync(path.join(ROOT, 'src/admin/pages/LeadRadar.tsx'), 'utf8');

test('running search progress is explicitly scoped to saved cards and keeps the Telegram target separate', () => {
  const progress = leadRadarSavedCardsProgress({ candidateCount: 60, processedCount: 60 });
  assert.deepEqual(progress, {
    label: 'Обработанные сохранённые карточки',
    value: 60,
    max: 60,
  });
  assert.equal(leadRadarLateStageValue(0, true), 'Пока 0');
  assert.equal(leadRadarLateStageValue(0, false), 0);
  assert.equal(leadRadarLateStageValue(3, true), 3);
  assert.match(PAGE, /Цель подтверждённых Telegram-контактов: \{search\.funnel\.resolvedTelegramCount \?\? 0\} из \{search\.input\.desiredCount\}/);
  assert.match(PAGE, /Обработка сохранённых карточек сама по себе не означает, что Telegram-цель достигнута/);
  assert.doesNotMatch(PAGE, /running && value === 0 \? 'Ищем'/);
});

test('manual status refresh restarts the bounded search poller', () => {
  assert.match(PAGE, /const \[pollingRevision, setPollingRevision\] = useState\(0\)/);
  assert.match(PAGE, /if \(options\.restartPolling\) setPollingRevision\(\(current\) => current \+ 1\)/);
  assert.match(PAGE, /\[loadOverview, pollingRevision, result\?\.capabilities\?\.processingEnabled, result\?\.search\.id, result\?\.search\.status\]/);
  const manualRefreshes = PAGE.match(/openSearch\(result\.search\.id, \{ restartPolling: true \}\)/g) ?? [];
  assert.ok(manualRefreshes.length >= 3, 'every explicit status-refresh action must restart polling');
});

test('manual pulse is single-flight, reports the server result and performs a delayed refresh', () => {
  assert.equal(
    leadRadarSearchPulseNotice({ note: 'Партия принята.', kicked: 2, remaining: 126 }),
    'Партия принята. Отправлено в очередь: 2; в пуле осталось: 126.',
  );
  assert.match(
    leadRadarSearchPulseNotice({ note: 'Финальные проверки.', kicked: 0, remaining: null }),
    /Отправлено в очередь: 0; остаток пула уточняется/,
  );

  const pulse = PAGE.slice(PAGE.indexOf('async function pulseSearch'), PAGE.indexOf('async function refreshCollectedContacts'));
  assert.match(pulse, /if \(pulseInFlight\.current\) return/);
  assert.match(pulse, /setPulseBusy\(true\)/);
  assert.match(pulse, /leadRadarSearchPulseNotice\(pulse\)/);
  assert.match(pulse, /window\.setTimeout\(resolve, 2_000\)/);
  assert.ok(
    pulse.indexOf('window.setTimeout(resolve, 2_000)') < pulse.lastIndexOf('api.leadRadarSearchResult(searchId)'),
    'the result read must happen after the queue has had time to advance',
  );
  assert.match(pulse, /Партию не удалось поставить в обработку/);
  assert.match(PAGE, /disabled=\{loading \|\| pulseBusy\}/);
  assert.match(PAGE, /pulseNotice\.kind === 'error' \? 'alert' : 'status'/);
});

test('a pulse failure after switching search clears its own busy lock without publishing stale UI', () => {
  assert.deepEqual(leadRadarPulseSettlement({
    currentOperation: 7,
    operation: 7,
    currentView: 11,
    view: 10,
  }), {
    ownsOperation: true,
    mayPublish: false,
  });
  assert.deepEqual(leadRadarPulseSettlement({
    currentOperation: 8,
    operation: 7,
    currentView: 10,
    view: 10,
  }), {
    ownsOperation: false,
    mayPublish: false,
  });
  assert.deepEqual(leadRadarPulseSettlement({
    currentOperation: 7,
    operation: 7,
    currentView: 10,
    view: 10,
  }), {
    ownsOperation: true,
    mayPublish: true,
  });

  const pulse = PAGE.slice(PAGE.indexOf('async function pulseSearch'), PAGE.indexOf('async function refreshCollectedContacts'));
  const catchBlock = pulse.slice(pulse.indexOf('} catch (pulseError)'), pulse.indexOf('// Queue processing is asynchronous'));
  assert.match(catchBlock, /if \(settlement\.mayPublish\)/);
  assert.match(catchBlock, /if \(settlement\.ownsOperation\)[\s\S]*setPulseBusy\(false\)/);
});

test('rate-limit copy stays honest when the server does not expose the exact throttle reason', () => {
  const copy = leadRadarSearchRateLimitCopy(60);
  assert.match(copy, /ограничение частоты или ещё есть незавершённые запуски/);
  assert.match(copy, /60 сек/);
  assert.doesNotMatch(copy, /Другой поиск|два поиска|двух незавершённых/);
  assert.doesNotMatch(PAGE, /лимит «не больше двух незавершённых поисков»/);
});
