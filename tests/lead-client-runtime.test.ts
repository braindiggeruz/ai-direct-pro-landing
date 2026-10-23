// Runs the actual React submit handlers with deterministic hooks and local
// fetch/storage substitutes. No browser, production lead or external message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import path from 'node:path';

interface NodeView { type: unknown; props: Record<string, unknown> }
const bundled = build({
  stdin: { contents: "export { AiLeadForm as chat } from './src/gpt-chat/components/AiLeadForm'; export { default as calculator } from './src/calculator/CalculatorApp';", resolveDir: path.resolve(import.meta.dirname, '..'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
});
function nodes(root: unknown): NodeView[] {
  if (Array.isArray(root)) return root.flatMap(nodes);
  if (!root || typeof root !== 'object' || !('props' in root)) return [];
  const node = root as NodeView;
  return [node, ...nodes(node.props.children)];
}
function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
async function harness(surface: 'chat' | 'calculator', response: unknown, local = memoryStorage(), timeoutMs?: number) {
  const values: unknown[] = [];
  let cursor = 0, uuid = 0;
  const events: unknown[][] = [], goals: unknown[][] = [], requests: Array<Record<string, unknown>> = [];
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], (next: unknown) => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in values)) values[index] = { current: initial };
      return values[index];
    },
    useId: () => 'fixture', useEffect() {}, useImperativeHandle() {},
    useMemo: (fn: () => unknown) => fn(), forwardRef: (fn: unknown) => fn,
  };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const location = { pathname: surface === 'chat' ? '/ru/gpt-chat/' : '/ru/kalkulyator-stoimosti-telegram-bota/', hostname: 'gptbot.uz', search: '' };
  const window = { location, localStorage: local, sessionStorage: memoryStorage(), gtag: (...args: unknown[]) => events.push(args), ym: (...args: unknown[]) => goals.push(args) };
  const module = { exports: {} as Record<string, (props?: unknown) => unknown> };
  const context = vm.createContext({
    module, exports: module.exports, window, location, URL, URLSearchParams, Date, AbortController,
    setTimeout: (callback: () => void, ms: number) => setTimeout(callback, timeoutMs ?? ms), clearTimeout,
    crypto: { randomUUID: () => `${++uuid}23e4567-e89b-12d3-a456-426614174000` },
    document: { referrer: '', documentElement: { lang: 'ru' }, getElementById: () => null },
    requestAnimationFrame: (fn: () => void) => fn(),
    fetch: async (url: string, init: RequestInit) => {
      assert.equal(url, '/api/gpt/lead');
      requests.push(JSON.parse(String(init.body)));
      if (response instanceof Error) throw response;
      return { json: async () => response };
    },
    require: (name: string) => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  vm.runInContext((await bundled).outputFiles[0].text, context);
  const render = () => {
    cursor = 0;
    return nodes(module.exports[surface]({ t: { privacyHref: '/ru/privacy/', leadPrivacy: 'Privacy' }, locale: 'ru', apiBase: '', sessionId: null, intent: 'business_crm', method: 'chat_b2b_line', source: 'chat_b2b' }));
  };
  let tree = render();
  const invoke = async (node: NodeView | undefined, event: string, payload = {}) => {
    assert.ok(node, `${surface}: missing control`);
    const fn = node.props[event] as (value: unknown) => unknown;
    assert.equal(typeof fn, 'function');
    await fn(payload);
    tree = render();
  };
  if (surface === 'calculator') {
    for (let i = 0; i < 3; i++) await invoke(tree.find((node) => node.type === 'button' && String(node.props.className).startsWith('btn-primary')), 'onClick');
  }
  const changeContact = (value: string) => invoke(tree.find((node) => String(node.props.id).endsWith('-contact')), 'onChange', { target: { value } });
  await changeContact('@fixture_contact');
  await invoke(tree.find((node) => node.type === 'input' && node.props.type === 'checkbox'), 'onChange', { target: { checked: true } });
  return {
    events, goals, requests, local,
    changeContact,
    changeName: (value: string) => invoke(tree.find((node) => String(node.props.id).endsWith('-name')), 'onChange', { target: { value } }),
    changeBudget: (value: string) => invoke(tree.find((node) => node.type === 'select'), 'onChange', { target: { value } }),
    changeEstimate: () => invoke(tree.find((node) => node.props.name === 'volume' && !node.props.checked), 'onChange'),
    submit: () => invoke(tree.find((node) => node.type === 'form'), 'onSubmit', { preventDefault() {} }),
    setResponse: (value: unknown) => { response = value; },
    successful: () => tree.some((node) => node.props['data-testid'] === 'ai-lead-success' || (surface === 'calculator' && node.props.role === 'status' && String(node.props.children).includes('Заявка принята'))),
    visibleForm: () => tree.some((node) => node.type === 'form'),
    text: () => tree.flatMap((node) => [node.props.children].flat().filter((value) => typeof value === 'string')).join(' '),
    fieldValue: (suffix: string) => tree.find((node) => String(node.props.id).endsWith(suffix))?.props.value,
    contactDisabled: () => tree.find((node) => String(node.props.id).endsWith('-contact'))?.props.disabled,
  };
}

for (const surface of ['chat', 'calculator'] as const) {
  test(`${surface}: real submit handler counts new and legacy acknowledgement but not contact duplicate`, async () => {
    for (const [response, expected] of [[{ ok: true, id: 'lead_new', delivery: 'pending' }, 1], [{ ok: true }, 1], [{ ok: true, id: 'lead_duplicate', duplicate: true }, 0]] as const) {
      const h = await harness(surface, response);
      await h.submit();
      assert.equal(h.successful(), expected === 1);
      if (expected === 0) {
        assert.equal(h.visibleForm(), true);
        assert.match(h.text(), /Предыдущая заявка/);
        assert.equal(h.fieldValue('-contact'), '@fixture_contact');
      }
      assert.equal(h.events.filter((event) => event[1] === 'generate_lead').length, expected);
      assert.equal(h.goals.length, expected * 2);
      assert.doesNotMatch(JSON.stringify([...h.events, ...h.goals]), /fixture_contact|lead_new|lead_duplicate/);
    }
  });

  test(`${surface}: lost response retry keeps request id; idempotent success counts once across reload`, async () => {
    const h = await harness(surface, new Error('lost response'));
    await h.submit();
    assert.equal(h.successful(), false);
    assert.equal(h.events.filter((event) => event[1] === 'generate_lead').length, 0);
    const ack = { ok: true, id: 'lead_lost_response', duplicate: true, idempotent: true };
    h.setResponse(ack);
    await h.submit();
    assert.equal(h.requests[0].requestId, h.requests[1].requestId);
    assert.equal(h.successful(), true);
    assert.equal(h.events.filter((event) => event[1] === 'generate_lead').length, 1);
    const reload = await harness(surface, ack, h.local);
    await reload.submit();
    assert.equal(reload.successful(), true);
    assert.equal(reload.events.filter((event) => event[1] === 'generate_lead').length, 0);
    assert.equal(reload.goals.length, 0);
  });

  test(`${surface}: rate limit is not success; editing contact starts a new request`, async () => {
    const h = await harness(surface, { ok: false, code: 'rate_limited' });
    await h.submit();
    assert.equal(h.successful(), false);
    assert.equal(h.events.filter((event) => event[1] === 'generate_lead').length, 0);
    assert.equal(h.goals.length, 0);
    await h.changeContact('@changed_fixture');
    await h.submit();
    assert.notEqual(h.requests[0].requestId, h.requests[1].requestId);
  });

  test(`${surface}: name and ${surface === 'chat' ? 'budget' : 'estimate'} edits cannot be mistaken for an idempotent replay`, async () => {
    const h = await harness(surface, new Error('lost response'));
    await h.submit();
    assert.match(h.text(), /могла сохраниться/);
    await h.changeName('Edited fixture');
    await h.submit();
    assert.notEqual(h.requests[0].requestId, h.requests[1].requestId);
    if (surface === 'chat') await h.changeBudget('2-5m');
    else await h.changeEstimate();
    h.setResponse({ ok: true, duplicate: true, id: 'lead_existing' });
    await h.submit();
    assert.notEqual(h.requests[1].requestId, h.requests[2].requestId);
    assert.equal(h.successful(), false);
    assert.equal(h.fieldValue('-name'), 'Edited fixture');
    assert.match(h.text(), /Предыдущая заявка/);
    assert.equal(h.events.filter((event) => event[1] === 'generate_lead').length, 0);
    assert.doesNotMatch(JSON.stringify(h.events), /Edited fixture|fixture_contact/);
  });

  test(`${surface}: rapid double submit sends once and pending input is locked`, async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => { resolve = done; });
    const h = await harness(surface, pending);
    const first = h.submit();
    const second = h.submit();
    assert.equal(h.requests.length, 1);
    await second;
    assert.equal(h.contactDisabled(), true);
    resolve({ ok: true, id: 'lead_double' });
    await Promise.all([first, second]);
    assert.equal(h.successful(), true);
    assert.equal(h.events.filter((event) => event[1] === 'generate_lead').length, 1);
  });

  test(`${surface}: deadline releases form, late success is ignored, unchanged retry keeps key`, async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => { resolve = done; });
    const h = await harness(surface, pending, memoryStorage(), 10);
    await h.submit();
    assert.equal(h.successful(), false);
    assert.match(h.text(), /могла сохраниться/);
    resolve({ ok: true, id: 'lead_delayed' });
    await new Promise((done) => setTimeout(done, 0));
    assert.equal(h.events.filter((event) => event[1] === 'generate_lead').length, 0);
    h.setResponse({ ok: true, id: 'lead_delayed', duplicate: true, idempotent: true });
    await h.submit();
    assert.equal(h.requests[0].requestId, h.requests[1].requestId);
    assert.equal(h.successful(), true);
    assert.equal(h.events.filter((event) => event[1] === 'generate_lead').length, 1);
  });
}

