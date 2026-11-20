#!/usr/bin/env python3
"""Guarded JSON:API writer for haiershop.uz.

For each planned change (one entity translation, one field):
  1. GET the entity and assert it is unchanged since the snapshot: same field value, same `changed`, same alias.
  2. PATCH only that single field in that language.
  3. GET again and assert: new value stored, alias unchanged, langcode unchanged,
     computed metatags reflect the change, and the other translation was not touched.
  4. If any post-check fails, immediately PATCH the old value back and stop.
Credentials are injected by the network proxy; this script never handles them.
Usage: execute.py <plan.json> [--only N] [--dry-run]
"""
import json, subprocess, sys, time, datetime, os

BASE = 'https://haiershop.uz'
LOG = os.path.join(os.path.dirname(__file__), 'changes.jsonl')


def call(method, url, body=None):
    cmd = ['curl', '-sS', '-o', '/dev/stdout', '-w', '\n%{http_code}', '-X', method,
           '-H', 'Accept: application/vnd.api+json']
    if body is not None:
        cmd += ['-H', 'Content-Type: application/vnd.api+json', '--data-binary', '@-']
    cmd.append(url)
    r = subprocess.run(cmd, input=(json.dumps(body, ensure_ascii=False).encode() if body is not None else None),
                       capture_output=True)
    out = r.stdout.decode('utf-8', 'replace')
    text, _, code = out.rpartition('\n')
    return int(code or 0), text


def get(lang, typ, uid):
    et, b = typ.split('--')
    code, text = call('GET', f'{BASE}/{lang}/jsonapi/{et}/{b}/{uid}?cache_bust={int(time.time()*1000)}')
    if code != 200:
        raise RuntimeError(f'GET {lang} {typ} {uid} -> {code}: {text[:300]}')
    return json.loads(text)['data']


def patch(lang, typ, uid, field, value):
    et, b = typ.split('--')
    body = {'data': {'type': typ, 'id': uid, 'attributes': {field: value}}}
    return call('PATCH', f'{BASE}/{lang}/jsonapi/{et}/{b}/{uid}', body)


def computed(attrs, name=None, rel=None):
    for m in attrs.get('metatag') or []:
        a = m.get('attributes', {})
        if name and a.get('name') == name:
            return a.get('content')
        if rel and a.get('rel') == rel:
            return a.get('href')
    return None


def log(rec):
    rec['ts'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with open(LOG, 'a') as f:
        f.write(json.dumps(rec, ensure_ascii=False) + '\n')


def main():
    plan = json.load(open(sys.argv[1]))
    only = int(sys.argv[sys.argv.index('--only') + 1]) if '--only' in sys.argv else None
    dry = '--dry-run' in sys.argv
    for i, p in enumerate(plan):
        if only is not None and i != only:
            continue
        lang, typ, uid = p['key'].split('|')
        field = p['field']
        other = 'uz' if lang == 'ru' else 'ru'
        print(f'\n[{i}] {lang} {p["alias"]} :: {field} :: keys {p["changed_keys"]}')
        cur = get(lang, typ, uid)['attributes']
        assert cur.get(field) == p['old'], 'ABORT: field changed since snapshot'
        if p.get('expected_changed') is not None:
            assert cur.get('changed') == p['expected_changed'], f'ABORT: entity edited since snapshot ({cur.get("changed")})'
        assert cur['path']['alias'] == p['alias'], 'ABORT: alias differs from snapshot'
        try:
            other_before = get(other, typ, uid)['attributes']
        except Exception:
            other_before = None
        if dry:
            print('  dry-run OK: preconditions hold; nothing sent')
            continue
        code, text = patch(lang, typ, uid, field, p['new'])
        print(f'  PATCH -> HTTP {code}')
        ok, problems = (code == 200), []
        if code != 200:
            problems.append(f'PATCH failed: {text[:300]}')
        time.sleep(1.5)
        after = get(lang, typ, uid)['attributes']
        is_json = field in ('field_meta_tegi', 'field_meta')
        stored_ok = (json.loads(after.get(field) or '{}') == json.loads(p['new'])) if is_json else (after.get(field) == p['new'])
        if not stored_ok:
            problems.append('stored value differs from planned value')
        if after['path']['alias'] != p['alias']:
            problems.append(f'ALIAS CHANGED: {after["path"]["alias"]}')
        if after.get('langcode') != lang:
            problems.append('langcode changed')
        newj = json.loads(p['new']) if is_json else {}
        if 'robots' in p['changed_keys']:
            exp_robots = newj.get('robots')
            got = computed(after, name='robots')
            if exp_robots and got != exp_robots:
                problems.append(f'computed robots {got!r} != {exp_robots!r}')
            if not exp_robots and got and 'unavailable_after' in got:
                problems.append(f'computed robots still {got!r}')
        if 'description' in p['changed_keys'] and computed(after, name='description') != newj.get('description'):
            problems.append('computed description not updated')
        if 'canonical_url' in p['changed_keys']:
            can = computed(after, rel='canonical')
            if can and can.rstrip('/').endswith('/ru/sertifikaty-i-garantiya'):
                problems.append(f'computed canonical still {can}')
        if other_before is not None:
            other_after = get(other, typ, uid)['attributes']
            if other_after.get(field) != other_before.get(field):
                problems.append(f'OTHER TRANSLATION ({other}) {field} changed unexpectedly')
            if other_after['path']['alias'] != other_before['path']['alias']:
                problems.append(f'OTHER TRANSLATION ({other}) alias changed')
        rec = {'i': i, 'key': p['key'], 'alias': p['alias'], 'field': field, 'changed_keys': p['changed_keys'],
               'http': code, 'problems': problems, 'changed_after': after.get('changed'),
               'computed_robots': computed(after, name='robots'), 'computed_canonical': computed(after, rel='canonical')}
        if problems:
            print('  PROBLEMS:', problems)
            rc, rt = patch(lang, typ, uid, field, p['old'])
            back = get(lang, typ, uid)['attributes']
            rec['rollback_http'] = rc
            rec['rollback_ok'] = back.get(field) == p['old'] or (is_json and json.loads(back.get(field) or '{}') == json.loads(p['old'] or '{}'))
            print(f'  ROLLBACK -> HTTP {rc}, restored={rec["rollback_ok"]}')
            log(rec)
            sys.exit(2)
        print(f'  OK: computed robots={rec["computed_robots"]!r} canonical={rec["computed_canonical"]!r} alias unchanged')
        log(rec)
        time.sleep(2)


if __name__ == '__main__':
    main()
