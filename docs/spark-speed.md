# Spark X2.5 maximum-speed profile

The fastest measured single-request baseline on the RX 7900 XTX is the Q4
ROCmFP4 FAST model, not the experimental Q2 model. The local baseline reached
about 168 tokens/s on a short coding request. Q2 was slower on this Vulkan
kernel, so reducing the file size alone is not a valid route to 250 tokens/s.

## Reproducible speculative profile

Download a small coding draft model and run:

```powershell
$out = 'D:\AI\models\Qwen2.5-Coder-0.5B-Q8_0.gguf'
$url = 'https://huggingface.co/ggml-org/Qwen2.5-Coder-0.5B-Q8_0-GGUF/resolve/main/qwen2.5-coder-0.5b-q8_0.gguf?download=true'
curl.exe -L --fail --retry 3 -o $out $url
```

Then start `scripts/run-spark-q4fast-speculative.cmd`. It uses:

- Q4 ROCmFP4 FAST as the quality-preserving target;
- Qwen2.5 Coder 0.5B Q8 as the draft proposer;
- one active request, 32K context, full GPU offload;
- eight proposed tokens with a minimum of three.

The draft model does not replace Spark or add knowledge. Spark verifies every
accepted token, so output quality stays governed by the target model. The
actual speedup depends on draft acceptance; inspect the server statistics and
keep the profile only if the measured decode rate improves. A 250 tokens/s
result is a target to benchmark, not a guaranteed property of every prompt.

For Bionic/LM Studio, load the same target with context `32768` and parallel
`1`, then enable simple speculative decoding and select the downloaded draft
model. Do not leave the previous `90K / 4-slot` instance loaded: that profile
is for capacity and concurrency, and reduces the speed of one request.
