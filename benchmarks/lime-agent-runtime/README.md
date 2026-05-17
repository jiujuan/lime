# Lime Harbor Benchmark MVP

这个目录把 Lime 的 Agent QC / harness 场景转换成 Harbor-compatible benchmark task。目标是支持 runtime / prompt / tool / context 的 hill climbing，而不是替代 `npm run agent-qc:check`。

## 当前范围

第一版只落一个高信号 P0 task：

- `tool-approval-sandbox-boundary`：验证危险工具请求、approval deny、sandbox side effect、恢复反馈和 trajectory 证据。

后续再扩展：

- `harness-replay-regression`
- `browser-runtime-site-adapter`
- `claw-chat-ready-streaming`

## 本地结构检查

```bash
npm run agent-qc:benchmark:check
npm run agent-qc:benchmark:plan -- --format markdown
```

这两个命令不需要安装 Harbor，只验证 benchmark pack 的目录、task refs、artifacts 和 verifier 文件是否完整。

## Harbor 运行形状

```bash
harbor run \
  -p benchmarks/lime-agent-runtime \
  -a "<agent>" \
  -m "<model>" \
  --job-name lime-runtime-baseline-current

LIME_RUNTIME_TOOL_FEEDBACK_PROFILE=v2 harbor run \
  -p benchmarks/lime-agent-runtime \
  -a "<agent>" \
  -m "<model>" \
  --job-name lime-runtime-candidate-feedback-v2
```

然后比较：

```bash
npm run agent-qc:benchmark:compare -- \
  --baseline jobs/lime-runtime-baseline-current \
  --candidate jobs/lime-runtime-candidate-feedback-v2 \
  --output .lime/qc/benchmark/lime-runtime-feedback-v2/compare.json
```

macOS Apple silicon 本机可用 Apple Container 跑 oracle smoke：

```bash
container system start --enable-kernel-install
harbor run \
  -p benchmarks/lime-agent-runtime/tool-approval-sandbox-boundary \
  --env apple-container \
  --agent oracle \
  --job-name lime-harbor-oracle-smoke-apple-container \
  --jobs-dir .lime/qc/benchmark/harbor-jobs \
  --n-concurrent 1 \
  -y
```

注意：Harbor 的 `apple-container` environment 目前不支持 `allow_internet = false`，所以该 task 允许网络；verifier 只读取 `/logs` evidence，不依赖外网。

## 证据边界

Harbor 只负责运行 trial 和收集 reward。Lime 的 release 决策仍必须看：

```bash
npm run agent-qc:check
```

candidate 只有在 benchmark 证据完整、reward / failure mode 改善且 P0 QC 没有退化时才允许进入 release path。
