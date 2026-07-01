# P0 Green 计划

> 目标：低成本、分阶段把官方 Agent QC P0 Evidence Pack 推到可信 green。

## 1. 当前判断

当前不应该继续盲目开 full P0 qcloop。

先修三个基础问题：

1. owner gate 稳定。
2. worker 输出结构化 evidence。
3. P0 场景可单独补证据。

## 2. Phase A：Preflight 固化

目标：不消耗 live Provider，不启动 full P0，只确认环境。

检查：

```bash
npm run agent-qc:check
npm run agent-qc:gui-owner-check -- --check
npm run agent-qc:process-owner-check -- --format json
npm run agent-qc:qcloop-preflight -- --require-devbridge --check
```

通过条件：

- 无 active / stale GUI owner。
- DevBridge healthy。
- qcloop worker cwd/tmp/loopback 可用。
- payload 覆盖 P0，无 missing / extra。

## 3. Phase B：P0 单场景补证据

目标：每次只补一个 P0 场景，避免 token 爆炸。

顺序建议：

1. `command-bridge-contract`
2. `harness-replay-regression`
3. `workspace-ready-session-restore`
4. `browser-runtime-site-adapter`
5. `skill-forge-register-bind-enable`
6. `tool-approval-sandbox-boundary`
7. `claw-chat-ready-streaming`
8. `release-package-startup-smoke`

原则：

- 简单 deterministic 场景先过。
- runtime transcript 场景单独补。
- live Provider 场景最后处理，并要求明确授权。

## 4. Phase C：同批次 8/8 P0

只有 Phase B 每个场景都能单独稳定输出 structured evidence 后，才跑 full P0。

要求：

```text
8/8 qcloop item success
8/8 QCLOOP_EVIDENCE_SUMMARY_JSON parseable
official .lime/qc/agent-qc-evidence.json status=pass
agent-qc:release-summary --check pass
agent-qc:audit complete
```

## 5. 不允许的捷径

- 不拼接 sidecar。
- 不降 verifier。
- 不把 deterministic smoke 伪装成 runtime transcript。
- 不在 GUI owner busy 时启动 full P0。
- 不把 live Provider 失败当普通产品失败，必须先归类 Provider / quota / auth。
