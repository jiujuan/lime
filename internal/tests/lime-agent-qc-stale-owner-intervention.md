# Lime Agent QC stale GUI owner 处置协议

> 本文定义当 qcloop GUI P0 owner 长时间 stale 时，测试 Agent 应如何继续推进而不越权。核心原则：先证明、再请求 owner 决策；未获明确确认前，不 kill、不 pause、不 interrupt、不改 qcloop DB。

## 1. 触发条件

满足任一条件时进入本协议：

- `agent-qc:gui-owner-check -- --check` 返回非 0，且 `staleOwnerCount > 0`。
- `agent-qc:qcloop-status` 显示 GUI scenario `running` 超过 stale 阈值，且 stdout / stderr 长期为 0。
- 本机 `ps` 仍能看到对应内层 worker 进程，但该 worker 没有开始执行场景命令或没有业务输出。

当前典型状态：

```text
ownerCount=1
staleOwnerCount=1
active scenario=browser-runtime-site-adapter
worker stdoutLength=0
worker stderrLength=0
```

## 2. 只读证据采集

执行以下命令只读刷新 sidecar：

```bash
npm run agent-qc:qcloop-status -- \
  --base-url "http://127.0.0.1:18080" \
  --job-id "1778405842243079000" \
  --stale-minutes 8 \
  --format json \
  --output "./.lime/qc/qcloop-status.isolated-p0-full-v1-current.json"

npm run agent-qc:gui-owner-check -- \
  --format json \
  --output "./.lime/qc/gui-owner-current.json"
```

可选只读进程核查：

```bash
ps -eo pid,ppid,etime,stat,command | rg -i "qcloop|codex exec|browser-runtime-site-adapter|1778405842243079000|18080"
```

如果可以导出 sidecar Evidence Pack，继续导出但不要覆盖官方 evidence：

```bash
npm run agent-qc:export-evidence -- \
  --base-url "http://127.0.0.1:18080" \
  --job-id "1778405842243079000" \
  --output "./.lime/qc/agent-qc-evidence.isolated-p0-full-v1-current.json" \
  --ref "local-isolated-p0-full-v1-current" \
  --check
```

## 3. 禁止操作

未获 owner 明确确认前禁止：

- `kill` / `pkill` / `killall` 内层 worker 或 qcloop serve。
- qcloop Web/API 上执行 pause / cancel / retry。
- 直接修改 qcloop SQLite DB 状态或 lease。
- 启动新的 full GUI P0 批次。
- 用 sidecar evidence 覆盖 `.lime/qc/agent-qc-evidence.json`。

## 3.1 机器可读决策包

当前 stale owner 的机器可读确认包位于 `.lime/qc/stale-owner-intervention-request.json`。该 sidecar 汇总 job、active item、DB lease、PID、binary provenance、证据引用、禁止动作和确认文本；它只用于 owner 决策，不等于授权。

同时，`npm run agent-qc:gui-owner-check -- --format json` 会在存在 stale GUI owner 时输出 `ownerIntervention` 字段，包含 `requiredConfirmationText`、`prohibitedUntilConfirmed`、`evidenceRefs` 和下一步动作。该字段是机器可读提示，不等于 owner 已确认。

需要连续观察时，加 `--watch-history-output ./.lime/qc/stale-owner-watch-history.jsonl`。该参数只追加 GUI owner report 摘要，不修改 qcloop job、SQLite DB 或进程状态。

## 4. Owner 确认格式

如果需要处理 stale owner，先生成干预请求，给出影响范围和建议动作。必须看到类似确认后才能继续：

```text
确认处理 stale GUI owner 1778405842243079000，可以终止 PID <pid> 并记录 sidecar。
```

确认前只允许继续完善文档、payload、审计和非侵入式 sidecar。

## 5. 获得确认后的最小闭环

获得确认后仍按最小动作执行：

