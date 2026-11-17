# Rebuilds the two ready config patches of docs/paid-chat/patches (runbook MODEL-CLIFF-1712-RU.md) on top of a later
# commit. Each patch was cut from BASE and holds whole packed-JSON lines of wrangler.toml, so any later change of the
# packed config makes it stop applying. This carries the patch's own change over, key by key for the packed lines and
# by a three-way merge for everything else, and proves the result (it does not run the tests the runbook lists): the new patch applies to the target alone and after
# the other patch, and changes exactly the keys the old one changed, to the same values.
#
# usage (from the site worktree; nothing in the worktree is written):
#   python scripts/paid-chat/regen-cliff-patches.py <target commit> <work dir outside any repository> <base commit>
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

target, work = sys.argv[1], pathlib.Path(sys.argv[2])
base_ref = sys.argv[3]  # the commit the committed patches apply to (docs/paid-chat/MODEL-CLIFF-1712-RU.md, section 4, names it)
ALL = ['docs/paid-chat/patches/2026-12-17-zai-prepaid-off.patch', 'docs/paid-chat/patches/2026-12-17-studio-fallback-on.patch']
# ONLY=<substring> rebuilds one of them (a patch whose test hunk conflicts has to be merged by hand).
PATCHES = [path for path in ALL if os.environ.get('ONLY', '') in path]
PACKED = re.compile(r"^((?:GPTBOT|STUDIO)_RUNTIME_CONFIG_JSON)\s*=\s*'''(.+)'''$")


def git(*args, cwd=None, check=True, data=None):
    # A command run inside the work dir must not find a repository above it: inside one, `git apply` silently
    # skips every path outside the current subdirectory and still exits 0.
    env = dict(os.environ)
    if cwd is not None:
        env['GIT_CEILING_DIRECTORIES'] = str(work.resolve().parent).replace('\\', '/')
        probe = subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=cwd, env=env, capture_output=True)
        if probe.returncode == 0:
            raise SystemExit(f'{cwd} is inside a git repository ({probe.stdout.decode().strip()}): use a work dir outside any repository')
    # No line-ending conversion anywhere: the trees are compared byte for byte (a global core.autocrlf would make
    # `git apply` write CRLF into a plain directory, and every line would then differ).
    done = subprocess.run(['git', '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', *args], cwd=cwd, input=data, capture_output=True, env=env)
    if check and done.returncode:
        raise SystemExit(f"git {' '.join(args)}: {done.stderr.decode('utf-8', 'replace')[:600]}")
    return done


def show(ref, path):
    return git('show', f'{ref}:{path}').stdout  # bytes, as stored (LF)


def files_of(patch_text):
    return re.findall(r'^diff --git a/(\S+) b/', patch_text, re.M)


def tree(name, ref, paths):
    root = work / name
    if root.exists():
        shutil.rmtree(root)
    for path in paths:
        (root / path).parent.mkdir(parents=True, exist_ok=True)
        (root / path).write_bytes(show(ref, path))
    return root


def packed_lines(text):
    """{name: (line index, parsed json)} of the packed config lines of a wrangler.toml."""
    out = {}
    for i, line in enumerate(text.split('\n')):
        m = PACKED.match(line)
        if m:
            out[m.group(1)] = (i, json.loads(m.group(2)))
    return out


def merge_wrangler(base, ours, theirs, report):
    """Three-way merge of wrangler.toml with the packed JSON lines merged key by key."""
    b, o, t = packed_lines(base), packed_lines(ours), packed_lines(theirs)
    merged_json = {}
    for name in o:
        result = dict(o[name][1])
        changed = {}
        for key in set(b[name][1]) | set(t[name][1]):
            was, now = b[name][1].get(key), t[name][1].get(key)
            if was != now:
                if o[name][1].get(key) != was:
                    raise SystemExit(f'{name}.{key}: changed since {base_ref} on both sides ({was!r} -> ours {o[name][1].get(key)!r}, patch {now!r})')
                if now is None:
                    result.pop(key, None)
                else:
                    result[key] = now
                changed[key] = now
        assert list(k for k in result) == [k for k in o[name][1] if k in result] or changed, name
        merged_json[name] = result
        report[name] = changed

    def masked(text, table):
        lines = text.split('\n')
        for name, (i, _) in table.items():
            lines[i] = f"{name} = '''<packed>'''"
        return '\n'.join(lines)

    tmp = work / 'merge-tmp'
    tmp.mkdir(parents=True, exist_ok=True)
    for label, text, table in (('base', base, b), ('ours', ours, o), ('theirs', theirs, t)):
        (tmp / label).write_bytes(masked(text, table).encode('utf-8'))
    done = git('merge-file', '-p', 'ours', 'base', 'theirs', cwd=tmp, check=False)
    if done.returncode:
        raise SystemExit(f'wrangler.toml: {done.returncode} conflict(s) outside the packed lines')
    lines = done.stdout.decode('utf-8').split('\n')
    for name, value in merged_json.items():
        at = [i for i, line in enumerate(lines) if line == f"{name} = '''<packed>'''"]
        assert len(at) == 1, (name, at)
        body = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        assert len(body.encode('utf-8')) <= 5120, f'{name}: over the 5 KiB cap of a Pages text variable'
        lines[at[0]] = f"{name} = '''{body}'''"
    return '\n'.join(lines)