test('calculator acknowledgement does not claim a subsequently edited estimate was stored', async () => {
  const h = await harness('calculator', { ok: true, id: 'lead_original_estimate' });
  await h.submit();
  assert.equal(h.successful(), true);
  await h.changeEstimate();
  assert.equal(h.successful(), false);
  assert.equal(h.fieldValue('-contact'), '@fixture_contact');
  h.setResponse({ ok: true, id: 'lead_original_estimate', duplicate: true });
  await h.submit();
  assert.notEqual(h.requests[0].requestId, h.requests[1].requestId);
  assert.match(h.text(), /Новый расчёт и новые данные не добавлены/);
  assert.equal(h.events.filter((event) => event[1] === 'generate_lead').length, 1);
});

test('chat submit handler forwards first touch, locale and the service corresponding to the topic', async () => {
  const local = memoryStorage();
  local.setItem('gptbot_ft_v1', JSON.stringify({ landing: '/uz/chat-bot-narxi/', referrerHost: 'google.com', utm_source: 'google', utm_medium: 'organic', gclid: 'private_click' }));
  const h = await harness('chat', { ok: true, id: 'lead_attribution' }, local);
  await h.submit();
  assert.equal(h.requests[0].service, 'crm-integration');
  assert.equal(h.requests[0].locale, 'ru');
  assert.deepEqual(h.requests[0].utm, { utm_source: 'google', utm_medium: 'organic' });
  assert.deepEqual(h.requests[0].attribution, { landing: '/uz/chat-bot-narxi/', referrerHost: 'google.com', gclid: 'private_click' });
  assert.doesNotMatch(JSON.stringify([...h.events, ...h.goals]), /private_click|lead_attribution|fixture_contact/);
});
