#!/usr/bin/env python3
"""Extract remaining TODO entries for manual translation"""
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
EN_FILE = REPO_ROOT / 'src' / 'i18n' / 'patches' / 'en.json'
OUTPUT_FILE = REPO_ROOT / 'translations-remaining.json'

print("Loading en.json...")
with open(EN_FILE, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Extract all TODO entries
todos = {}
for key, value in data.items():
    if isinstance(value, str) and value.startswith('[TODO: Translate]'):
        chinese = value.replace('[TODO: Translate] ', '')
        todos[chinese] = ""  # Empty string for translation

print(f"Found {len(todos)} entries to translate")
print(f"Saving to {OUTPUT_FILE}...")

# Save to file
with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(todos, f, ensure_ascii=False, indent=2)

print("Done!")
print()
print("Next steps:")
print("1. Open translations-remaining.json")
print("2. Fill in English translations for each Chinese text")
print("3. Run python scripts/i18n/import_translations.py to merge back")
