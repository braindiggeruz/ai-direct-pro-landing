import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { reportError, swallow } from '../functions/lib/observability.ts';

/**
 * The point of `swallow` is that it preserves the fire-and-forget contract of
 * the `.catch(() => undefined)` it replaced while restoring the log line. If
 * either half regresses, the codebase silently goes blind again — so both are
 * asserted here.
 */

interface CapturedLog {
  lines: string[];
  restore: () => void;
}

function captureError(): CapturedLog {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(' '));
  };
  return {
    lines,
    restore: () => {
      console.error = original;
    },
  };
}

let capture: CapturedLog;

beforeEach(() => {
  capture = captureError();
});

afterEach(() => {
  capture.restore();
});

describe('reportError', () => {
  test('logs the scope and the message for an Error', () => {
    reportError('demo-scope', new Error('boom'));
    assert.equal(capture.lines.length >= 1, true);
    assert.match(capture.lines[0], /^\[demo-scope\] boom$/);
  });

  test('logs the stack on a following line, bounded to a few frames', () => {
    reportError('demo-scope', new Error('boom'));
    const stackLine = capture.lines.find((l) => l.includes('stack:'));
    assert.equal(stackLine !== undefined, true);
    // 4 frames max — a full D1 stack would flood the Workers log.
    assert.equal((stackLine ?? '').split(' | ').length <= 4, true);
  });

  test('survives a rejected non-Error value', () => {
    reportError('demo-scope', 'plain string rejection');
    assert.match(capture.lines[0], /^\[demo-scope\] plain string rejection$/);
  });

  test('survives null and undefined without throwing', () => {
    assert.doesNotThrow(() => reportError('demo-scope', null));
    assert.doesNotThrow(() => reportError('demo-scope', undefined));
  });

  test('never throws even when the value explodes on stringification', () => {
    const hostile = {
      get message() {
        throw new Error('cannot read message');
      },
    };
    assert.doesNotThrow(() => reportError('demo-scope', hostile));
  });
});

describe('swallow', () => {
  test('resolves to undefined so existing call sites keep their type', async () => {
    const result = await Promise.reject(new Error('nope')).catch(swallow('demo-scope'));
    assert.equal(result, undefined);
  });

  test('logs the rejection instead of swallowing it silently', async () => {
    await Promise.reject(new Error('db is down')).catch(swallow('demo-scope'));
    assert.equal(capture.lines.length >= 1, true);
    assert.match(capture.lines[0], /^\[demo-scope\] db is down$/);
  });

  test('returns the explicit fallback when one is supplied', async () => {
    const result = await Promise.reject(new Error('nope')).catch(
      swallow('demo-scope', { empty: true }),
    );
    assert.deepEqual(result, { empty: true });
  });

  test('leaves a resolved promise untouched and logs nothing', async () => {
    const result = await Promise.resolve('kept').catch(swallow('demo-scope'));
    assert.equal(result, 'kept');
    assert.equal(capture.lines.length, 0);
  });

  test('a failed secondary write no longer fails the request', async () => {
    // The exact shape this helper exists for: analytics must not break the
    // response, but the failure must still be visible in the log.
    const writeMetric = () => Promise.reject(new Error('D1_ERROR: no such table'));
    // The handler resolves instead of re-rejecting, so the request path keeps
    // going — that is the whole point of the fire-and-forget contract.
    const outcome = await writeMetric()
      .then(() => 'wrote')
      .catch(swallow('market-router'))
      .then(() => 'continued');
    assert.equal(outcome, 'continued');
    assert.match(capture.lines[0], /D1_ERROR: no such table/);
  });
});
