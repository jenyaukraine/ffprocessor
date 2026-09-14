# Bionic Context Compaction

Local configuration patch for Bionic 1.1.2 build 11. This is not a llama.cpp
inference change. It configures new sessions at 50% and caps existing enabled
ratio-based compaction at 50%, without modifying session databases. Explicitly
disabled compaction and earlier thresholds remain unchanged. It affects all
Bionic models using this module, not just Spark.

Run `node scripts/configure-bionic-compaction.mjs` to validate the installed
bundle and test its isolated trigger resolver. Use `--apply` from an administrator
terminal when Bionic is installed in Program Files, then restart Bionic to
activate. The script rejects incompatible bundles and saves adjacent
`.ffprocessor-compaction-50.bak` backups. With Bionic closed, restore both backups
to their original filenames to undo the patch. App updates may replace the patch;
rerun the check after an update. Do not apply it blindly to a different version.

For Spark, separately save `llm.load.contextLength` as `65536` in its Bionic model
defaults and reload the model with that context. A 50% ratio then triggers at
32,768 input tokens, leaving room for tool results and summarization. Verify the
loaded value using `lms ps`; changing defaults alone does not reload the model.

Resolver tests do not prove that a real conversation has compacted successfully.
Very large tool results can still overflow the remaining space. This patch does
not truncate history, force an edit, or guarantee a particular generation speed.
