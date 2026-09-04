#!/usr/bin/env python3
"""Проверить, что все локальные `json()`-клоны в functions/ тождественны эталону.

Эталон — `jsonResponse()` из functions/lib/api-errors.ts:

    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    })

Смысл проверки: рефактор «удалить 41 клон, импортировать эталон» безопасен
ровно настолько, насколько клоны ведут себя одинаково. Если хоть один клон
отличается (другой Content-Type, нет no-store, есть CORS-заголовок) — слепая
замена изменит поведение прода, и такие файлы надо трогать руками.

Клон считается тождественным по нормализованному тексту: из тела выкидываются
пробелы/переносы, кавычки приводятся к одинарным.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "functions"

# Имя первого параметра произвольное: в трёх файлах он называется `d`, а не
# `data`. Регулярка на `data:` пропустила бы их, и клоны остались бы жить.
CLONE_RE = re.compile(
    r"function json\s*\(\s*(?P<param>\w+)\s*:\s*unknown\s*,\s*status\s*=\s*200\s*\)\s*:\s*Response\s*\{(?P<body>.*?)\n\}",
    re.DOTALL,
)

CANONICAL = (
    "return new Response(JSON.stringify(data),{status,"
    "headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},});"
)


def normalize(text: str, param: str = "data") -> str:
    # Имя параметра приводим к эталонному `data`, иначе клон с `d` всегда
    # «отличается» — при том что ведёт себя точно так же.
    text = re.sub(rf"\b{re.escape(param)}\b", "data", text)
    text = text.replace('"', "'")
    text = re.sub(r"\s+", "", text)
    # Висячая запятая — чистый formatting: `'no-store',}` и `},}` означают
    # одно и то же. Без этого правила четыре файла ложатся в «отличающиеся»
    # только из-за переноса строк.
    return re.sub(r",(?=[}\])])", "", text)


def classify(root: Path = ROOT) -> tuple[list[str], list[tuple[str, str]]]:
    """Разложить клоны на тождественные эталону и отличающиеся.

    Возвращает пути относительно родителя functions/ (то есть `functions/...`),
    чтобы результат можно было использовать как фильтр для мигратора.
    """
    canonical = normalize(CANONICAL)
    same: list[str] = []
    different: list[tuple[str, str]] = []

    for path in sorted(root.rglob("*.ts")):
        if "node_modules" in path.parts:
            continue
        src = path.read_text(encoding="utf-8", errors="replace")
        for match in CLONE_RE.finditer(src):
            rel = path.relative_to(root.parent).as_posix()
            line = src[: match.start()].count("\n") + 1
            if normalize(match.group("body"), match.group("param")) == canonical:
                same.append(rel)
            else:
                different.append((f"{rel}:{line}", match.group("body").strip()))

    return same, different


def main() -> int:
    same, different = classify()
    print(f"Клонов, тождественных эталону: {len(same)}")
    print(f"Отличающихся: {len(different)}")
    for where, body in different:
        print(f"\n--- {where}\n{body}")

    return 1 if different else 0


if __name__ == "__main__":
    sys.exit(main())
