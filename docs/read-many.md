# Batched file ranges

Read several related files with one CLI call:

```powershell
python scripts/read-many.py "src/llama.cpp:15-25" "common/common.h:40-65" "C:/workspace/app.py:1-20"
```

Ranges are inclusive and use one-based line numbers. Quote each argument, especially paths with spaces. The final colon separates the range, so Windows drive letters work.

Add `--json` for a single array containing each path, range, line-numbered text, file version, and cache-hit status. Errors are returned per range; other valid ranges are still read. Any error makes the process exit with status 1.

The first read builds a byte-offset index. Subsequent calls seek directly to the requested lines. The SQLite index lives in `%LOCALAPPDATA%/ffprocessor/read-many.sqlite3` on Windows; use `--cache PATH` to choose another location. It stores offsets and file identity metadata, not source text or model reasoning. File size, modification/change timestamps, device and inode changes invalidate an entry. Metadata checks before and after reading reject detected concurrent changes. This does not provide a filesystem snapshot or detect edits that deliberately preserve every identity field.

Limits: 32 ranges per call, 64 MiB and one million indexed lines per file, 256 KiB of numbered source text per response, and 512 cached files. UTF-8 text with LF or CRLF is supported. Empty files, binary files, invalid ranges and invalid UTF-8 return explicit errors. End ranges past EOF are clamped.

For Bionic or another coding client, expose this command through its shell tool, or wrap the JSON result in a client-side `read_files` tool. The runtime manifest alone does not add tools to Bionic. This patch does not change model weights, GPU kernels, prompts or the client's agent loop.

Use the returned file version as a review aid. Before an edit, read the relevant range again and confirm that the expected text still matches; the index is not authority to edit stale source.

Validation: `python scripts/test-read-many.py` covers multi-file ranges, Unicode, CRLF, persistent cache reuse, same-size edits, truncation, EOF and error paths. On 2026-09-30, a local synthetic test read 26 lines from each of five 100,000-line files in 179 ms on the first invocation and 64-68 ms on subsequent invocations, including Python startup. These are CLI timings, not end-to-end agent or model speed measurements.