1. 再次导出 qcloop status、GUI owner report 和 Evidence sidecar。
2. 记录要处理的 PID、job id、scenario id、stale 秒数和 stdout/stderr 长度。
3. 使用 owner 批准的方式处理 stale worker；优先使用 qcloop 自身安全入口，只有 owner 明确授权时才终止进程。
4. 处理后再次执行 `agent-qc:gui-owner-check -- --check`。
5. ownerCount 回到 0 后，才允许使用结构化 evidence payload 重跑 P0。
6. 新 P0 批次必须输出 `QCLOOP_EVIDENCE_SUMMARY_JSON=<json>`；否则 release summary gate 会继续阻断。

## 6. 关闭条件

只有以下条件全部满足时，stale owner 处置才算完成：

- `agent-qc:gui-owner-check -- --check` 通过。
- 没有 GUI P0 running / stale sidecar。
- 新 qcloop P0 payload 使用结构化 evidence 契约。
- 官方 `.lime/qc/agent-qc-evidence.json` 只由新的 8/8 P0 pass 批次导出。
- `agent-qc:release-summary --check` 与 `agent-qc:audit` 通过。

## 7. Owner 清空后的 P0 重跑 runbook

当 `agent-qc:gui-owner-check -- --check` 已通过，按以下顺序执行，不要跳步：

```bash
npm run agent-qc:gui-owner-check -- --check

npm run agent-qc:qcloop-job -- \
  --risk P0 \
  --cwd "/Users/coso/Documents/dev/ai/aiclientproxy/lime" \
  --max-qc-rounds 1 \
  --max-executor-retries 0 \
  --output "./.lime/qc/qcloop-p0-structured-evidence-v1-payload.json" \
  --check
```

提交 qcloop job 前必须人工或 Agent 复核 payload：

- `items.length=8`，覆盖全部 P0。
- `prompt_template` 包含 `QCLOOP_WORKER_RESULT=PASS|FAIL|BLOCKED`。
- `prompt_template` 包含 `QCLOOP_EVIDENCE_SUMMARY_JSON=<json>`。
- `verifier_prompt_template` 包含 `{{stdout}}`、`{{attempt_status}}`、`{{exit_code}}`、`{{issue_ledger}}`。
- `verifier_prompt_template` 明确只输出 `{"pass": true|false, "feedback": "..."}` JSON。
- `max_qc_rounds=1`，避免发布证据批次 repair 轮修改工作区。
- `max_executor_retries=0`，发布证据批次不自动重试内层 CLI，避免重复制造 stale worker；如果 owner 明确要保留基础设施重试，可在隔离环境中改为 1。

新 job 运行中只读观察：

```bash
npm run agent-qc:qcloop-status -- \
  --base-url "<qcloop-base-url>" \
  --job-id "<new-job-id>" \
  --stale-minutes 8 \
  --format json \
  --output "./.lime/qc/qcloop-status.<new-job-id>.json"
```

只有新 job 全部 P0 `success`，且 `agent-qc:export-evidence` 导出的 sidecar 为 `pass`，才允许覆盖官方 evidence：

```bash
npm run agent-qc:export-evidence -- \
  --base-url "<qcloop-base-url>" \
  --job-id "<new-job-id>" \
  --output "./.lime/qc/agent-qc-evidence.json" \
  --ref "local-agent-qc-p0" \
  --check

npm run agent-qc:release-summary -- \
  --evidence "./.lime/qc/agent-qc-evidence.json" \
  --require-scenario-manifest "internal/test/agent-qc-scenarios.manifest.json" \
  --require-risk P0 \
  --tag "local-agent-qc-audit" \
  --output "./.lime/qc/release-agent-qc.current-audit.md" \
  --check

node scripts/agent-qc-completion-audit.mjs --format json > ".lime/qc/agent-qc-audit-current.json"
```

如果 release summary 报缺少结构化 evidenceRefs，不能手工补假路径；应回到 qcloop worker stdout，确认 `QCLOOP_EVIDENCE_SUMMARY_JSON` 的 `artifacts[]`、`gui_session_owner` 和 `release_scope` 是否真实存在。

## 8. raw GUI owner stale 处置补充

