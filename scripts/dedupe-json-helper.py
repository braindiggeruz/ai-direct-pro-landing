#!/usr/bin/env python3
"""Заменить локальные `json()`-клоны в functions/ на общий `jsonResponse()`.

Трогает только клоны, тождественные эталону из `functions/lib/api-errors.ts`.
Проверка тождества **импортируется** из scripts/verify-json-clones.py, а не
копируется: клон из трёх файлов отличается по поведению (нет
`Cache-Control: no-store`, у login.ts ещё и без charset), и слепая замена
изменила бы кеширование прода — это уже не рефакторинг, а правка поведения.

Что делает с каждым файлом:
  1. вырезает определение `function json(...) { ... }`;
  2. добавляет `jsonResponse` в существующий импорт из `lib/api-errors`
     или создаёт новый;
  3. заменяет вызовы `json(` на `jsonResponse(`.

Идемпотентен: повторный запуск ничего не меняет.
"""

from __future__ import annotations

import argparse
import importlib.util
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "functions"
SPECIFIER_SUFFIX = "lib/api-errors"


def _load_verifier():
    spec = importlib.util.spec_from_file_location(
        "verify_json_clones", Path(__file__).with_name("verify-json-clones.py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_VERIFIER = _load_verifier()

# Регулярка определения импортируется из верификатора, чтобы мигратор и
# проверка никогда не разошлись в том, что считать клоном.
CLONE_DEF_RE = _VERIFIER.CLONE_RE
# ВАЖНО: lookbehind `[\w.$]` обязателен. Без него `\bjson\(` совпадает и с
# `request.json()` / `res.json()` — а это метод чтения тела запроса, а не наш
# хелпер ответа. Один такой прогон превратил `await request.json()` в
# `await request.jsonResponse()` в 18 файлах, и это не поймал tsc, потому что
# tsconfig.functions.json не был подключён к сборке. Не повторять.
CALL_RE = re.compile(r"(?<![\w.$])json\s*\(")
IMPORT_RE = re.compile(
    r"^import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'([^']*"
    + re.escape(SPECIFIER_SUFFIX)
    + r")';\s*$",
    re.MULTILINE,
)
LAST_IMPORT_RE = re.compile(r"^import\s[^\n]*;\s*$", re.MULTILINE)


def specifier_for(path: Path) -> str:
    depth = len(path.parent.relative_to(ROOT).parts)
    return "../" * depth + SPECIFIER_SUFFIX


def add_json_response_import(src: str, specifier: str) -> str:
    """Добавить jsonResponse в импорт из lib/api-errors или создать новый."""
    match = IMPORT_RE.search(src)
    if match:
        names = [n.strip() for n in match.group(1).split(",") if n.strip()]
        if "jsonResponse" in names:
            return src
        names.append("jsonResponse")
        line = f"import {{ {', '.join(names)} }} from '{match.group(2)}';"
        return src[: match.start()] + line + src[match.end():]

    # Нет импорта из lib/api-errors — вставляем после последнего import'а,
    # чтобы не ломать "use"-подобные директивы в начале файла.
    imports = list(LAST_IMPORT_RE.finditer(src))
    line = f"import {{ jsonResponse }} from '{specifier}';\n"
    if imports:
        last = imports[-1]
        return src[: last.end()] + "\n" + line + src[last.end():]
    return line + "\n" + src


def process(path: Path) -> tuple[int, int] | None:
    src = path.read_text(encoding="utf-8", errors="replace")
    if not CLONE_DEF_RE.search(src):
        return None

    definitions = len(CLONE_DEF_RE.findall(src))
    src = CLONE_DEF_RE.sub("\n", src)
    calls = len(CALL_RE.findall(src))
    src = CALL_RE.sub("jsonResponse(", src)
    src = add_json_response_import(src, specifier_for(path))
    src = re.sub(r"\n{3,}", "\n\n", src)

    # Стоп-кран: если подстановка задела чей-то метод вида `request.json()`,
    # файл не пишем вообще. Ошибка в регексе — не повод ломать 30 файлов.
    if ".jsonResponse(" in src:
        raise RuntimeError(
            f"{path.as_posix()}: подстановка задела метод объекта (.jsonResponse) — файл НЕ записан"
        )

    path.write_text(src, encoding="utf-8", newline="\n")
    return definitions, calls


def same_clone_paths() -> set[str]:
    """Файлы, чей клон тождественен эталону. Остальные не трогаем вообще."""
    same, _different = _VERIFIER.classify(ROOT)
    return {rel for rel in same}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="писать файлы (по умолчанию dry-run)")
    args = parser.parse_args()

    allowed = same_clone_paths()
    total_defs = total_calls = 0
    skipped: list[str] = []

    for path in sorted(ROOT.rglob("*.ts")):
        if "node_modules" in path.parts:
            continue
        rel = path.relative_to(ROOT.parent).as_posix()
        if not CLONE_DEF_RE.search(path.read_text(encoding="utf-8", errors="replace")):
            continue
        if rel not in allowed:
            skipped.append(rel)
            continue
        result = process(path) if args.apply else process_dry(path)
        if not result:
            continue
        defs, calls = result
        total_defs += defs
        total_calls += calls
        print(f"  -{defs} def  ~{calls} calls  {rel}")

    for rel in skipped:
        print(f"  ПРОПУЩЕН (поведение отличается): {rel}")

    verb = "изменено" if args.apply else "найдено"
    print(f"\n{verb}: определений {total_defs}, вызовов {total_calls}")
    print(f"пропущено: {len(skipped)}")
    return 0


def process_dry(path: Path) -> tuple[int, int] | None:
    src = path.read_text(encoding="utf-8", errors="replace")
    if not CLONE_DEF_RE.search(src):
        return None
    return len(CLONE_DEF_RE.findall(src)), len(CALL_RE.findall(src))


if __name__ == "__main__":
    sys.exit(main())
