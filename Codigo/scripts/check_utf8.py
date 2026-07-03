#!/usr/bin/env python3
from __future__ import annotations

import codecs
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

IGNORED_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".next",
    ".venv",
    "venv",
    "__pycache__",
}

TEXT_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx",
    ".json", ".md", ".yml", ".yaml",
    ".toml", ".ini", ".env", ".sh",
    ".sql", ".html", ".css", ".scss",
    ".txt", ".csv",
}

TEXT_FILENAMES = {
    "Dockerfile",
    "Makefile",
    ".editorconfig",
    ".gitattributes",
    ".gitignore",
    ".dockerignore",
}

errors: list[str] = []

for path in ROOT.rglob("*"):
    if not path.is_file():
        continue

    if any(part in IGNORED_DIRS for part in path.parts):
        continue

    if path.suffix.lower() not in TEXT_EXTENSIONS and path.name not in TEXT_FILENAMES:
        continue

    raw = path.read_bytes()
    relative = path.relative_to(ROOT)

    if raw.startswith(codecs.BOM_UTF8):
        errors.append(f"{relative}: UTF-8 BOM não permitido")
        continue

    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        errors.append(f"{relative}: UTF-8 inválido ({exc})")
        continue

    if "\ufffd" in text:
        errors.append(f"{relative}: contém U+FFFD, provável corrupção de encoding")

if errors:
    print("Falha na validação de encoding:\n", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print("Encoding OK: todos os arquivos de texto verificados são UTF-8 sem BOM.")