当 `agent-qc:gui-owner-check -- --check` 已通过，但 `agent-qc:process-owner-check -- --check` 仍因 raw GUI smoke 进程阻断时，按本节处理。该场景不是 qcloop job owner，而是宿主机上仍存活的 GUI smoke / Playwright / Chrome owner。

当前典型状态：

```text
gui owner: pass
process owner: busy
activeGuiSmoke=1
staleActiveGuiSmoke=1
ownerIntervention=requires_owner_confirmation
PID=59011
command=npm run smoke:design-canvas ...
```

### 8.1 只读取证

```bash
npm run agent-qc:process-owner-check -- \
  --format json \
  --output "./.lime/qc/gui-process-owner-current.json" \
  --markdown-output "./.lime/qc/gui-process-owner-current.md" \
  --watch-history-output "./.lime/qc/raw-process-owner-watch-history.jsonl"

npm run agent-qc:objective-checklist -- \
  --format json \
  --output "./.lime/qc/objective-completion-checklist-current.json"
```

机器可读处置请求位于：

- `.lime/qc/stale-raw-gui-owner-intervention-request.json`
- `.lime/qc/stale-raw-gui-owner-intervention-request.md`

### 8.2 禁止操作

确认前禁止：

- `kill` / `pkill` / `killall` raw GUI smoke、Playwright 或 Chrome 进程。
- 启动完整 `npm run verify:local`。
- 启动新的 full GUI P0 qcloop 批次。
- 覆盖官方 `.lime/qc/agent-qc-evidence.json`。
- 执行 git commit / push / tag / release。

### 8.3 raw owner 确认格式

必须看到完整确认文本后才能处理：

```text
确认处理 stale raw GUI owner PID 59011，可以终止这些进程并记录 sidecar。
```

如果 PID 已变化，必须重新运行 `agent-qc:process-owner-check`，使用最新 `ownerIntervention.requiredConfirmationText`，不得复用旧 PID。

### 8.4 获得确认后的最小闭环

1. 再次运行 `agent-qc:process-owner-check`，确认 PID、PGID、命令和 `etime`。
2. 记录 before sidecar，包含 PID、PGID、命令、确认文本和禁止动作清单。
3. 只处理 owner 明确确认的 PID / 进程组；不要顺手清理 passive qcloop serve、passive Tauri runtime 或 observer shell。
4. 处理后立即运行：

```bash
npm run agent-qc:process-owner-check -- --check
npm run agent-qc:gui-owner-check -- --check
```

5. 两个 owner gate 都通过后，先跑完整 `npm run verify:local`；只有 verify local pass 后，才允许进入新的 single-owner full P0 qcloop。

### 8.5 关闭条件

raw owner stale 处置完成必须同时满足：

- `agent-qc:process-owner-check -- --check` 通过。
- `agent-qc:gui-owner-check -- --check` 通过。
- action sidecar 证明只处理了 owner 确认的 PID / PGID。
- `objective-completion-checklist-current.json` 不再把 raw process owner 列为 blocker。

### 8.6 精确进程树与处置计划

确认前可以继续做只读进程树取证，但不能发送 signal。当前标准 sidecar：

- `.lime/qc/stale-raw-gui-owner-process-tree-current.json`
- `.lime/qc/stale-raw-gui-owner-recursive-tree-current.json`
- `.lime/qc/stale-raw-gui-owner-intervention-plan-current.json`

这些 sidecar 的用途是缩小确认后的处置范围，而不是授权处置。若 `intervention-plan-current.json` 显示：

```text
recommendedScope=process_group
rootPid=59011
rootPgid=59011
processGroupPids=59011,59100
```

则确认后的默认动作是只处理该已确认 process group；递归树中属于子 shell / browser helper 的 PID 只作为佐证，不允许额外扩大到 passive qcloop serve、passive Tauri runtime、系统 Chrome 或其他 observer shell。

处置前必须重新生成 `recursive-tree-current` 和 `intervention-plan-current`，以防 PID / PGID 被系统复用或子进程已自然退出。若最新计划与确认文本中的 PID 不一致，停止并重新请求 owner 确认。
