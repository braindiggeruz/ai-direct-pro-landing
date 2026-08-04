/**
 * The classifieds shell is the whole app in production.
 *
 * `App.tsx` chooses between two shells: the store shell (`BuyerApp`, which owns
 * the cabinet) and the classifieds shell (`ClassifiedsBuyer`). The choice is a
 * server flag, and when `MARKET_CLASSIFIEDS_DISCOVERY_ENABLED` is true the store
 * shell — and with it every account screen it owned — never mounts at all.
 *
 * That is not a hypothetical: the flag is true in `wrangler.toml`. So whatever
 * a person needs in order to run their own account has to exist inside the
 * classifieds shell, and the two assertions here are the ones that were false in
 * production and had no test to say so.
 *
 * Source-level, for the reason the copy test gives: the subject is a navigation
 * table and a prop list, not a rendered tree.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const BUYER = 'src/screens/ClassifiedsBuyer.tsx';

test('classifieds: the shell that replaces the cabinet carries a cabinet', () => {
  const screen = source(BUYER);
  const shell = source('src/App.tsx');

  // A destination in the bar, not a screen buried behind a sheet.
  assert.match(screen, /\['profile', 'cabinet'\]/);

  // The cabinet is nothing without what the shell knows about the person, and
  // `ClassifiedsBuyer` can only know it if `App` hands it over. Each of these
  // was passed to `BuyerApp` and to nothing else while the store shell was the
  // only one with an account screen.
  //
  // The slice has to stop at this element's own closing `/>`. `BuyerApp` is the
  // other arm of the same ternary and carries all five of these props already,
  // so a slice that ran to the end of the file would be satisfied by the mount
  // that never needed fixing — the test would pass with the props deleted from
  // the one it is about.
  const at = shell.indexOf('<ClassifiedsBuyer');
  assert.notEqual(at, -1, 'ClassifiedsBuyer is not mounted in App.tsx; this test is stale');
  const mount = shell.slice(at, shell.indexOf('/>', at));
  for (const prop of ['userName=', 'buildId=', 'theme=', 'onTheme=', 'onLocale=']) {
    assert.ok(mount.includes(prop), `ClassifiedsBuyer is mounted without ${prop}`);
  }

  // Reached from the cabinet as named rows rather than from a "+" that opens a
  // menu — a person looking for their own listings does not press "publish".
  for (const destination of ['listings', 'inquiries', 'composer'] as const) {
    assert.ok(
      screen.includes(`openSeller('${destination}', 'profile')`),
      `the cabinet has no way to reach the seller's ${destination}`,
    );
  }
});

test('classifieds: the bar sizes itself to the tabs it was given', () => {
  const screen = source(BUYER);
  const styles = source('src/styles.css');

  // The publish tab is conditional, so the bar renders four or five buttons.
  assert.match(screen, /\.\.\.\(privateListing \? \[\['sell', 'plus'\] as const\] : \[\]\)/);

  const bar = screen.slice(screen.indexOf('<nav className="bottom-nav'));
  const opening = bar.slice(0, bar.indexOf('>'));
  assert.match(
    opening,
    /bottom-nav--auto/,
    'the classifieds bar uses the fixed four-column grid; a fifth tab wraps',
  );

  const rule = styles.slice(styles.indexOf('.bottom-nav--auto'));
  assert.match(rule.slice(0, rule.indexOf('}')), /grid-auto-flow: column/);
});
