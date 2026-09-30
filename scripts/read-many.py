#!/usr/bin/env python3
"""Read multiple UTF-8 file ranges with a persistent byte-offset index."""
import argparse
import array
import json
import os
from pathlib import Path
import sqlite3
import sys


MAX_FILE_BYTES = 64 * 1024 * 1024
MAX_OUTPUT_BYTES = 256 * 1024


def fingerprint(stat):
    return json.dumps([stat.st_dev, stat.st_ino, stat.st_size,
                       stat.st_mtime_ns, stat.st_ctime_ns])


def read_range(db, path, start, end, remaining):
    """Index each file once; reopen and validate its identity on every request."""
    if start < 1 or end < start:
        raise ValueError('Expected an inclusive range with 1 <= start <= end')
    resolved = Path(path).resolve(strict=True)
    with resolved.open('rb') as handle:
        before = os.fstat(handle.fileno())
        if before.st_size > MAX_FILE_BYTES:
            raise ValueError('File exceeds the 64 MiB indexing limit')
        stamp = fingerprint(before)
        row = db.execute('SELECT stamp, offsets FROM line_index WHERE path = ?',
                         (str(resolved),)).fetchone()
        offsets = array.array('Q')
        cached = bool(row and row[0] == stamp)
        if cached:
            offsets.frombytes(row[1])
        else:
            offsets.append(0)
            position = 0
            while chunk := handle.read(1024 * 1024):
                if b'\0' in chunk:
                    raise ValueError('Binary files are not supported')
                scan = 0
                while (newline := chunk.find(b'\n', scan)) != -1:
                    offsets.append(position + newline + 1)
                    if len(offsets) > 1000001:
                        raise ValueError('File exceeds the one million line indexing limit')
                    scan = newline + 1
                position += len(chunk)
            if position and offsets[-1] != position:
                offsets.append(position)
            if len(offsets) > 1000001:
                raise ValueError('File exceeds the one million line indexing limit')
            if fingerprint(os.fstat(handle.fileno())) != stamp:
                raise ValueError('File changed during indexing; retry')
            db.execute('INSERT OR REPLACE INTO line_index VALUES (?, ?, ?)',
                       (str(resolved), stamp, offsets.tobytes()))
        count = max(0, len(offsets) - 1)
        if start > count:
            raise ValueError(f'start line {start} exceeds file length {count}')
        last = min(end, count)
        length = offsets[last] - offsets[start - 1]
        if length > remaining:
            raise ValueError('Requested range exceeds the remaining output budget')
        handle.seek(offsets[start - 1])
        raw = handle.read(length)
        if len(raw) != length or fingerprint(os.fstat(handle.fileno())) != stamp:
            raise ValueError('File changed during reading; retry')
        text = raw.decode('utf-8-sig' if start == 1 else 'utf-8')
        # Split only on LF; other Unicode separators do not change line numbers.
        lines = text.split('\n')
        if lines[-1] == '':
            lines.pop()
        content = '\n'.join(f'{start + i}: {line.removesuffix(chr(13))}'
                            for i, line in enumerate(lines))
        consumed = len(content.encode('utf-8'))
        if consumed > remaining:
            raise ValueError('Numbered lines exceed the remaining output budget')
        return {
            'path': str(resolved), 'start': start, 'end': last,
            'total_lines': count, 'version': stamp, 'index_hit': cached,
            'content': content,
        }, consumed


def parse_spec(spec):
    try:
        path, span = spec.rsplit(':', 1)
        start, end = span.split('-', 1)
        return path, int(start), int(end)
    except ValueError:
        raise ValueError('Use PATH:START-END, for example src/main.cpp:15-25') from None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ranges', nargs='+', help='PATH:START-END; Windows drive letters are supported')
    parser.add_argument('--cache', type=Path, default=Path(os.getenv('LOCALAPPDATA', str(Path.home() / '.cache'))) / 'ffprocessor/read-many.sqlite3')
    parser.add_argument('--json', action='store_true', help='Return one JSON array, suitable for agent tools')
    args = parser.parse_args(argv)
    if len(args.ranges) > 32:
        parser.error('At most 32 ranges per call')
    args.cache.parent.mkdir(parents=True, exist_ok=True)
    results = []
    remaining = MAX_OUTPUT_BYTES
    failed = False
    with sqlite3.connect(args.cache, timeout=10) as db:
        db.execute('CREATE TABLE IF NOT EXISTS line_index (path TEXT PRIMARY KEY, stamp TEXT NOT NULL, offsets BLOB NOT NULL)')
        for spec in args.ranges:
            try:
                path, start, end = parse_spec(spec)
                result, consumed = read_range(db, path, start, end, remaining)
                remaining -= consumed
            except (OSError, ValueError) as error:
                result = {'request': spec, 'error': str(error)}
                failed = True
            results.append(result)
        # Keep the persistent index bounded; deleted files need not stay forever.
        db.execute('DELETE FROM line_index WHERE rowid NOT IN (SELECT rowid FROM line_index ORDER BY rowid DESC LIMIT 512)')
    if args.json:
        print(json.dumps(results, ensure_ascii=False))
    else:
        for result in results:
            if 'error' in result:
                print(f"ERROR {result['request']}: {result['error']}")
            else:
                print(f"=== {result['path']}:{result['start']}-{result['end']} ===\n{result['content']}")
    return int(failed)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
