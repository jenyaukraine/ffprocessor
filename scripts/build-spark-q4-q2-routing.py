"""Build a tensor-type override file from a GGUF importance matrix.

The quantizer applies the first matching regex. Important tensors get Q4;
the final catch-all sends the remaining quantizable tensors to Q2.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import numpy as np


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("imatrix", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--important-fraction", type=float, default=0.40)
    parser.add_argument("--q4", default="Q4_0_ROCMFP4_FAST")
    parser.add_argument("--q2", default="Q2_0_ROCMFPX")
    args = parser.parse_args()

    if not 0 < args.important_fraction < 1:
        parser.error("--important-fraction must be between 0 and 1")

    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root / "gguf-py"))
    from gguf import GGUFReader  # noqa: PLC0415

    reader = GGUFReader(args.imatrix)
    values: dict[str, float] = {}
    counts: dict[str, float] = {}
    for tensor in reader.tensors:
        if tensor.name.endswith(".in_sum2"):
            values[tensor.name[: -len(".in_sum2")]] = float(np.asarray(tensor.data).mean())
        elif tensor.name.endswith(".counts"):
            counts[tensor.name[: -len(".counts")]] = float(np.asarray(tensor.data).mean())

    scores = sorted(
        (
            (value / max(counts.get(name, 1.0), 1.0), name)
            for name, value in values.items()
        ),
        reverse=True,
    )
    important_count = max(1, int(len(scores) * args.important_fraction))
    important = [name for _, name in scores[:important_count]]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="ascii", newline="\n") as handle:
        for name in important:
            handle.write(f"{re.escape(name)}={args.q4}\n")
        handle.write(f".*={args.q2}\n")

    print(f"Wrote {args.output}")
    print(f"Importance entries: {len(scores)}; Q4 overrides: {important_count}; default: {args.q2}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
