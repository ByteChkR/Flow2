"""Regenerate the shared, locale-independent per-codepoint Unicode casing table.
Requires Python with Unicode 16.0.0; both runtimes consume the exact same table.
Context-sensitive casing (e.g. final sigma) is deliberately not applied.
"""
import json
import unicodedata
from pathlib import Path
assert unicodedata.unidata_version == '16.0.0', unicodedata.unidata_version
root = Path(__file__).resolve().parents[1]
contracts = root / 'packages/core/src/contracts'
table = {'unicodeVersion': unicodedata.unidata_version}
for operation in ['lower', 'upper']:
    table[operation] = {str(code): getattr(chr(code), operation)() for code in range(0x110000)
                        if not 0xD800 <= code <= 0xDFFF and getattr(chr(code), operation)() != chr(code)}
text = json.dumps(table, ensure_ascii=True, separators=(',', ':')) + '\n'
(contracts / 'unicode-casing.json').write_text(text)

# A one-codepoint fold preserves UTF-16 widths, so capture offsets refer back to
# the original text. Expanding folds (ß -> ss, İ -> i+dot) are not regex folds.
fold = {}
for code in range(0x110000):
    if 0xD800 <= code <= 0xDFFF:
        continue
    char = chr(code)
    folded = char.casefold()
    if len(folded) != 1:
        folded = char.lower()
    if len(folded) == 1 and folded != char:
        assert len(char.encode('utf-16-le')) == len(folded.encode('utf-16-le'))
        fold[str(code)] = folded
program = {'fold': fold, 'lines': (contracts / 'regex-program.js').read_text().splitlines()}
text = json.dumps(program, ensure_ascii=True, indent=2) + '\n'
(contracts / 'regex-program.json').write_text(text)
