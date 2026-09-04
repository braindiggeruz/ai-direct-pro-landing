#!/usr/bin/env python3
"""Audit silent catch blocks across the codebase.

Finds patterns that swallow an error without leaving any trace:
  - `catch {}` / `catch (e) {}` with an empty body
  - `catch (e) { ... }` with no logging call inside
  - `.catch(() => undefined)` and friends

NOT reported (these are deliberate and fine):
  - `.catch(swallow('scope'))` — logs via lib/observability.ts
  - `.catch(() => undefined)` attached to `reader.cancel()` / `body.cancel()`
    / `abort()` / `audioContext.close()`: releasing an already-released stream,
    aborting on purpose and closing a closed audio context all throw by design,
    so logging them is pure noise.
  - `scripts/analytics-metrika.ts` and `scripts/analytics-snippet.ts`: injected
    browser snippets. Yandex Metrika is legitimately absent (blocked, not
    loaded yet, privacy mode) on a large share of pageviews; logging there
    writes to *the visitor's* console and cannot reach `wrangler tail`.

Skipped trees:
  - `gptbot-audit/**` — a frozen copy of the whole project from 2026-07-15
    (1224 tracked files, nested inside itself). It is eslint-ignored, nothing
    imports it and Pages deploys only the root `functions/`, so it is dead
    weight: auditing it produced 112 findings that describe no running code.

Severity is heuristic, from the file path:
  CRITICAL  API endpoints, auth, payments
  HIGH      core libraries, database, external integrations
  MEDIUM    admin, analytics, agents
  LOW       UI components, tests

Exit status: 1 if any CRITICAL/HIGH finding, so CI can gate on it.
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

# (pattern, label) — note the order: regex first.
SILENT_PATTERNS: list[tuple[str, str]] = [
    (r"catch\s*\{\s*\}", "catch_no_binding"),
    (r"catch\s*\([^)]*\)\s*\{\s*\}", "catch_empty_body"),
    (r"\.catch\s*\(\s*\(\s*\)\s*=>\s*undefined\s*\)", "catch_undefined"),
    (r"\.catch\s*\(\s*\(\s*\)\s*=>\s*['\"]\s*['\"]\s*\)", "catch_empty_string"),
    (r"\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)", "catch_empty_object"),
    (r"\.catch\s*\(\s*\(\s*\)\s*=>\s*(?:null|false|0)\s*\)", "catch_falsy"),
]

# `catch (e) { <single line, no logging> }` — genuinely suspicious, but only
# when the whole block is on one line so nested braces cannot confuse us.
CATCH_NO_LOG = re.compile(
    r"catch\s*\(\s*\w+\s*\)\s*\{([^{}\n]*)\}", re.MULTILINE
)

# These throw by design on a healthy path: releasing an already-released
# stream, aborting on purpose, closing an already-closed audio context.
DESIGNED_THROW = re.compile(
    r"reader\.cancel\(|\.body\.cancel\(|aborted\.catch\(|\.abort\(\)\.catch\("
    r"|audioContext\??\.close\(\)"
)

# `.catch(() => null)` is idiomatic for "unparseable body" — the caller then
# validates the null and answers 400. That is a handled path, not a swallowed
# error, so only report it when the result is never checked.
CONST_ASSIGN = re.compile(r"(?:const|let|var)\s+(\w+)\s*=")
LOOKAHEAD_LINES = 12

# `.catch(() => null)` is idiomatic for "unparseable request body": the caller
# validates the null and answers 400. That is a handled path, not a swallowed
# error. Only these call shapes get that benefit of the doubt — a D1 or service
# read that degrades to null is a silent failure even when the null is later
# consumed, because "row missing" and "database down" become indistinguishable.
BODY_PARSE = re.compile(
    r"request\.json\(|readOwnerBody\(|readMarketJson\(|readJson\(|readBody\("
    r"|\.json\(\s*\)|\.text\(\s*\)|\.formData\(\s*\)|new Request\("
)

SEVERITY_RULES: list[tuple[str, str]] = [
    (r"functions/api/", "CRITICAL"),
    (r"functions/lib/(jwt|password|lockout|turnstile)", "CRITICAL"),
    (r"functions/lib/(seo-autopilot|ai-drafts|indexnow|llm)", "HIGH"),
    (r"functions/lib/yandex", "HIGH"),
    (r"functions/lib/telegram", "HIGH"),
    (r"functions/lib/api-errors", "HIGH"),
    (r"functions/lib/(intent-guard|circuit-breaker|search-pulse)", "HIGH"),
    (r"functions/platform/lead-radar", "HIGH"),
    (r"functions/market/", "HIGH"),
    (r"functions/channels/", "HIGH"),
    (r"^src/admin", "MEDIUM"),
    (r"^src/components", "LOW"),
    (r"^src/lib", "MEDIUM"),
    (r"^agents/", "MEDIUM"),
    (r"^tests?/", "LOW"),
]

SKIP_DIRS = {"node_modules", ".wrangler", "dist", "build", ".git", "gptbot-audit"}

# Client-side snippets injected into the page. See the module docstring: their
# console is the visitor's console, not `wrangler tail`.
SKIP_FILES = {"analytics-metrika.ts", "analytics-snippet.ts"}


def get_severity(rel_path: str, root_name: str) -> str:
    """Match severity rules against a repo-root-relative-ish path.

    Two shapes have to work, because the rules are written both ways:
      - run from the repo root  -> `functions/api/x.ts`, `tests/x.ts`
      - run from a subdirectory -> `api/x.ts`                (root `functions`)

    The `^`-anchored rules (`^tests?/`) only match the first shape, the
    `functions/`-prefixed rules only match the second. Trying both candidates
    keeps the anchors honest: without this, a root-level run classified every
    test as MEDIUM, which is one severity away from a CI gate that never fires.
    """
    candidates = [rel_path]
    if not rel_path.startswith(root_name + "/"):
        candidates.append(f"{root_name}/{rel_path}")
    for pattern, sev in SEVERITY_RULES:
        for candidate in candidates:
            if re.search(pattern, candidate):
                return sev
    return "MEDIUM"


def optional_null_is_handled(lines: list[str], lineno: int) -> bool:
    """True when a `.catch(() => null)` sits on a request-body parse.

    `const body = await request.json().catch(() => null); if (!body) return 400`
    is a handled malformed-request path, not a swallowed error. Reporting it
    would bury the findings that matter.

    Deliberately narrow: only body-parsing calls qualify. A D1 or service read
    that degrades to null is still reported even when the null is subsequently
    consumed, because consuming it cannot tell "row missing" from "database
    down" — which is exactly the blindness this audit exists to find.
    """
    lo = max(0, lineno - 1 - 6)
    # The statement may open several lines above the `.catch(` that closes it.
    statement = "\n".join(lines[lo:lineno])
    return bool(BODY_PARSE.search(statement))


def has_logging(text: str) -> bool:
    return bool(
        re.search(
            r"console\.(error|warn|info|log)|logger\.|reportError\(|swallow\(",
            text,
        )
    )


def find_silent_catches(root: Path) -> dict[str, list[dict]]:
    results: dict[str, list[dict]] = defaultdict(list)
    for path in root.rglob("*.ts"):
        if SKIP_DIRS & set(path.parts):
            continue
        if path.name in SKIP_FILES:
            continue
        rel = path.relative_to(root).as_posix()
        text = path.read_text(encoding="utf-8", errors="replace")
        lines = text.split("\n")
        severity = get_severity(rel, root.name)

        for pattern, label in SILENT_PATTERNS:
            for match in re.finditer(pattern, text):
                lineno = text[: match.start()].count("\n") + 1
                line = lines[lineno - 1] if lineno <= len(lines) else ""
                if DESIGNED_THROW.search(line):
                    continue
                if has_logging(line):
                    continue
                # Skip prose: docs and comments quote the pattern on purpose.
                if line.lstrip().startswith(("//", "*", "/*")):
                    continue
                if (
                    label in ("catch_falsy", "catch_empty_string")
                    and optional_null_is_handled(lines, lineno)
                ):
                    continue
                results[severity].append(
                    {"file": rel, "line": lineno, "pattern": label, "context": line.strip()[:90]}
                )

        for match in CATCH_NO_LOG.finditer(text):
            body = match.group(1)
            if not body.strip() or has_logging(body):
                continue
            # A catch that rethrows (often re-wrapped, e.g.
            # `throw classifyRequestFailure(e)`) is handling the error, not
            # swallowing it — the log happens at the boundary that catches it.
            if re.search(r"\bthrow\b", body):
                continue
            lineno = text[: match.start()].count("\n") + 1
            line = lines[lineno - 1] if lineno <= len(lines) else ""
            results[severity].append(
                {
                    "file": rel,
                    "line": lineno,
                    "pattern": "catch_no_log",
                    "context": line.strip()[:90],
                }
            )

    return results


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    results = find_silent_catches(root)

    total = 0
    gating = 0
    for sev in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
        items = sorted(results.get(sev, []), key=lambda x: (x["file"], x["line"]))
        total += len(items)
        if sev in ("CRITICAL", "HIGH"):
            gating += len(items)
        print(f"\n=== {sev}: {len(items)} ===")
        for item in items[:25]:
            print(f"  {item['file']}:{item['line']}  [{item['pattern']}]")
            if item["context"]:
                print(f"      {item['context']}")
        if len(items) > 25:
            print(f"  ... and {len(items) - 25} more")

    print(f"\nTotal silent catches: {total}")
    print(f"Gating (CRITICAL+HIGH): {gating}")
    return 1 if gating else 0


if __name__ == "__main__":
    sys.exit(main())
