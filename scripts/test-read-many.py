import json
import subprocess
import sys
import tempfile
from pathlib import Path

script = Path(__file__).with_name('read-many.py')
with tempfile.TemporaryDirectory(prefix='read-many-') as folder:
    root = Path(folder)
    cache = root / 'index.db'
    a = root / 'a space.txt'
    b = root / 'unicode.txt'
    a.write_bytes(b'one\r\ntwo\r\nthree\r\n')
    b.write_text('alpha\nbeta\u2028inside\n\u0442\u0440\u0438', encoding='utf-8')
    def call(*specs, code=0):
        run = subprocess.run([sys.executable, str(script), '--json', '--cache', str(cache), *specs], capture_output=True, encoding='utf-8')
        assert run.returncode == code, run.stderr or run.stdout
        return json.loads(run.stdout)
    specs = (f'{a}:2-3', f'{b}:2-99', f'{a}:1-1')
    first = call(*specs)
    assert first[0]['content'] == '2: two\n3: three'
    assert first[1]['content'] == '2: beta\u2028inside\n3: \u0442\u0440\u0438'
    assert first[1]['end'] == 3
    assert not first[0]['index_hit'] and first[2]['index_hit']
    assert all(item['index_hit'] for item in call(*specs))
    a.write_bytes(b'ONE\nTWO\nTHREE')
    changed = call(f'{a}:1-3')[0]
    assert not changed['index_hit'] and changed['content'] == '1: ONE\n2: TWO\n3: THREE'
    a.write_text('short', encoding='utf-8')
    assert call(f'{a}:1-3')[0]['total_lines'] == 1
    empty = root / 'empty.txt'
    empty.touch()
    binary = root / 'binary.bin'
    binary.write_bytes(b'abc\0def')
    bad = call(f'{a}:0-2', f'{empty}:1-2', f'{binary}:1-2', f'{root / "missing"}:1-2', f'{a}:1-1', code=1)
    assert all('error' in x for x in bad[:4]) and bad[4]['content'] == '1: short'
    invalid = root / 'invalid.txt'
    invalid.write_bytes(b'\xff\n')
    assert 'error' in call(f'{invalid}:1-1', code=1)[0]
    large = root / 'large.txt'
    large.write_text('x' * 262145, encoding='utf-8')
    assert 'error' in call(f'{large}:1-1', code=1)[0]
    print('PASS: multi-file ranges, CRLF, Unicode, persistent hits, same-size edits, truncation, EOF, errors and output cap')