def merge_plain(path, base, ours, theirs):
    tmp = work / 'merge-tmp'
    tmp.mkdir(parents=True, exist_ok=True)
    for label, data in (('base', base), ('ours', ours), ('theirs', theirs)):
        (tmp / label).write_bytes(data)
    done = git('merge-file', '-p', 'ours', 'base', 'theirs', cwd=tmp, check=False)
    if done.returncode:
        raise SystemExit(f'{path}: {done.returncode} conflict(s); merge it by hand')
    return done.stdout


work.mkdir(parents=True, exist_ok=True)
summary = {'target': git('rev-parse', target).stdout.decode().strip(), 'base': git('rev-parse', base_ref).stdout.decode().strip(), 'patches': {}}
new_patches = {}
for patch_path in PATCHES:
    name = pathlib.Path(patch_path).name
    old_patch = show(target, patch_path)
    paths = files_of(old_patch.decode('utf-8'))
    base_tree = tree(f'{name}.base', base_ref, paths)
    theirs_tree = tree(f'{name}.theirs', base_ref, paths)
    (work / f'{name}.old').write_bytes(old_patch)
    applied = git('apply', str((work / f'{name}.old').resolve()), cwd=theirs_tree, check=False)
    if applied.returncode:
        raise SystemExit(f'{name} does not apply to its base {base_ref}: {applied.stderr.decode()[:300]}')
    if all((theirs_tree / path).read_bytes() == (base_tree / path).read_bytes() for path in paths):
        raise SystemExit(f'{name}: applying it changed nothing; the work dir is not a plain directory')
    still = git('apply', '--check', str((work / f'{name}.old').resolve()), cwd=tree(f'{name}.probe', target, paths), check=False).returncode == 0
    a, b = work / name / 'a', work / name / 'b'
    for root in (a, b):
        if root.exists():
            shutil.rmtree(root)
    report = {}
    for path in paths:
        base, ours, theirs = (base_tree / path).read_bytes(), show(target, path), (theirs_tree / path).read_bytes()
        if path == 'wrangler.toml':
            merged = merge_wrangler(base.decode('utf-8'), ours.decode('utf-8'), theirs.decode('utf-8'), report).encode('utf-8')
        else:
            merged = merge_plain(path, base, ours, theirs)
        for root, data in ((a, ours), (b, merged)):
            (root / path).parent.mkdir(parents=True, exist_ok=True)
            (root / path).write_bytes(data)
    diff = git('diff', '--no-index', '--no-prefix', 'a', 'b', cwd=work / name, check=False)
    if diff.returncode not in (0, 1):
        raise SystemExit(diff.stderr.decode()[:300])
    new_patches[name] = diff.stdout
    (work / f'{name}.new').write_bytes(diff.stdout)
    # What the old patch changed against its base, and what the new one changes against the target: line counts per file.
    def stat(patch):
        text = patch.decode('utf-8')
        return {path: (len(re.findall(r'^\+(?!\+\+)', part, re.M)), len(re.findall(r'^-(?!--)', part, re.M)))
                for path, part in zip(files_of(text), re.split(r'^diff --git ', text, flags=re.M)[1:])}
    summary['patches'][name] = {'files': paths, 'oldAppliesToTarget': still, 'packedKeysChanged': report, 'linesOld': stat(old_patch), 'linesNew': stat(diff.stdout)}

# Proof: each new patch applies to the target alone and after the other one, and alone it gives exactly the merged files.
all_paths = sorted({path for patch in PATCHES for path in files_of(show(target, patch).decode('utf-8'))})
names = list(new_patches)
for order in (names, names[::-1]):
    probe = tree('probe-together', target, all_paths)
    for name in order:
        done = git('apply', str((work / f'{name}.new').resolve()), cwd=probe, check=False)
        if done.returncode:
            raise SystemExit(f'{name} does not apply in the order {order}: {done.stderr.decode()[:300]}')
summary['applyTogetherBothOrders'] = True
for name in names:
    probe = tree('probe-alone', target, files_of(new_patches[name].decode('utf-8')))
    git('apply', str((work / f'{name}.new').resolve()), cwd=probe)
    for path in files_of(new_patches[name].decode('utf-8')):
        assert (probe / path).read_bytes() == (work / name / 'b' / path).read_bytes(), (name, path)
summary['applyAloneEqualsMerged'] = True
(work / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=1))
