#!/usr/bin/env python3
"""
Replace silent `.catch(<no-op>)` handlers with `.catch(swallow('<scope>'))`
across `functions/`, adding the import where missing.

Handles every no-op flavour seen in this codebase:
    .catch(() => undefined)   ->  .catch(swallow('scope'))
    .catch(() => null)        ->  .catch(swallow('scope', null))
    .catch(() => false)       ->  .catch(swallow('scope', false))
    .catch(() => 0)           ->  .catch(swallow('scope', 0))
    .catch(() => '')          ->  .catch(swallow('scope', ''))

Skips the same cases `scripts/audit-catch-blocks.py` skips, so the two agree:
  - `reader.cancel()` / `body.cancel()` — cancelling an already-released
    stream throws by design; logging it is pure noise.
  - `.catch(() => null)` on a request-body parse (`request.json()`,
    `readOwnerBody()`, ...) — the caller validates the null and answers 400.
  - comment and doc lines that merely quote the pattern.
  - `lib/observability.ts` itself, and `*.test.ts`.

Idempotent: a line that already calls `swallow(` is left alone.

The skip rules are *imported* from `scripts/audit-catch-blocks.py` rather than
copied. They were copied once, drifted, and the drift made the two tools
disagree about what a silent catch is — which is how an audit that reports 112
findings and an applier that instruments 74 can both be telling the truth.
"""
from __future__ import annotations

import importlib.util
import os
import re
import sys
from pathlib import Path

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "functions")


def _load_audit_rules():
    """Load the audit module as the single source of truth for skip rules."""
    spec = importlib.util.spec_from_file_location(
        "audit_catch_blocks", Path(__file__).with_name("audit-catch-blocks.py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_AUDIT = _load_audit_rules()

# (regex, replacement-fallback or None for "no argument")
VARIANTS: list[tuple[str, str | None]] = [
    (r"\.catch\s*\(\s*\(\s*\)\s*=>\s*undefined\s*\)", None),
    (r"\.catch\s*\(\s*\(\s*\)\s*=>\s*null\s*\)", "null"),
    (r"\.catch\s*\(\s*\(\s*\)\s*=>\s*false\s*\)", "false"),
    (r"\.catch\s*\(\s*\(\s*\)\s*=>\s*true\s*\)", "true"),
    (r"\.catch\s*\(\s*\(\s*\)\s*=>\s*0\s*\)", "0"),
    (r"\.catch\s*\(\s*\(\s*\)\s*=>\s*''\s*\)", "''"),
    (r'\.catch\s*\(\s*\(\s*\)\s*=>\s*""\s*\)', "''"),
]

# Imported from the audit: what counts as "throws by design", what counts as a
# handled body-parse null, and which trees/files are not live code.
DESIGNED_THROW = _AUDIT.DESIGNED_THROW
BODY_PARSE = _AUDIT.BODY_PARSE
SKIP_DIRS = _AUDIT.SKIP_DIRS
SKIP_FILES = _AUDIT.SKIP_FILES


def scope_for(rel_path: str) -> str:
    """`lib/llm/usage-store.ts` -> `llm-usage-store`."""
    parts = rel_path.replace("\\", "/").split("/")
    parts[-1] = os.path.splitext(parts[-1])[0]
    # Drop structural prefixes that carry no diagnostic signal.
    while parts and parts[0] in {"api", "lib", "admin"}:
        parts.pop(0)
    # Drop `[id]` route segments: path parameters are not identity.
    parts = [p for p in parts if not (p.startswith("[") and p.endswith("]"))]
    return "-".join(parts) or "unknown"


def import_path_for(rel_path: str) -> str:
    rel_dir = os.path.dirname(rel_path.replace("\\", "/"))
    depth = len([p for p in rel_dir.split("/") if p]) if rel_dir else 0
    return f"{'../' * depth if depth else './'}lib/observability"


IMPORT_RE = re.compile(r"^import\s.*?;\s*$", re.MULTILINE | re.DOTALL)


def insert_import(src: str, specifier: str) -> str:
    if f"from '{specifier}'" in src or f'from "{specifier}"' in src:
        return src
    line = f"import {{ swallow }} from '{specifier}';\n"
    matches = list(IMPORT_RE.finditer(src))
    if matches:
        last = matches[-1]
        return src[: last.end()] + "\n" + line + src[last.end():]
    return line + "\n" + src


def process(path: str, rel: str) -> int:
    with open(path, encoding="utf-8") as fh:
        src = fh.read()
    if not any(re.search(p, src) for p, _ in VARIANTS):
        return 0

    scope = scope_for(rel)
    lines = src.split("\n")
    count = 0

    for index, line in enumerate(lines):
        if "swallow(" in line:
            continue
        if line.lstrip().startswith(("//", "*", "/*")):
            continue
        if DESIGNED_THROW.search(line):
            continue
        # A `.catch(` can close a statement opened several lines above.
        statement = "\n".join(lines[max(0, index - 6): index + 1])
        for pattern, fallback in VARIANTS:
            if not re.search(pattern, line):
                continue
            if fallback is not None and BODY_PARSE.search(statement):
                continue
            arg = "" if fallback is None else f", {fallback}"
            lines[index] = re.sub(pattern, f".catch(swallow('{scope}'{arg}))", line)
            count += 1
            break

    if count == 0:
        return 0
    new_src = insert_import("\n".join(lines), import_path_for(rel))
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(new_src)
    return count


def main() -> int:
    changed: list[tuple[str, int]] = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in sorted(filenames):
            if not name.endswith(".ts") or name.endswith(".test.ts"):
                continue
            if name in SKIP_FILES:
                continue
            rel = os.path.relpath(os.path.join(dirpath, name), ROOT).replace("\\", "/")
            if rel == "lib/observability.ts":
                continue
            n = process(os.path.join(dirpath, name), rel)
            if n:
                changed.append((rel, n))
    for rel, count in sorted(changed):
        print(f"  {count:>3}  {rel}")
    print(f"\n{len(changed)} files, {sum(c for _, c in changed)} catch blocks instrumented")
    return 0


if __name__ == "__main__":
    sys.exit(main())
