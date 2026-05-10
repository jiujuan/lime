# Lime Agent QC 整体目标完成度审计（2026-05-10）

> 审计目的：把“实现整体目标”拆成可验证交付物，逐项映射到仓库文件、命令输出和 qcloop 真实状态。只要官方 P0 Evidence Pack 未通过，本目标不得标记完成。

最近一次只读刷新：2026-05-11 01:32。刷新只更新 `.lime/qc/*` sidecar 和 docs/tests 审计文档，不提交、不推送、不中断任何正在运行的 qcloop worker。当前权威机器审计见 `.lime/qc/agent-qc-audit-current.json`。

## 1. 目标拆解

本轮整体目标不是单纯新增文档，而是为 Lime 这个即将运营的 Agent 产品建立可由 Agent 自主执行的测试体系。成功标准如下：

1. `docs/tests/` 下有人读测试标准、P0 手册、Lime 示例计划和当前 blocker 记录。
2. `docs/test/` 下有机器可读 scenario manifest、GUI flow manifest 和 Evidence Pack schema。
3. 仓库脚本能校验标准、生成 qcloop job、只读监控 qcloop 状态、导出 Evidence Pack、生成 release summary、执行 completion audit。
4. qcloop 能执行真实 P0 场景并导出官方 `.lime/qc/agent-qc-evidence.json`。
5. 发布门禁只接受官方 Evidence Pack `pass`，且必须覆盖全部 P0 scenario id。
6. GUI / Runtime / approval / sandbox / release 等关键风险有对应测试手段，不依赖人工口头确认。
7. 当前未通过的 P0 blocker 有明确证据、原因和关闭条件。
8. 在用户明确要求 Lime 不推送时，不执行 commit / push。

## 2. Prompt-to-artifact checklist

| 要求 | 具体证据 | 当前状态 | 结论 |
| --- | --- | --- | --- |
| `docs/tests` 下新增测试文档 | `docs/tests/lime-agent-autonomous-testing-plan.md`、`docs/tests/lime-agent-autonomous-test-execution-matrix.md` | 已存在，覆盖风险地图、Agent 分工、组合测试、Phase 0-6、owner gate、P0 执行矩阵和失败回写 | PASS |
| `docs/tests` 入口更新 | `docs/tests/README.md` | 已加入 Lime 自主测试计划与执行矩阵 | PASS |
| 运营级测试标准 | `docs/tests/agent-ops-qc.md` | 已定义 lane、Evidence Pack、qcloop、release gate | PASS |
| P0 场景手册 | `docs/tests/agent-qc-p0-scenarios.md` | 已存在 | PASS |
| Lime 落地计划 | `docs/tests/lime-agent-qc-rollout-plan.md` | 已存在 | PASS |
| 当前 blocker 记录 | `docs/tests/lime-agent-qc-current-blockers.md` | 已记录 v3 / v4 / v5、官方 evidence fail、scenario blocker 和关闭条件 | PASS |
| Scenario manifest | `docs/test/agent-qc-scenarios.manifest.json` | `npm run agent-qc:check` 显示 12 个场景、8 个 P0、0 issue；现在会校验 qcloop verifier prompt 必须带 stdout / attempt 状态占位符；`command-bridge-contract` 已允许 no-change surface evidence 用 checked surface counts + contract pass 满足；8 个 P0 均声明合法 `evidenceLayers`，缺失或未知层级会被 `agent-qc:check` 阻断；GUI P0 已显式要求 `GUI session owner / isolation statement`；workspace/release P0 已显式要求 design canvas 工程 roundtrip 和 GUI smoke 自然收口证据 | PASS |
| qcloop stale / cleanup / worker env / read-only repair 机器标准 | `docs/test/agent-qc-scenarios.manifest.json` | `qcloop-batch-verifier-repair` 已把 stale sidecar、stdout/stderr 长度、no-output lease 心跳、worker CLI 环境 sidecar、内层 Codex MCP 启动策略、read-only worker policy 与 max_qc_rounds policy 列入证据 / failure mode；`browser-runtime-site-adapter` 已把 cleanup warning 分类纳入证据 | PASS |
| GUI flow manifest | `docs/test/agent-qc-gui-flows.manifest.json` | `npm run agent-qc:check` 显示 4 个 P0 GUI flow、0 issue | PASS |
| Evidence schema | `docs/test/agent-qc-evidence.schema.json` | `agent-qc:audit` 识别为存在 | PASS |
| qcloop payload 生成 | `scripts/agent-qc-qcloop-job.mjs` / `scripts/lib/agent-qc-qcloop-job-core.mjs` / `scripts/lib/agent-qc-report-core.mjs` | `agent-qc:audit` 识别 `itemCount=8`；本轮已修正 verifier prompt 自动包含 `{{stdout}}` / `{{attempt_status}}` / `{{exit_code}}`，并让 `agent-qc:check` 与 `agent-qc:qcloop-job --check` 机械阻断缺占位符的模板；qcloop item 现在会带 `evidence_layers` | PASS |
| 证据深度分层 payload | `.lime/qc/qcloop-p0-evidence-layers-v1-payload.json` | 已生成但未提交运行；8 个 P0 item 均带 `evidence_layers`，`max_qc_rounds=1`，GUI P0 item 均带 GUI session owner / isolation evidence，workspace/release P0 item 均带 design canvas roundtrip / GUI smoke 收口 evidence 与 failure mode，用于后续 worker 明确区分 `deterministic-smoke` / `gui-trace` / `runtime-transcript` / `release-artifact` | PASS sidecar |
| design canvas failure extract | `.lime/qc/design-canvas-failure-fastmini-workspace-extract.json` | 从 fast-mini readonly P0 的 workspace item attempt 中只读提取；DevBridge `ok`、`smoke:workspace-ready` PASS、页面进入 `CANVAS:DESIGN`，但 `project-roundtrip-save-open` 等待 `已保存图层设计工程` 超时 | FAIL evidence sidecar |
| qcloop verifier evidence 占位符 | `scripts/lib/agent-qc-completion-audit-core.mjs` / `scripts/agent-qc-completion-audit.mjs` | `npm run agent-qc:audit -- --format json` 显示 `qcloop-verifier-evidence-placeholders` 通过，证据为 `stdout=true attempt_status=true exit_code=true` | PASS |
| qcloop evidence 导出 | `scripts/agent-qc-export-evidence.mjs` / `scripts/lib/agent-qc-evidence-core.mjs` | 已导出 `.lime/qc/agent-qc-evidence.p0-rerun-v5-current.json` sidecar；worker stdout 明确 `QCLOOP_WORKER_RESULT=BLOCKED` 或 stderr 显示内层 CLI / 认证 / sandbox 配置阻断时归类为 `blocked`，避免把环境阻断误写成产品 fail | PASS |
| qcloop 只读状态监控 | `scripts/agent-qc-qcloop-status.mjs` / `scripts/lib/agent-qc-qcloop-status-core.mjs` / `docs/tests/lime-agent-qc-qcloop-operations.md` | 已支持 running / pending / exhausted / stale 分类，并可把运行中批次状态导出到 `.lime/qc/qcloop-status.*.json`；不会中断 worker；显式 blocked marker 会保留环境阻断语义；stale item 现在输出 `staleSeconds` 与 worker `durationSeconds` | PASS |
| qcloop DB lease 只读取证 | `scripts/agent-qc-qcloop-db-lease.mjs` / `package.json` | `npm run agent-qc:qcloop-db-lease` 会只读导出 qcloop SQLite DB 中的 active item、lease、attempt stdout/stderr 长度和相关进程快照，用于判断 no-output stale worker 是否仍被续约 | PASS |
| GUI owner 并发检查 | `scripts/agent-qc-gui-owner-check.mjs` / `scripts/lib/agent-qc-gui-owner-core.mjs` / `package.json` | `npm run agent-qc:gui-owner-check -- --check` 会只读扫描 `.lime/qc/qcloop-status.*.json`，active GUI owner 超过上限时非 0 退出；用于启动新 GUI P0 前阻断并发 GUI smoke 干扰 | PASS |
| raw process owner 检查 | `scripts/agent-qc-process-owner-check.mjs` / `package.json` | `npm run agent-qc:process-owner-check` 会只读扫描 raw GUI smoke、qcloop、Cargo / Rust owner，并生成 `.lime/qc/gui-process-owner-current.json` / `.md`；用于决定是否等待完整 `verify:local` | PASS |
| qcloop worker preflight | `scripts/agent-qc-qcloop-preflight.mjs` / `scripts/lib/agent-qc-qcloop-preflight-core.mjs` / `docs/test/agent-qc-scenarios.manifest.json` | 已支持 cwd / tmp / DevBridge 前置检查，并把 preflight 写入 qcloop worker prompt；GUI / browser runtime 场景可先阻断环境问题 | PASS |
| release summary | `scripts/agent-qc-release-summary.mjs` | `agent-qc:audit` 识别为存在 | PASS |
| release hard gate | `.github/workflows/release.yml` | `agent-qc:audit` 显示强制 Evidence Pack pass 且覆盖 P0 | PASS |
| nightly artifact | `.github/workflows/harness-nightly.yml` | `agent-qc:audit` 显示上传 `artifacts/agent-qc/*` | PASS |
| GUI 真实证据 | `.lime/qc/gui-evidence` | `agent-qc:audit` 显示存在；本地 GUI smoke 曾通过 | PASS |
| approval / sandbox smoke | `scripts/agent-runtime-approval-sandbox-smoke.mjs`、`package.json`、manifest commands | direct-host `npm run smoke:agent-runtime-approval-sandbox -- --timeout-ms 120000 --output .lime/qc/backend-evidence/approval-sandbox-live-current-2026-05-10/runtime-approval-sandbox-smoke.fixed.json` 通过，denied / resolved 两条 flow 均生成 `runtime_permission_confirmation:*` | PASS sidecar，仍非官方 full P0 pack |
| qcloop worker Vitest 沙箱写入问题 | `scripts/lib/vitest-smoke-runner.mjs`、`scripts/agent-runtime-tool-surface-smoke.mjs` | smoke 改为 `/tmp` Vitest config/cache，`npm run smoke:agent-runtime-tool-surface` 通过 | PASS |
| 官方 P0 Evidence Pack | `.lime/qc/agent-qc-evidence.json` | `agent-qc:audit` 显示 `status=fail scenarios=8/8` | FAIL |
| qcloop v4 重跑 | job `1778392677659787000` | 已 `completed` / `fail`，6/6 exhausted；只作为排障 sidecar，不是官方发布证据 | FAIL |
| qcloop v5 重跑 | job `1778398587521627000` | 已 `completed` / `fail`；1 failed、5 exhausted-or-blocked、0 success；不覆盖官方 Evidence Pack | FAIL |
| 宿主 DevBridge 恢复 | `.lime/qc/qcloop-devbridge-health-restored.json` | `npm run bridge:health` 与宿主 `agent-qc:qcloop-preflight -- --require-devbridge` 均通过；说明 headless Tauri / DevBridge 已恢复 | PASS |
| qcloop worker DevBridge preflight | job `1778403715309891000`、`.lime/qc/qcloop-status.worker-devbridge-preflight.json` | 只读 preflight job 显示内层 worker cwd/tmp 通过，但 `devbridge-health` 仍 `fetch failed`，sidecar 归类为 `blocked` | BLOCKED |
| isolated qcloop worker preflight | job `1778404260108641000`、`.lime/qc/qcloop-status.isolated-worker-devbridge-preflight-v2.json` | 隔离 qcloop server `127.0.0.1:18080` 使用独立 DB 和显式 Codex sandbox 配置后，worker DevBridge preflight 通过 | PASS sidecar |
| isolated P0 sidecar pass | jobs `1778404364137496000` / `1778404601640847000` / `1778404743505029000` | `workspace-ready-session-restore`、`browser-runtime-site-adapter`、`skill-forge-register-bind-enable` 在 isolated qcloop 下通过；仍非官方全量 P0 Evidence Pack | PASS sidecar |
| isolated release startup sidecar v1 | job `1778404882904047000` | 执行时宿主 DevBridge 再次断开，preflight blocked，未执行版本或 GUI smoke；保留为历史环境阻断证据 | BLOCKED sidecar |
| isolated release startup sidecar v2 | job `1778405385701480000`、`.lime/qc/qcloop-status.isolated-release-startup-v2.json` | worker preflight、`verify:app-version`、`verify:gui-smoke -- --reuse-running` 均通过；stdout 明确 `ARTIFACT_SCOPE=source-tree-startup-smoke` | PASS sidecar |
| isolated full P0 sidecar v1 | job `1778405842243079000`、`.lime/qc/qcloop-status.isolated-p0-full-v1-current.json`、`.lime/qc/qcloop-db-lease-isolated-p0-full-v1-latest.json` | 批次仍 running；`command-bridge-contract`、`claw-chat-ready-streaming`、`tool-approval-sandbox-boundary`、`skill-forge-register-bind-enable` 已 success；`browser-runtime-site-adapter` running 且 stale 约 `28020s`；DB lease 仍为 `lock_owner=qcloop-worker-1`、`lock_expires_at=2026-05-11T01:47:06+08:00`；active attempt `dc625f8e-b3b9-46b7-9758-4b0273438d50` stdout/stderr 仍为空；后续 3 个 P0 pending | STALE sidecar |
| isolated no-MCP full P0 v1 | job `1778410893606889000`、`.lime/qc/qcloop-status.isolated-nomcp-p0-v1-current.json` | 因 `QCLOOP_CODEX_BIN` 指向坏 Homebrew symlink，8 个 item 立即 failed；现按 worker CLI 环境阻断归类，不作为产品失败 | BLOCKED sidecar |
| isolated no-MCP full P0 v2 | job `1778410956075020000`、`.lime/qc/qcloop-status.isolated-nomcp-p0-v2-current.json` | 使用正确 Codex bin 与 `QCLOOP_CODEX_EXTRA_ARGS='--ephemeral -c mcp_servers={}'`；实测仍可能存在用户级 MCP 子进程；当前 2 success、1 failed、1 running、4 pending，`tool-approval-sandbox-boundary` 已 failed，`skill-forge-register-bind-enable` running | RUNNING with failed item sidecar |
| isolated MCP-disabled full P0 v1 | job `1778412160003934000`、`.lime/qc/qcloop-status.isolated-mcpdisabled-p0-v1-current.json` | 覆盖已知 MCP command 为空，初始 `ps` 未观察到用户级 MCP 子进程；当前 1 failed、1 running、6 pending，`claw-chat-ready-streaming` stale | STALE with failed item sidecar |
| isolated fast full P0 v1 | job `1778412499745993000`、`.lime/qc/qcloop-status.isolated-fast-p0-v1-current.json` | 在 MCP command 覆盖基础上追加 `--ignore-rules`；当前 1 success、1 running、6 pending，`claw-chat-ready-streaming` running | RUNNING sidecar |
| isolated fast-mini readonly full P0 v1 | job `1778412738097137000`、`.lime/qc/qcloop-status.fastmini-readonly-p0-v1-current.json`、`.lime/qc/agent-qc-evidence.fastmini-readonly-p0-v1-current.json` | 使用 `gpt-5.4-mini`、low reasoning、只读 prompt、`max_qc_rounds=1` 与 MCP command 覆盖；当前 job 已 terminal `failed`，8 exhausted；sidecar evidence 导出为 6 fail / 2 blocked，并暴露 `workspace-ready-session-restore` 在 `smoke:design-canvas` 保存成功状态断言失败、`release-package-startup-smoke` GUI smoke 未自然收口 | FAIL sidecar |
| stale gate exit check | `agent-qc:qcloop-status -- --check-terminal --fail-on-stale` | 当前 full P0 job 返回 `QCLOOP_STATUS_CHECK_EXIT_STATUS=2`，摘要显示 `duration=67m stdout=0 stderr=0`；证明 stale gate 会非 0 阻断 | PASS |
| direct browser runtime / site adapter host check | `agent-qc:qcloop-preflight -- --require-devbridge` + `smoke:browser-runtime` + `smoke:site-adapters` | 宿主 shell 直接执行退出码 0；DevBridge pass，browser runtime smoke 与 site adapter smoke 通过；browser cleanup 输出非阻断 `close_cdp_session` warning | PASS with warning |
| direct harness replay host check | `npm run harness:eval` + `npm run harness:eval:trend` | 宿主 shell 直接执行退出码 0；2/2 ready、invalid=0、current observability gap=0、degraded gap=1；trend 样本数 1，只能作为 seed | PASS with trend caveat |
| direct workspace / release host check | `smoke:workspace-ready` + `verify:app-version` + `verify:gui-smoke -- --reuse-running` | 宿主 shell 直接执行退出码 0；workspace ready、版本一致性、DevBridge health、GUI smoke 通过；GUI smoke 内含 browser runtime、site adapters、service skill entry、runtime tool surface、knowledge GUI、design canvas | PASS |
| `verify:gui-smoke` 最新复核 | `.lime/qc/verify-gui-smoke-current.json`、`.lime/qc/verify-gui-smoke-reuse-sensenova-session-restore-2026-05-11-0108.log` | 外部启动的显式 Sensenova `verify:gui-smoke -- --reuse-running --timeout-ms 240000` 已自然通过；覆盖 Claw streaming / interrupt / resume、knowledge GUI 与 design canvas；仅作为 GUI smoke pass，不关闭完整 `verify:local` | PASS sidecar |
| raw GUI / Cargo process owner | `.lime/qc/gui-process-owner-current.json` | 当前仍为 `busy`，`activeGuiSmoke=2`、`cargoOrRust=4`、`qcloopRelated=7`；因此本轮不启动新的完整 `verify:local` 或 full GUI P0 | BLOCKED sidecar |
| `local-verify-gate` | `.lime/qc/verify-local-current.json`、`.lime/qc/verify-local-sensenova-2026-05-11-0023.log` | 最新完整 `npm run verify:local` 失败在 `verify:gui-smoke / smoke:claw-chat-ready-streaming`；后续 `verify:gui-smoke` 已 pass，但它仍不能替代完整 `verify:local` pass | FAIL |
| GitHub push / release | git remote / GitHub | 用户明确要求 Lime 不推送，本轮未执行 commit / push | PASS |

## 3. 当前命令证据

最近一次审计命令：

```bash
npm run agent-qc:audit -- --format json
```

结果摘要：

```text
status=incomplete
passed=16/18
failed=2/18
缺口=real-qcloop-evidence, local-verify-gate
官方 evidence=.lime/qc/agent-qc-evidence.json status=fail scenarios=8/8
```

最新只读刷新：

```bash
npm run agent-qc:qcloop-status -- \
  --base-url "http://127.0.0.1:18080" \
  --job-id "1778405842243079000" \
  --format json \
  --output "./.lime/qc/qcloop-status.isolated-p0-full-v1-current.json"

npm run agent-qc:gui-owner-check -- \
  --format json \
  --output "./.lime/qc/gui-owner-current.json" \
  --watch-history-output "./.lime/qc/stale-owner-watch-history.jsonl"

npm run agent-qc:process-owner-check -- \
  --format json \
  --output "./.lime/qc/gui-process-owner-current.json" \
  --markdown-output "./.lime/qc/gui-process-owner-current.md"

npm run agent-qc:qcloop-db-lease -- \
  --db "./.lime/qc/qcloop-isolated-worker-preflight.db" \
  --job-id "1778405842243079000" \
  --format json \
  --output "./.lime/qc/qcloop-db-lease-isolated-p0-full-v1-latest.json" \
  --markdown-output "./.lime/qc/qcloop-db-lease-isolated-p0-full-v1-latest.md"
```

结果摘要：

```text
qcloop status=stale
counts=4 success / 1 running / 3 pending / 1 stale
active=browser-runtime-site-adapter
staleSeconds≈28020
GUI owner=blocked, ownerCount=1, staleOwnerCount=1
raw process owner=busy, activeGuiSmoke=2, cargoOrRust=4, qcloopRelated=7
DB lease sidecar=.lime/qc/qcloop-db-lease-isolated-p0-full-v1-latest.json
```

最新 GUI smoke sidecar：

```bash
LIME_AGENT_QC_PROVIDER="custom-f74b38b5-6d3f-44ef-aa0f-99d70c3482ed" \
LIME_AGENT_QC_MODEL="sensenova-6.7-flash-lite" \
npm run verify:gui-smoke -- --reuse-running --timeout-ms 240000
```

结果摘要：

```text
status=pass
evidence=.lime/qc/verify-gui-smoke-reuse-sensenova-session-restore-2026-05-11-0108.log
claw-chat-ready-streaming verdict=pass
recoveryVisibleSource=live-stream
interruptedTurnStatus=aborted
followTurnStatus=completed
```

最新 fast-mini readonly P0 sidecar：

```bash
npm run agent-qc:export-evidence -- \
  --base-url "http://127.0.0.1:18085" \
  --job-id "1778412738097137000" \
  --output "./.lime/qc/agent-qc-evidence.fastmini-readonly-p0-v1-current.json" \
  --ref "local-fastmini-readonly-p0-v1-current"
```

结果摘要：

```text
job=failed
status=fail
scenarioCount=8
fail=6
blocked=2
workspace-ready-session-restore: smoke:workspace-ready 通过，但 verify:gui-smoke 失败在 smoke:design-canvas 保存成功状态断言
release-package-startup-smoke: verify:app-version 通过，但 verify:gui-smoke 未自然收口，blocked
```

design canvas 失败细化：

```text
sidecar=.lime/qc/design-canvas-failure-fastmini-workspace-extract.json
item=workspace-ready-session-restore
stage=project-roundtrip-save-open
missingText=已保存图层设计工程
pageState=CANVAS:DESIGN 专属 GUI SMOKE / AI 图层化设计画布
classification=ui ready false positive / design canvas export no save status
```

最新 evidence-layer payload 预生成：

```bash
npm run agent-qc:qcloop-job -- \
  --risk P0 \
  --cwd "$(pwd)" \
  --name "lime-agent-qc-p0-evidence-layers-v1-2026-05-10" \
  --max-qc-rounds 1 \
  --output "./.lime/qc/qcloop-p0-evidence-layers-v1-payload.json" \
  --check
```

结果摘要：

```text
valid=true
itemCount=8
max_qc_rounds=1
8 个 P0 item 均带 evidence_layers
GUI P0 item 均带 GUI session owner / isolation statement
workspace-ready-session-restore 带 design canvas project roundtrip save/open evidence
release-package-startup-smoke 带 GUI smoke natural exit and design canvas roundtrip result
```

GUI owner 并发检查：

```bash
npm run agent-qc:gui-owner-check -- --check
```

当前预期：该命令会非 0 退出，因为仍有 active GUI owner sidecar；这不是脚本失败，而是阻止新 GUI P0 批次抢会话的正确行为。

当前 release summary gate 复核：

```bash
npm run agent-qc:release-summary -- \
  --evidence "./.lime/qc/agent-qc-evidence.json" \
  --require-scenario-manifest "docs/test/agent-qc-scenarios.manifest.json" \
  --require-risk P0 \
  --tag "local-agent-qc-audit" \
  --output "./.lime/qc/release-agent-qc.current-audit.md" \
  --check
```

结果摘要：

```text
RELEASE_SUMMARY_EXIT_STATUS=1
Agent QC release summary 状态为 fail，不能作为绿色发布证据。
```

最近一次标准校验：

```bash
npm run agent-qc:check
```

结果摘要：

```text
scenarioCount=12
p0ScenarioCount=8
guiFlowCount=4
issueCount=0
```

新增 approval / sandbox smoke：

```bash
npm run smoke:agent-runtime-approval-sandbox -- --no-write
```

结果摘要：

```text
4 组 Vitest smoke 通过：
- submit preferences approval/sandbox policy
- runtime permission / tool lifecycle projection
- permission confirmation UI recovery
- Harness tool permission / pending approval display
```

新增 approval / sandbox live runtime sidecar：

```bash
npm run smoke:agent-runtime-approval-sandbox -- \
  --timeout-ms 120000 \
  --output ".lime/qc/backend-evidence/approval-sandbox-live-current-2026-05-10/runtime-approval-sandbox-smoke.fixed.json"
```

结果摘要：

```text
status=pass
provider=deepseek
model=deepseek-v4-flash
providerSource=auto-enabled-provider
liveAssertions.devBridgeHealthy=true
liveAssertions.permissionRequestCreatedBeforeModel=true
liveAssertions.deniedDecisionClearsPendingRequest=true
liveAssertions.resolvedDecisionClearsPendingRequest=true
liveAssertions.approvalPolicySubmitted=true
liveAssertions.sandboxPolicySubmitted=true
evidence=.lime/qc/backend-evidence/approval-sandbox-live-current-2026-05-10/summary.json
scope=direct-host-backend-sidecar
```

新增 qcloop 只读状态监控：

```bash
npm run agent-qc:qcloop-status -- --base-url "http://127.0.0.1:8080" --job-id "1778398587521627000"
```

结果摘要：

```text
verdict=fail
items=6 terminal=6 nonTerminal=0
success=0 failed=1 exhausted=5 running=0 pending=0 stale=0
claw-chat-ready-streaming evidenceStatus=blocked, worker stdout 包含 QCLOOP_WORKER_RESULT=BLOCKED
tool-approval-sandbox-boundary qcloopStatus=failed，但 worker stdout 自报 PASS 与 verifier feedback 冲突，不能作为 P0 pass
```

宿主 DevBridge 恢复检查：

```bash
npm run bridge:health -- --timeout-ms 120000 --interval-ms 2000
npm run agent-qc:qcloop-preflight -- --expected-cwd "$(pwd)" --require-devbridge --timeout-ms 30000 --check
```

结果摘要：

```text
bridge:health status=ok
QCLOOP_PREFLIGHT_RESULT=PASS
devbridge-health PASS: status=ok
sidecar=.lime/qc/qcloop-devbridge-health-restored.json
```

qcloop 内层 worker DevBridge preflight：

```bash
job=1778403715309891000
npm run agent-qc:qcloop-status -- --base-url "http://127.0.0.1:8080" --job-id "$job" --format json --output "./.lime/qc/qcloop-status.worker-devbridge-preflight.json"
```

结果摘要：

```text
job=completed
item=exhausted
evidenceStatus=blocked
worker stdout: QCLOOP_PREFLIGHT_RESULT=BLOCKED, devbridge-health BLOCKED: fetch failed
worker stdout: QCLOOP_WORKER_RESULT=BLOCKED
```

隔离 qcloop worker preflight 与 P0 sidecar：

```bash
# isolated qcloop server: 127.0.0.1:18080
# db: .lime/qc/qcloop-isolated-worker-preflight.db
npm run agent-qc:qcloop-status -- --base-url "http://127.0.0.1:18080" --job-id "1778404260108641000" --format json --output "./.lime/qc/qcloop-status.isolated-worker-devbridge-preflight-v2.json"
npm run agent-qc:qcloop-status -- --base-url "http://127.0.0.1:18080" --job-id "1778404364137496000" --format json --output "./.lime/qc/qcloop-status.isolated-workspace-ready.json"
npm run agent-qc:qcloop-status -- --base-url "http://127.0.0.1:18080" --job-id "1778404601640847000" --format json --output "./.lime/qc/qcloop-status.isolated-browser-runtime-site-adapter.json"
npm run agent-qc:qcloop-status -- --base-url "http://127.0.0.1:18080" --job-id "1778404743505029000" --format json --output "./.lime/qc/qcloop-status.isolated-skill-forge.json"
npm run agent-qc:qcloop-status -- --base-url "http://127.0.0.1:18080" --job-id "1778405385701480000" --format json --output "./.lime/qc/qcloop-status.isolated-release-startup-v2.json"
npm run agent-qc:qcloop-status -- --base-url "http://127.0.0.1:18080" --job-id "1778405842243079000" --format json --output "./.lime/qc/qcloop-status.isolated-p0-full-v1-current.json"
npm run agent-qc:qcloop-status -- --base-url "http://127.0.0.1:18080" --job-id "1778405842243079000" --stale-minutes 1 --format json --output "./.lime/qc/qcloop-status.isolated-p0-full-v1-stale-check.json"
```

结果摘要：

```text
isolated-worker-devbridge-preflight-v2=complete
isolated-workspace-ready=complete
isolated-browser-runtime-site-adapter=complete
isolated-skill-forge=complete
isolated-release-startup-v1=blocked，因为宿主 127.0.0.1:3030 再次断开
isolated-release-startup-v2=complete，source-tree startup smoke 通过，未声明 installer artifact 验证
isolated-p0-full-v1=stale sidecar，4/8 success，browser-runtime-site-adapter running 且无 stdout/stderr，3 pending
```

Runtime tool surface smoke：

```bash
npm run smoke:agent-runtime-tool-surface
```

结果摘要：

```text
runtime tool surface：6 tests pass
runtime inventory：49 tests pass
```

宿主 browser runtime / site adapter 直接检查：

```bash
npm run agent-qc:qcloop-preflight -- --expected-cwd "$(pwd)" --require-devbridge --timeout-ms 30000 --check
npm run smoke:browser-runtime
npm run smoke:site-adapters
```

结果摘要：

```text
QCLOOP_PREFLIGHT_RESULT=PASS
smoke:browser-runtime exit=0；session 创建与 attach/status 通过；cleanup warning: close_cdp_session 未找到 session
smoke:site-adapters exit=0；catalog/list/recommend/search 通过，adapters=11
```

该直接检查只能证明宿主产品命令可跑；不能替代 qcloop full P0 job 的 verifier 证据。

宿主 harness replay 直接检查：

```bash
npm run harness:eval
npm run harness:eval:trend
```

结果摘要：

```text
harness:eval exit=0；2 cases ready / invalid=0 / current observability gap=0 / degraded observability gap=1
harness:eval:trend exit=0；samples=1；只能形成 trend seed，不能判断长期退化
```

该直接检查只能证明 harness 命令可跑；不能替代 qcloop full P0 job 的 verifier 证据。

宿主 workspace / release source-tree 直接检查：

```bash
npm run smoke:workspace-ready
npm run verify:app-version
npm run verify:gui-smoke -- --reuse-running
```

结果摘要：

```text
smoke:workspace-ready exit=0；DevBridge ready，workspaceCount=104，repaired=false，relocated=false
verify:app-version exit=0；版本一致性通过: 1.32.0
verify:gui-smoke exit=0；workspace ready、browser runtime、site adapters、service skill entry、runtime tool surface、knowledge GUI、design canvas 均通过
```

该直接检查只能证明宿主 source-tree 路径可跑；不能替代 installer artifact 验证，也不能替代 qcloop full P0 verifier。

## 4. 当前 qcloop 状态

v4 job：`1778392677659787000`（completed / fail）

v5 job：`1778398587521627000`（completed / fail）

worker preflight job：`1778403715309891000`（completed / blocked sidecar）。它是在宿主 DevBridge 已恢复后创建的只读 job，只验证 qcloop 内层 worker 是否能访问 Lime cwd、tmp 和 `127.0.0.1:3030/health`。结果为 cwd/tmp 通过、DevBridge health `fetch failed`，因此后续 P0 重跑前必须先在安全窗口修复 qcloop serve 的 Codex sandbox / loopback 权限；不能直接把宿主 health pass 当作 qcloop P0 可运行。

isolated qcloop sidecar jobs：

| Job | 场景 | 状态 | 结论 |
| --- | --- | --- | --- |
| `1778404260108641000` | worker DevBridge preflight v2 | `completed` / `success` | 正确 sandbox 配置下 worker 可访问 DevBridge |
| `1778404364137496000` | `workspace-ready-session-restore` | `completed` / `success` | `smoke:workspace-ready` 与 `verify:gui-smoke -- --reuse-running` 通过 |
| `1778404601640847000` | `browser-runtime-site-adapter` | `completed` / `success` | `smoke:browser-runtime` 与 `smoke:site-adapters` 通过 |
| `1778404743505029000` | `skill-forge-register-bind-enable` | `completed` / `success` | `test:contracts` 与 `smoke:agent-service-skill-entry` 通过 |
| `1778404882904047000` | `release-package-startup-smoke` v1 | `failed` / `blocked` | 宿主 DevBridge 再次断开，preflight blocked，未执行版本 / GUI smoke |
| `1778405385701480000` | `release-package-startup-smoke` v2 | `completed` / `success` | worker preflight、版本一致性与 `verify:gui-smoke -- --reuse-running` 通过；scope 为 `source-tree-startup-smoke` |
| `1778405842243079000` | full P0 v1 | `running` / stale sidecar | 4/8 success；`browser-runtime-site-adapter` running 无 stdout/stderr，`codex exec` 进程仍在；`workspace-ready-session-restore`、`harness-replay-regression`、`release-package-startup-smoke` pending；最新 `staleSeconds=8002` |
| `1778410893606889000` | no-MCP full P0 v1 | `failed` / blocked sidecar | `QCLOOP_CODEX_BIN` 指向坏 symlink，属于 worker CLI 环境阻断，不是产品失败 |
| `1778410956075020000` | no-MCP full P0 v2 | `running` / sidecar | 正确 Codex bin + `mcp_servers={}` 尝试；当前 2 success、1 failed、1 running、4 pending；`tool-approval-sandbox-boundary` failed，`skill-forge-register-bind-enable` running |
| `1778412160003934000` | MCP-disabled full P0 v1 | `running` / stale sidecar | 正确 Codex bin + 已知 MCP command 置空；初始 `ps` 未观察到用户级 MCP 子进程；`command-bridge-contract` failed；`claw-chat-ready-streaming` running 且 stale 约 674 秒，后续 6 个 P0 pending |
| `1778412499745993000` | fast full P0 v1 | `running` / sidecar | 正确 Codex bin + MCP command 置空 + `--ignore-rules`；`command-bridge-contract` success；`claw-chat-ready-streaming` running，后续 6 个 P0 pending |
| `1778412738097137000` | fast-mini readonly full P0 v1 | `failed` / fail sidecar | gpt-5.4-mini + low reasoning + MCP command 置空 + `--ignore-rules` + 只读 prompt + `max_qc_rounds=1`；8 exhausted；sidecar evidence 为 6 fail / 2 blocked |

| Scenario | 状态 | 证据结论 |
| --- | --- | --- |
| `claw-chat-ready-streaming` | default `exhausted` / evidence `blocked`；isolated full sidecar `success` with shallow scope | default worker 明确输出 `QCLOOP_WORKER_RESULT=BLOCKED`；isolated full v1 已通过 GUI smoke / DevBridge / runtime surface，但 stdout 明确缺 live long-turn interrupt transcript；同日 deep flow 仍有 product backend blocker |
| `tool-approval-sandbox-boundary` | default `failed` / evidence `fail`；isolated full sidecar `success` with deterministic scope | default worker stdout 自报 `QCLOOP_WORKER_RESULT=PASS` 但 qcloop exit `-1` / verifier 仍判缺 live runtime transcript；isolated full v1 已通过 tool surface + approval sandbox smoke，但不是 live long-turn transcript |
| `skill-forge-register-bind-enable` | default `exhausted` / evidence `blocked`；isolated sidecar `success` | default worker 多轮均停在 DevBridge preflight blocked；isolated single场景与 full v1 均已通过 contracts + service skill entry smoke |
| `browser-runtime-site-adapter` | `exhausted` / evidence `blocked` | worker 明确输出 `QCLOOP_WORKER_RESULT=BLOCKED`，多轮均停在 DevBridge preflight blocked，未进入 browser session / adapter catalog / cleanup 主链 |
| `workspace-ready-session-restore` | v5 `exhausted` / evidence `blocked`；fast-mini readonly `exhausted` / evidence `fail` | fast-mini worker 明确 `smoke:workspace-ready` 通过，但 `verify:gui-smoke` 失败在 `smoke:design-canvas` 保存成功状态断言，命中 `ui ready false positive` 风险；不能用旧 isolated pass 覆盖当前 release 证据 |
| `release-package-startup-smoke` | default qcloop `exhausted` / evidence `blocked`；isolated source-tree sidecar `success` | v5 多轮 worker 未提供版本、GUI smoke、首屏 ready、Bridge health、waiver 和失败模式排除证据，最终 exhausted；隔离 v2 已证明 source-tree startup smoke 通过，但不是同一全量官方 P0 Evidence Pack |

sidecar evidence：`.lime/qc/agent-qc-evidence.p0-rerun-v5-completed.json`（从 completed v5 导出；`p0-rerun-v5-current.json` 已同步为同一状态）

```text
status=fail
scenarioCount=6
1 failed / 5 exhausted-or-blocked / 0 running / 0 pending / 0 pass
```

该 sidecar 只用于排障，不能覆盖官方 `.lime/qc/agent-qc-evidence.json`。v4 completed sidecar `.lime/qc/agent-qc-evidence.p0-rerun-v4-completed.json` 仍保留为 fail 排障证据。

已生成后续单场景重跑 payload：`.lime/qc/qcloop-tool-approval-sandbox-rerun-payload.json`，包含 `smoke:agent-runtime-tool-surface`、新增 `smoke:agent-runtime-approval-sandbox`，以及带 `{{stdout}}` / `{{attempt_status}}` / `{{exit_code}}` 的 verifier prompt。`agent-qc:qcloop-job --check` 现在也会校验这些占位符。该单场景 payload 尚未提交；v5 已使用新的 6 场景 payload 先跑完整剩余 P0。

同时生成了全量 P0 重跑 payload：`.lime/qc/qcloop-p0-rerun-with-verifier-evidence-payload.json`，覆盖 8 个 P0 场景，verifier prompt 同样带 stdout / exit code 占位符。

本轮追加准备、提交并启动了当前 6 个未通过 / 未完成 P0 的 v5 重跑 payload：`.lime/qc/qcloop-p0-rerun-v5-verifier-evidence-ready-payload.json`，新 job 为 `1778398587521627000`。payload 已通过 `agent-qc:qcloop-job --check`，确认 worker prompt 含 preflight，verifier prompt 含 `{{stdout}}` / `{{attempt_status}}` / `{{exit_code}}`。首个场景已证明 qcloop worker 基础 preflight PASS，但 DevBridge preflight BLOCKED。只读环境侧证据已写入 `.lime/qc/qcloop-executor-env-20260510.json`：qcloop serve 进程当前未设置 `QCLOOP_CODEX_SANDBOX=off` / bypass / approval policy。

v5 completed 后补充了宿主 DevBridge health 证据：`.lime/qc/qcloop-devbridge-health-after-v5.json` 显示宿主 shell 直连 `http://127.0.0.1:3030/health` 失败，且 3030 无监听。随后本轮通过 `npm run tauri:dev:headless` 恢复了宿主 DevBridge，恢复证据写入 `.lime/qc/qcloop-devbridge-health-restored.json`；但默认 qcloop worker preflight job `1778403715309891000` 仍证明默认 qcloop serve 的内层 worker 无法访问 DevBridge。

隔离 qcloop server `127.0.0.1:18080` 使用显式 sandbox 配置后，worker preflight 与 4 个 P0 sidecar 已通过，说明 worker 权限问题可以被环境修复。`release-package-startup-smoke` v2 已在 source-tree scope 下通过，但当前仍不能直接写官方 Evidence Pack，因为还缺同一批次 8/8 P0 success，且 installer artifact 未验证。

## 5. 完成判定

当前整体目标 **未完成**。

原因：官方 P0 qcloop Evidence Pack 仍为 `fail`。v5 重跑已 completed / fail，isolated full P0 v1 仍 stale，no-MCP full P0 v2 已出现 failed item，MCP-disabled / fast full P0 批次仍 running 或 stale，fast-mini readonly full P0 已 terminal failed，尚未形成 8/8 verifier success。fast-mini readonly P0 sidecar 还暴露了 `workspace-ready-session-restore` 的 GUI smoke 子项失败。即使文档、manifest、GUI flow、release gate、approval/sandbox smoke 都已经落地，也不能把这些 proxy signal 或 partial sidecar 当作真实 P0 pass。

关闭条件保持不变：

1. qcloop P0 批次覆盖全部 8 个 P0 scenario id。
2. `.lime/qc/agent-qc-evidence.json` 的 `verdict.status` 为 `pass`。
3. release summary 以 `--require-scenario-manifest docs/test/agent-qc-scenarios.manifest.json --require-risk P0 --check` 通过。
4. `npm run agent-qc:audit -- --format json` 返回 `complete`。

## 6. 下一刀

1. 保留宿主 DevBridge 恢复、默认 worker blocked、isolated worker pass、4 个 P0 isolated pass 与 release v1 blocked / v2 pass sidecar，不覆盖官方 evidence。
2. 继续只读观察 isolated full P0 v1、no-MCP v2、MCP-disabled v1、fast v1；fast-mini readonly v1 已 terminal failed，只保留 sidecar evidence，不覆盖官方 evidence。
3. 优先确认 GUI P0 是否存在并发干扰：当前仍有多个 running/stale GUI qcloop sidecar，新的 payload 已要求 GUI worker 输出 session owner / isolation statement。只有确认单一 GUI owner 后，`smoke:design-canvas` 失败才可直接归为产品回归。
4. 在单一 GUI owner 前提下，定位 `workspace-ready-session-restore` 中 `smoke:design-canvas` 保存成功状态断言失败；这是 qcloop worker 内已经捕获的 GUI P0 signal，不能被旧 isolated pass 覆盖。当前已确认缺的是 `已保存图层设计工程` 可观察状态，下一步应判断导出按钮点击后是状态未渲染、导出流程卡住，还是断言文本与产品文案漂移。
5. 当前 running/stale 批次自然结束后，优先使用 `.lime/qc/qcloop-p0-evidence-layers-v1-payload.json` 作为下一轮只读 P0 payload；该 payload 明确 `evidence_layers` 且 `max_qc_rounds=1`，避免 worker 把 deterministic smoke 伪装成 deep evidence。
6. 把 `tool-approval-sandbox-boundary` 拆成更窄的 runtime transcript / evidence JSON 场景，避免确定性 smoke 与 live runtime 证据混在同一个 verifier 口径里。
7. 环境阻断解除后，再修复 `claw-chat-ready-streaming` 的 stop / interrupt 后端语义，并重跑 GUI deep flow 与 qcloop 场景。


## 8. 2026-05-10 20:28 增量审计

当前机器审计命令：

```bash
node scripts/agent-qc-completion-audit.mjs --format json > ".lime/qc/agent-qc-audit-current.json"
```

结果摘要：

```text
status=incomplete
passed=16/17
failed=1/17
唯一缺口=real-qcloop-evidence
```

新增或收紧的 checklist 项：

| 检查项 | 证据 | 当前状态 |
| --- | --- | --- |
| `structured-evidence-contract` | `docs/tests/lime-agent-qc-evidence-contract.md`、qcloop worker prompt、verifier prompt、`agent-qc:export-evidence`、`agent-qc:release-summary` | PASS：`doc=true worker=true verifier=true strictJson=true exporter=true release=true` |
| `stale-owner-intervention-protocol` | `docs/tests/lime-agent-qc-stale-owner-intervention.md`、`docs/tests/lime-agent-qc-qcloop-operations.md` | PASS：已定义只读取证、owner 确认格式和 post-clear rerun runbook |
| release structured evidence gate | `scripts/lib/agent-qc-release-summary-core.mjs` / `scripts/lib/agent-qc-release-summary-core.test.ts` | PASS：pass 场景若只有 `qcloop:*` evidenceRefs 会被 release summary 阻断 |
| Evidence exporter structured summary gate | `scripts/lib/agent-qc-evidence-core.mjs` / `scripts/lib/agent-qc-evidence-core.test.ts` | PASS：qcloop `success` item 缺 `QCLOOP_EVIDENCE_SUMMARY_JSON` 或 JSON 无法解析时导出为 `fail` |
| GUI owner stale detail | `scripts/lib/agent-qc-gui-owner-core.mjs` / `.lime/qc/gui-owner-current.json` | PASS：报告 `staleOwnerCount=1`、`oldestStaleSeconds=9543`，nextAction 要求只读观察或 owner 确认 |
| post-stale rerun plan | `.lime/qc/post-stale-owner-rerun-plan.md`、`.lime/qc/qcloop-p0-structured-evidence-v1-payload.json` | PASS sidecar：payload `valid=true`、`itemCount=8`、`maxQcRounds=1`，未提交 qcloop job |

当前唯一 blocker 仍是官方 P0 Evidence Pack：

```text
.lime/qc/agent-qc-evidence.json status=fail
qcloop-status.isolated-p0-full-v1-current.json verdict=stale success=4 running=1 pending=3 stale=1
qcloop-status.isolated-p0-full-v1-stale-check.json verdict=stale success=4 running=1 pending=3 stale=1
```

只读进程核查显示 stale owner 背后仍有真实内层 worker：

```text
PID=69738
process=codex exec
scenario=browser-runtime-site-adapter
workerDurationSeconds≈9543
stdoutLength=0
stderrLength=0
```

因此当前仍不得：

- 覆盖 `.lime/qc/agent-qc-evidence.json`。
- 启动新的 full GUI P0 批次。
- kill / pause / interrupt PID `69738` 或 qcloop serve。
- 调用 `update_goal(status="complete")`。

关闭条件保持不变：owner 明确处理或自然释放 stale worker 后，`agent-qc:gui-owner-check -- --check` 必须通过；随后用 `.lime/qc/qcloop-p0-structured-evidence-v1-payload.json` 或重新生成的等价 payload 跑出 8/8 P0 structured evidence pass，再执行 `agent-qc:export-evidence`、`agent-qc:release-summary --check` 和 `agent-qc:audit`。

### 2026-05-10 20:32 payload retry control update

`agent-qc:qcloop-job` 已支持 `--max-executor-retries`，`docs/test/agent-qc-scenarios.manifest.json` 设置 `recommendedMaxExecutorRetries=0`。当前 post-stale P0 structured payload 重新生成后：

```text
valid=true
itemCount=8
max_qc_rounds=1
max_executor_retries=0
```

该设置用于发布证据批次：不自动重试内层 CLI，避免当前 stale owner 问题未解决时重复制造孤儿 worker。若 owner 明确需要基础设施重试，必须在隔离环境中显式改为 1。

### 2026-05-10 20:40 只读状态复核

本轮遵守用户要求：不 push、不 commit、不终止或重启其他正在运行的进程。只读刷新结果如下：

```text
agent-qc:audit status=incomplete
passed=16/17
failed=1/17
唯一缺口=real-qcloop-evidence
```

`1778405842243079000` 仍是当前唯一 active GUI qcloop owner：

```text
job status=running
verdict=stale
counts=8 total / 4 success / 1 running / 3 pending / 1 stale
active scenario=browser-runtime-site-adapter
worker durationSeconds=10508
worker stdoutLength=0
worker stderrLength=0
observed PID=69738
process=codex exec
```

`agent-qc:gui-owner-check` 当前输出：

```text
ownerCount=1
staleOwnerCount=1
oldestStaleSeconds=10508
verdict=blocked
```

release summary gate 也按预期保持阻断：

```text
RELEASE_SUMMARY_EXIT_STATUS=1
summary=Agent QC release summary 状态为 fail，不能作为绿色发布证据
structured evidenceRefs missing=command-bridge-contract, harness-replay-regression
```

因此当前可做动作仍然只有：

- 继续只读观察并刷新 sidecar。
- 更新 `docs/tests` 运行手册、审计文档和 stale owner request。
- 等 owner 明确确认或 stale worker 自然释放后，再执行 post-stale P0 structured evidence runbook。

当前仍不得：

- 覆盖 `.lime/qc/agent-qc-evidence.json`。
- 启动新的 full GUI P0 批次。
- kill / pause / interrupt PID `69738` 或 qcloop serve。
- 把任何 isolated partial pass 写成 release pass。
- 调用 `update_goal(status="complete")`。

### 2026-05-10 20:44 只读续刷

状态未自然释放。`.lime/qc/qcloop-status.isolated-p0-full-v1-current.json` 更新后仍显示 `verdict=stale`、`4 success / 1 running / 3 pending / 1 stale`，`browser-runtime-site-adapter staleSeconds=10772`，worker stdout/stderr 仍为 `0 / 0`。`.lime/qc/gui-owner-current.json` 更新后仍显示 `ownerCount=1`、`staleOwnerCount=1`、`oldestStaleSeconds=10772`、`verdict=blocked`。`ps` 仍可见 PID `69738` 的内层 `codex exec`，本轮未执行 kill / pause / interrupt。

### 2026-05-10 20:48 DB / lease 取证

只读新增 `.lime/qc/qcloop-db-lease-isolated-p0-full-v1.md`。SQLite 显示 active item `1778405842246191000` 仍为 `running`，`lock_owner=qcloop-worker-1`，`lock_expires_at=2026-05-10T21:02:05+08:00`；active attempt `dc625f8e-b3b9-46b7-9758-4b0273438d50` 从 `2026-05-10T17:45:05+08:00` 开始后仍未完成，stdout/stderr 长度为 `0 / 0`。进程树显示 PID `69738` 的 PPID 已变为 `1`，仍在 qcloop serve 的 PGID `69307` 中，并带有 Playwright MCP / Context7 MCP 子进程。该证据支持当前卡点是 qcloop worker / inner MCP startup no-output hang，而不是可直接放行的产品 P0 pass。

### 2026-05-10 20:52 qcloop runtime binary provenance

只读新增 `.lime/qc/qcloop-runtime-binary-provenance-18080.md`。`lsof` 显示当前 18080 qcloop serve PID `69307` 运行的是 `/Users/coso/Documents/dev/ai/limecloud/qcloop/qcloop`，SHA-256 为 `177bf7fa79212d065c5cb6cc5cdbb153d3079cec3252a157993f70ab35dc5fe1`；已构建的 `.lime/qc/bin/qcloop-timeout-fixed` SHA-256 为 `2895e33d068a7109607d3e45b6e3bebe1807b6f71d387a3b62eb669a3d4314c7`。两者大小、mtime 和 checksum 均不同，说明 timeout / process-group cleanup fix 尚未作用于当前 running serve 或 PID `69738`。

### 2026-05-10 20:54 owner decision packet

只读新增 `.lime/qc/stale-owner-intervention-request.json`，并在 `docs/tests/lime-agent-qc-stale-owner-intervention.md` 中登记为机器可读决策包。该 JSON 汇总 job、active item、DB lease、PID、binary provenance、证据引用、禁止动作和确认文本；它只用于 owner 决策，不等于授权。本轮仍没有执行 kill / pause / interrupt / restart。

### 2026-05-10 21:02 lease 过期窗口后复核

只读新增 `.lime/qc/qcloop-db-lease-isolated-p0-full-v1-after-expiry.md`。等待超过先前记录的 `lock_expires_at=2026-05-10T21:02:05+08:00` 后，qcloop status 仍为 `stale`，`browser-runtime-site-adapter staleSeconds=11845`，stdout/stderr 仍为 `0 / 0`；SQLite 显示 active item 仍为 `running`，但 `lock_expires_at` 已延长到 `2026-05-10T21:17:05+08:00`；PID `69738` 仍存活且 PPID 为 `1`。这证明当前 owner 没有自然释放，qcloop 仍在维持 lease heartbeat。

### 2026-05-10 21:05 GUI owner decision output

`agent-qc:gui-owner-check -- --format json` 已在 stale owner 场景输出 `ownerIntervention` 字段，包含 `requiredConfirmationText`、`prohibitedUntilConfirmed`、`evidenceRefs` 和下一步动作。定向测试 `npx vitest run scripts/lib/agent-qc-gui-owner-core.test.ts` 通过 `6/6`；当前 `.lime/qc/gui-owner-current.json` 显示 `ownerIntervention.status=requires_owner_confirmation`。该字段只用于机器可读提醒，不等于 owner 已授权。

2026-05-10 21:08 追加审计收紧：`agent-qc:audit` 的 `stale-owner-intervention-protocol` 现在同时检查 `ownerIntervention` 机器可读输出和文档中的 decision packet 说明。定向测试 `npx vitest run scripts/lib/agent-qc-completion-audit-core.test.ts scripts/lib/agent-qc-gui-owner-core.test.ts` 通过 `20/20`；当前审计项证据为 `doc=true operations=true ownerIntervention=true docDecisionPacket=true`。

### 2026-05-10 21:10 stale owner watch history

只读新增 `.lime/qc/stale-owner-watch-history.jsonl`，以 JSONL 记录 stale owner 的观察序列：20:44 GUI owner blocked、20:48 DB lease 到 21:02、21:02 lease 延长到 21:17。该 sidecar 只用于证明持续 heartbeat / no-output hang，不构成处理授权。

2026-05-10 21:18 续刷：超过第二个 lease 窗口后，qcloop status 仍为 `stale`，`browser-runtime-site-adapter staleSeconds=12753`，stdout/stderr 仍为 `0 / 0`；SQLite 显示 `lock_expires_at=2026-05-10T21:32:05+08:00`，PID `69738` 仍存活。该观察已追加到 `.lime/qc/stale-owner-watch-history.jsonl`，当前 entries=4。

2026-05-10 21:21 追加脚本化 watch history：`agent-qc:gui-owner-check` 支持 `--watch-history-output`，并已用该参数追加 `.lime/qc/stale-owner-watch-history.jsonl`，当前 entries=5。定向测试 `npx vitest run scripts/lib/agent-qc-gui-owner-core.test.ts scripts/lib/agent-qc-completion-audit-core.test.ts` 通过 `21/21`。

2026-05-10 21:23 追加 audit gate 收紧：`agent-qc:audit` 的 `stale-owner-intervention-protocol` 现在同时检查 watch history 输出能力和 stale owner 文档中的 watch history 说明。定向测试 `npx vitest run scripts/lib/agent-qc-completion-audit-core.test.ts scripts/lib/agent-qc-gui-owner-core.test.ts` 通过 `22/22`；当前证据为 `doc=true operations=true ownerIntervention=true docDecisionPacket=true watchHistory=true docWatchHistory=true`。

2026-05-10 21:32 续刷：超过第三个 lease 窗口后，qcloop status 仍为 `stale`，`browser-runtime-site-adapter staleSeconds=13657`，stdout/stderr 仍为 `0 / 0`；SQLite 显示 `lock_expires_at=2026-05-10T21:47:05+08:00`，PID `69738` 仍存活。该观察通过 `agent-qc:gui-owner-check -- --watch-history-output` 追加到 `.lime/qc/stale-owner-watch-history.jsonl`，当前 entries=6。

2026-05-10 21:34 追加契约门禁复核：`npm run test:contracts` 通过，覆盖 `check:agent-runtime-clients`、command contracts、harness contracts、modality runtime contracts、harness cleanup report contract 与 `agent-qc:check`。这证明本轮 Agent QC 脚本 / audit / GUI owner 变更没有破坏仓库契约门禁，但仍不能替代真实 8/8 P0 qcloop Evidence Pack。

2026-05-10 21:36 追加 `verify:local` 复核：`npm run verify:local` 在 `typecheck` 阶段失败，错误为 `src/components/settings-v2/system/channels/ChannelLogTailPanel.test.tsx(129,51): error TS2345: Argument of type 'number' is not assignable to parameter of type 'Timeout'.` 该文件不属于本轮 Agent QC docs / scripts 修改范围，且当前工作树存在其他活动变更；本轮未尝试修复。sidecar 见 `.lime/qc/verify-local-2026-05-10-2136.md`。这意味着除 `real-qcloop-evidence` 主缺口外，仓库级 `verify:local` 当前也不是绿色。

2026-05-10 21:38 追加只读排查：`git status` 显示 `src/components/settings-v2/system/channels/ChannelLogTailPanel.test.tsx` 是 untracked，相关 `ChannelLogTailPanel.tsx` 已 modified；失败行是 `vi.spyOn(window, "setInterval").mockReturnValue(0);`。由于该文件不属于本轮 Agent QC docs / scripts 修改范围，且当前工作树存在其他活动变更，本轮仍未修改。sidecar 见 `.lime/qc/verify-local-channel-log-tail-investigation.md`。

2026-05-10 21:48 追加版本变更只读观察：npm 输出显示当前包版本为 `lime@1.33.0`。只读检查显示 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 均为 `1.33.0`，且 `package-lock.json` / `src-tauri/Cargo.lock` 也处于 modified 状态。`npm run verify:app-version` 通过，版本一致性为 `1.33.0`。本轮未修改版本文件；sidecar 见 `.lime/qc/version-change-observation-2026-05-10-2148.md`。

2026-05-10 21:52 追加 local verify gate：`.lime/qc/verify-local-current.json` 记录 `npm run verify:local` 当前为 `fail`，失败阶段 `typecheck`。`agent-qc:audit` 现在新增 `local-verify-gate`，要求仓库统一本地校验为 pass；定向测试 `npx vitest run scripts/lib/agent-qc-completion-audit-core.test.ts scripts/lib/agent-qc-gui-owner-core.test.ts` 通过 `23/23`。当前 completion audit 变为 `16/18`，缺口为 `real-qcloop-evidence` 与 `local-verify-gate`。

### 2026-05-10 20:54 补充审计记录：Agent UI manual Playwright evidence

- 新增 evidence：`.lime/qc/gui-evidence/agent-ui-manual-e2e-2026-05-10/summary.json`。
- 覆盖 UI surface：home、new task workspace、Skills catalog、Skill preflight、Skills search、capability drafts、registered skills、input enabled state、knowledge popover、advanced settings。
- 结果：manual Agent UI flow 为 `pass_with_findings`；console `0 error / 0 warning`；非静态 network `194/194` HTTP `200`。
- 发现：本轮没有复现 `Agent 1000` 标签；新增 3 个产品化发现，其中 `skill-preflight-memory-internals-visible` 为 medium，建议后续隐藏或改写内部记忆标签与历史错误片段。
- 审计影响：该证据加强 `real-gui-evidence`，但不改变 `real-qcloop-evidence` 状态；当前 audit 仍应保持 `incomplete`，唯一主缺口仍为官方 P0 qcloop Evidence Pack 未 pass。

### 2026-05-10 21:10 补充审计记录：Skill reference sanitization fix

- 修复 evidence：`.lime/qc/gui-evidence/skill-preflight-reference-sanitized-2026-05-10/summary.json`。
- 代码：`src/components/agent/chat/utils/curatedTaskReferenceSelection.ts`。
- 回归：`src/components/agent/chat/utils/curatedTaskReferenceSelection.test.ts`、`src/components/agent/chat/components/CuratedTaskLauncherDialog.test.tsx`。
- 验证：定向 Vitest `18/18` 通过；定向 ESLint 通过；`npm run typecheck` 通过；Playwright 复测 `auto_analysis/-32603/Pexels API Key/fp:/task_id` 均未出现在 Skill 补参卡用户可见文本中。
- 审计影响：修复了 20:54 manual Playwright 发现的 medium 产品 UI/UX 信息外露；不影响 `agent-qc:audit` 的 `real-qcloop-evidence` 主缺口，整体仍不能标记 complete。

### 2026-05-10 21:17 补充审计记录：Skills search local-hit empty state fix

- 修复 evidence：`.lime/qc/gui-evidence/skills-search-local-hit-2026-05-10/summary.json`。
- 代码：`src/components/skills/SkillsWorkspacePage.tsx`。
- 回归：`src/components/skills/SkillsWorkspacePage.test.tsx`。
- 验证：SkillsWorkspacePage 定向 Vitest `31/31` 通过；定向 ESLint 通过；`npm run typecheck` 通过；Playwright 搜索 `cover` 验证 `cover_generate` 可见，旧全局无结果文案不可见，新文案正确指向右侧可用 Skill。
- 审计影响：修复了 20:54 manual Playwright 发现的 low 产品 UI/UX 误导；不改变 `agent-qc:audit` 的 `real-qcloop-evidence` 主缺口，整体仍不能标记 complete。

### 2026-05-10 21:28 补充审计记录：Advanced settings Plan label localization fix

- 修复 evidence：`.lime/qc/gui-evidence/advanced-settings-plan-label-cn-2026-05-10/summary.json`。
- 代码：`src/components/agent/chat/components/Inputbar/components/InputbarExecutionStrategySelect.tsx`。
- 回归：`src/components/agent/chat/components/Inputbar/index.test.tsx`、`src/components/agent/chat/components/EmptyStateComposerPanel.test.tsx`、`src/components/agent/chat/components/EmptyState.test.tsx`。
- 验证：定向 Vitest `146/146` 通过；定向 ESLint 通过；`npm run typecheck` 通过；`npm run bridge:health -- --timeout-ms 30000` 通过；Playwright 展开高级设置后显示 `计划执行`，`aria-label` / `title` 为 `开启计划执行`，页面正文不再出现独立 `Plan`、`Plan 模式` 或 `开启/关闭 Plan` 文案。
- 审计影响：修复了 20:54 manual Playwright 发现的 low 产品 UI/UX polish；不改变 `agent-qc:audit` 的 `real-qcloop-evidence` 主缺口，整体仍不能标记 complete。

### 2026-05-10 21:35 补充审计记录：Prompt-to-artifact checklist 与 Design Canvas 复核

本次继续执行前，按用户目标“不要只测 Agent UI；看到的后端或产品 UI/UX 问题都要测试并解决”做 prompt-to-artifact 对照：

| 明确要求 / 成功标准 | 现有或新增证据 | 覆盖结论 |
| --- | --- | --- |
| 不只覆盖 Agent UI 表层 | `12` 到 `24` Claw cancel / recovery evidence、`runtime-approval-sandbox-smoke.json`、browser runtime / site adapter sidecar、workspace / release sidecar、Design Canvas smoke | PARTIAL PASS：覆盖了后端 runtime、approval/sandbox、browser runtime、workspace、release source-tree 与 Design Canvas，但仍缺同批次 full P0 qcloop pass |
| 普通用户 Agent UI / Skills 全路径可交互 | `.lime/qc/gui-evidence/agent-ui-manual-e2e-2026-05-10/summary.json` | PASS with findings：已后续修复 3 个 UI/UX 问题 |
| 看到的 UI/UX 问题要修 | `skill-preflight-reference-sanitized`、`skills-search-local-hit`、`advanced-settings-plan-label-cn` 三个 evidence 目录与对应 Vitest / ESLint / typecheck | PASS：已修复信息外露、搜索空态误导、高级设置内部英文标签 |
| 后端 cancel / recovery 问题要修 | `docs/exec-plans/evidence/product-backend-ux-e2e-2026-05-10/24-claw-cancel-sensenova-clean-console-summary.json` 及 runtime/thread evidence | PASS sidecar：long turn 为 `aborted`，follow-up 不被旧输出污染；仍需官方 qcloop 同批次采信 |
| approval / sandbox 边界要有 transcript 级证据 | `.lime/qc/runtime-approval-sandbox-smoke.json`，`transcriptKind=verified_projection_and_live_runtime_transcript` | PASS sidecar：包含 live runtime permission confirmation transcript；仍非官方 full P0 pack |
| Design Canvas 保存状态旧失败要复核 | 新增 `.lime/qc/gui-evidence/design-canvas-project-roundtrip-current-2026-05-10/summary.json`；`npm run smoke:design-canvas -- --timeout-ms 180000` 通过 | PASS sidecar：当前 host 下 `project-roundtrip-save-open` 可通过，无需代码修复 |
| Harness Replay / Eval 后端回归要复核 | 新增 `.lime/qc/backend-evidence/harness-replay-regression-current-2026-05-10/summary.json`；`npm run harness:eval:json` 与 `npm run harness:eval:trend:json` 通过；history record 已生成第一条真实 baseline | PASS with limitation：当前 eval 可运行且 current gap 为 0；trend `sampleCount=1` 仍只是 seed |
| 不与隔壁 v0.6 / qcloop GUI owner 冲突 | `npm run agent-qc:gui-owner-check -- --check` 仍 blocked；本轮未 kill / pause / interrupt PID `69738`，未启动新 full GUI P0 | PASS：遵守不抢 owner |
| 官方发布前 Evidence Pack 必须真实 pass | `node scripts/agent-qc-completion-audit.mjs --format json` 仍 `incomplete`，`real-qcloop-evidence` failed；`.lime/qc/qcloop-status.isolated-p0-full-v1-current.json` 仍 stale | FAIL：整体不能标记 complete |

新增 Design Canvas 复测详情：

- 命令：`npm run smoke:design-canvas -- --timeout-ms 180000`。
- 结果：exit `0`；日志显示 `project-roundtrip-save-open`、`upload-flat-image-extraction`、`extraction-quality-export-manifest` 均完成。
- Evidence：`.lime/qc/gui-evidence/design-canvas-project-roundtrip-current-2026-05-10/summary.json`。
- 审计影响：旧 fast-mini sidecar 的 `smoke:design-canvas` 失败不再是当前 host 可复现的产品阻塞；但这仍是 sidecar / direct host evidence，不能覆盖 `real-qcloop-evidence` 主缺口，整体仍不能标记 complete。

### 2026-05-10 21:39 补充审计记录：Harness Replay / Eval 后端回归复测

- 选择原因：full P0 qcloop owner 仍 stale，不能抢占 GUI owner；`harness-replay-regression` 属于非 GUI 后端证据链，可直接复测，不影响隔壁 v0.6 / qcloop。
- 命令：`npm run harness:eval:json`、`npm run harness:eval:trend:json`。
- 结果：两条命令 exit `0`；eval summary 显示 `suiteCount=3`、`caseCount=2`、`readyCount=2`、`invalidCount=0`、`needsHumanReviewCount=0`、`currentObservabilityGapCaseCount=0`、`degradedObservabilityGapCaseCount=1`、`currentRecoveredVerificationCaseCount=3`。
- Trend 限制：`sampleCount=1`，stdout 明确“当前仅形成 trend seed，还不能判断长期退化”。
- History 处理：只读检查未发现既有 `.lime/harness/history` 或 `reports` harness summary / trend 样本；因此没有复制同一轮样本伪造长期趋势，而是执行 `node scripts/harness-eval-history-record.mjs ...`，把本轮结果记录为第一条真实 baseline，并生成 summary / trend / cleanup / dashboard 报告。
- Evidence：`.lime/qc/backend-evidence/harness-replay-regression-current-2026-05-10/summary.json`。
- 审计影响：证明当前 host 上 harness replay / eval 后端链路可运行；但 trend 仍弱，且 full P0 qcloop 未采信，不能覆盖 `real-qcloop-evidence` 主缺口。

### 2026-05-10 22:15 补充审计记录：Approval / Sandbox live runtime transcript 收口

- 选择原因：full P0 qcloop owner 仍 stale，不能启动新的 GUI P0；`tool-approval-sandbox-boundary` 可以用 direct-host 后端 smoke 补齐 live runtime transcript sidecar。
- 初始失败：`smoke:agent-runtime-approval-sandbox` 没有给 live runtime 请求传 provider/model preference；provider 未配置时，`agent_runtime_submit_turn` 没有形成权限确认 transcript。UI 侧失败截图为 `.lime/qc/backend-evidence/approval-sandbox-live-current-2026-05-10/agent-runtime-create-session-fail-2026-05-10.png`。
- 代码：`scripts/agent-runtime-approval-sandbox-smoke.mjs` 新增 provider/model preference 参数与本地 enabled provider 自动选择；本轮选择 `deepseek` / `deepseek-v4-flash`，不暴露 API Key。
- 验证：`node --check scripts/agent-runtime-approval-sandbox-smoke.mjs`、`npx vitest run scripts/lib/agent-runtime-approval-sandbox-smoke-core.test.ts`、`npm run smoke:agent-runtime-approval-sandbox -- --timeout-ms 120000 --output .lime/qc/backend-evidence/approval-sandbox-live-current-2026-05-10/runtime-approval-sandbox-smoke.fixed.json`、`npm run smoke:agent-runtime-tool-surface`、`npm run agent-qc:check` 均通过。
- Evidence：`.lime/qc/backend-evidence/approval-sandbox-live-current-2026-05-10/summary.json`，verdict=`pass`；`runtime-approval-sandbox-smoke.fixed.json`，status=`pass`。
- Live assertions：`devBridgeHealthy`、`permissionRequestCreatedBeforeModel`、`deniedDecisionClearsPendingRequest`、`resolvedDecisionClearsPendingRequest`、`approvalPolicySubmitted`、`sandboxPolicySubmitted` 均为 `true`；denied / resolved 两条 flow 均生成 `runtime_permission_confirmation:<turn_id>`。
- 审计影响：`tool-approval-sandbox-boundary` 从“缺 live transcript sidecar”降级为 direct-host backend sidecar pass；但官方 `.lime/qc/agent-qc-evidence.json` 仍为 fail，不能覆盖 `real-qcloop-evidence`。

### 2026-05-10 22:20 补充审计记录：当前 completion gate 仍 incomplete

- `node scripts/agent-qc-completion-audit.mjs --format json` 当前仍为 `status=incomplete`、`16/18`；缺口为 `real-qcloop-evidence` 与 `local-verify-gate`。
- `.lime/qc/qcloop-status.isolated-p0-full-v1-current.json` 刷新后仍为 `verdict=stale`，job `1778405842243079000` 为 `4 success / 1 running / 3 pending / 1 stale`，`browser-runtime-site-adapter` stale 约 `16482s`。
- `.lime/qc/gui-owner-current.json` 显示 `ownerCount=1`、`staleOwnerCount=1`、`verdict=blocked`；watch history 已追加到 `.lime/qc/stale-owner-watch-history.jsonl`，当前 13 条。
- `local-verify-gate` 仍失败在 `src/components/settings-v2/system/channels/ChannelLogTailPanel.test.tsx(129,51)`：`Argument of type 'number' is not assignable to parameter of type 'Timeout'.` 该文件属于 settings-v2 高冲突区域，本轮未修改。

### 2026-05-10 22:45 补充审计记录：verify:local 新失败点与 qcloop stale owner 续刷

- `npm run verify:local` 已结束，exit `1`。本轮 `verify:app-version`、`lint`、`typecheck` 与 `vitest-smart` 批次 `1-38` 通过；`npm test` / `vitest-smart` 在批次 `39/54` 失败。
- 新失败点为 `src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.test.ts:98`：测试期望 `activeStream` 不包含 `turnId`，但当前实现返回了 `turnId`。相关 `agentStreamSubmissionLifecycle.test.ts` 与 `agentStreamSubmissionLifecycle.ts` 当前均为活动工作树修改，本轮只记录 gate 结果，不改动这些文件。
- `.lime/qc/verify-local-current.json` 已更新为 `status=fail`、`failedStage="npm test / vitest-smart batch 39/54"`；新增 sidecar `.lime/qc/verify-local-2026-05-10-2239.md`。
- `qcloop-status.isolated-p0-full-v1-current.json` 只读刷新后仍为 `verdict=stale`，job `1778405842243079000` 保持 `4 success / 1 running / 3 pending / 1 stale`；`browser-runtime-site-adapter` stale 约 `17692s`，stdout/stderr 仍为 `0 / 0`。
- SQLite 只读复核显示 active item `1778405842246191000` 仍由 `qcloop-worker-1` 持有，`lock_expires_at=2026-05-10T22:56:05+08:00`；PID `69738` 仍存活，PPID=`1`、PGID=`69307`、elapsed≈`04:56:40`。新增 sidecar `.lime/qc/qcloop-db-lease-isolated-p0-full-v1-latest.md`。
- `agent-qc:gui-owner-check -- --watch-history-output` 已追加 watch history；`.lime/qc/stale-owner-watch-history.jsonl` 当前为 `14` 条。
- `node scripts/agent-qc-completion-audit.mjs --format json` 当前仍为 `status=incomplete`、`16/18`；缺口保持 `real-qcloop-evidence` 与 `local-verify-gate`。本轮没有 kill / pause / interrupt / restart 任何进程，没有修改 qcloop DB，没有覆盖官方 `.lime/qc/agent-qc-evidence.json`，也没有 commit / push / tag / release。

### 2026-05-10 23:40 补充审计记录：verify:local 新一轮仍在运行

- 当前存在一轮新的 `npm run verify:local` wrapper 正在运行，未结束，因此 `.lime/qc/verify-local-current.json` 仍是 22:39 的旧 fail 结果；completion audit 继续显示 `status=incomplete`、`16/18`。
- 新一轮已通过 `verify:app-version`、`lint`、`typecheck`、前端 Vitest 批次、`test:contracts`、`cargo test --manifest-path src-tauri/Cargo.toml` 主库测试，以及 `verify:gui-smoke` 中的 `workspace-ready` / `browser-runtime` / `site-adapters` / Skill Forge 前端 smoke。
- 当前停在 `smoke:agent-service-skill-entry` 的 Rust 定向测试 `register_capability_draft_persists_readonly_http_preflight_provenance`；日志最后显示 cargo artifact lock 与后续编译，相关 `rustc` 仍有 CPU 活动。为避免和隔壁 v0.6 / qcloop worker 冲突，本轮没有中断任何进程。
- Running snapshot：`.lime/qc/verify-local-2026-05-10-2340-running.md`。
- qcloop 官方证据仍未完成：`.lime/qc/qcloop-status.isolated-p0-full-v1-current.json` 仍 `verdict=stale`，job `1778405842243079000` 为 `4 success / 1 running / 3 pending / 1 stale`；`.lime/qc/gui-owner-current.json` 仍 `blocked`。
- 审计影响：当前不能把 `local-verify-gate` 从缺口移除；只有该 wrapper 自然结束并写出 `status=pass` 后，才能重跑 completion audit 并更新整体完成度。

### 2026-05-10 23:50 补充审计记录：Skill Forge Rust 定向测试进展到第二条 Cargo lock

- `verify:local` 已从第一条 Skill Forge Rust 定向测试中恢复并通过：`register_capability_draft_persists_readonly_http_preflight_provenance` 对应 cargo test exit `0`。
- 当前卡点移动到第二条 Rust 定向测试：`registered_skill_becomes_ready_for_manual_enable_binding_candidate`，日志显示 `Blocking waiting for file lock on artifact directory`。
- 只读进程快照显示仍有并发 Cargo 工作活跃，因此本轮继续等待或记录阻塞，不中断任何进程。
- Evidence：`.lime/qc/verify-local-2026-05-10-2350-cargo-lock.md`。
- 审计影响：当前 active run 尚未结束，不能把 `local-verify-gate` 记为 pass；`completion audit` 仍保持 `16/18`，但旧 22:39 Vitest 失败已不再是 active run 的当前停留点。

### 2026-05-10 23:55 目标级 prompt-to-artifact 审计刷新

目标拆解为 7 个可验证交付项：

| 要求 | 证据 | 当前结论 |
| --- | --- | --- |
| 不只覆盖 Agent UI，必须包含后端 runtime 行为 | `24-claw-cancel-sensenova-clean-console-summary.json`、`approval-sandbox-live-current-2026-05-10/summary.json` | sidecar pass；不能替代官方 qcloop |
| Agent UI / Skills 全路径用 Playwright 测试并留截图 | `.lime/qc/gui-evidence/agent-ui-manual-e2e-2026-05-10/summary.json`，10 张截图 | pass |
| 发现的产品 UI/UX 问题要修复并复测 | `skill-preflight-reference-sanitized`、`skills-search-local-hit`、`advanced-settings-plan-label-cn` | pass |
| 非 Agent UI 的产品 / 后端风险要测试 | `design-canvas-project-roundtrip-current`、`harness-replay-regression-current` | partial pass；Harness trend 仍只有 `sampleCount=1` |
| `verify:local` 统一门禁通过 | `.lime/qc/verify-local-current.json`、`.lime/qc/verify-local-2026-05-10-2350-cargo-lock.md` | blocked / not pass；active run 仍等待 Cargo lock |
| 官方 full P0 qcloop Evidence Pack 通过 | `.lime/qc/agent-qc-evidence.json`、`.lime/qc/qcloop-status.isolated-p0-full-v1-current.json`、`.lime/qc/gui-owner-current.json` | blocked；qcloop stale，GUI owner blocked |
| 不与隔壁 v0.6 / stale GUI owner 冲突 | qcloop status、GUI owner check、process snapshots | pass；未 kill / pause / interrupt、未新开 full P0、未改 DB |

机器可读审计：`.lime/qc/objective-completion-audit-2026-05-10-2355.json`，`achieved=false`。因此不能调用 goal complete，也不能把当前 sidecar pass 宣称为整体完成。

### 2026-05-10 23:56 补充审计记录：completion gate 仍 incomplete，local verify 归因为 GUI smoke timeout

- `npm run verify:local` 已自然结束，exit `124`；`.lime/qc/verify-local-current.json` 已保持 `status=fail`，并把失败阶段归一化为 `verify:gui-smoke / smoke:agent-service-skill-entry`。
- 失败原因不是 22:39 的 `agentStreamSubmissionLifecycle` Vitest 断言，而是 `smoke:agent-service-skill-entry` 在第二条 Skill Forge Rust 定向测试期间超过 `1830000ms` 超时；第一条 Rust 定向测试已通过。
- `node scripts/agent-qc-completion-audit.mjs --format json` 已保存到 `.lime/qc/completion-audit-2026-05-10-2356.json`，结果仍为 `status=incomplete`、`16/18`。
- 目标级审计刷新为 `.lime/qc/objective-completion-audit-2026-05-10-2357.json`，`achieved=false`。
- qcloop 官方证据仍 blocked：`.lime/qc/qcloop-status.isolated-p0-full-v1-current.json` 为 `verdict=stale`；`.lime/qc/gui-owner-current.json` 为 `blocked`。

### 2026-05-11 00:20 只读状态复核与 Claw streaming smoke 更新

本次复核仍遵守“不推送、不中断其他进程、不覆盖官方 Evidence Pack”的约束，只更新 sidecar、docs/tests 和 Agent QC 脚本证据能力。

qcloop full P0 job `1778405842243079000` 仍未自然释放：`.lime/qc/qcloop-status.isolated-p0-full-v1-current.json` 显示 `verdict=stale`，`4 success / 1 running / 3 pending / 1 stale`；active item 仍是 `browser-runtime-site-adapter`，attempt `dc625f8e-b3b9-46b7-9758-4b0273438d50` 的 stdout/stderr 仍为 `0 / 0`。SQLite 最新只读快照 `.lime/qc/qcloop-db-lease-isolated-p0-full-v1-latest.json` 显示 `lock_expires_at=2026-05-11T00:31:05+08:00`，说明 lease 仍在延长。`.lime/qc/gui-owner-current.json` 仍为 `blocked`，active GUI owner 为 `1`，最长 stale 约 `23482s`。

最新 GUI smoke sidecar `.lime/qc/verify-gui-smoke-current.json` 记录 `npm run verify:gui-smoke -- --reuse-running` 为 `fail`。前置阶段已经通过：DevBridge health、workspace-ready、browser-runtime、site-adapters、agent-service-skill-entry、runtime tool surface 和 runtime tool surface page；默认 `smoke:claw-chat-ready-streaming` 已能自动解析 `deepseek / deepseek-v4-flash`，因此旧的 provider/model 解析缺口已解除。当前失败更深：长 turn 提交后没有在 smoke 窗口内同时观察到首个流式文本和可见“停止”按钮，证据见 `.lime/qc/verify-gui-smoke-reuse-2026-05-11-0006.log` 与 `.lime/qc/gui-evidence/claw-chat-ready-streaming/claw-chat-ready-streaming-summary.json`。

另一个正在运行的显式 `deepseek-chat` 复核自然结束后，也进入同一 first-delta wait 路径，并暴露 `readPageSnapshot` 返回 `null` 时脚本会抛 `Cannot read properties of null (reading 'stopVisible')` 的证据缺口。已修复 `scripts/claw-chat-ready-streaming-smoke.mjs`：等待首增量和恢复结果时会容忍 `null` 快照；失败路径会写出 `console`、`network-invoke`、`runtime-session`、`thread-read` 与 `failureSnapshot`，避免下一次失败只留下 summary。修复后只跑了 `node --check scripts/claw-chat-ready-streaming-smoke.mjs`，未重跑完整 GUI smoke，以免抢占当前仍在运行的 Lime / Cargo / qcloop 进程。

审计影响：`local-verify-gate` 仍不能关闭。当前缺口仍是 `real-qcloop-evidence` 与 `local-verify-gate`；后者现在应同时看 `.lime/qc/verify-local-current.json` 和 `.lime/qc/verify-gui-smoke-current.json`，不能再把旧的 provider/model 解析失败当成唯一原因。

### 2026-05-11 00:25 GUI smoke 补充：显式 Sensenova provider 跑通

00:20 后观察到另一个已在运行的 GUI smoke 自然完成，本轮没有中断或重启它。该命令使用显式 provider/model：`LIME_AGENT_QC_PROVIDER=custom-f74b38b5-6d3f-44ef-aa0f-99d70c3482ed LIME_AGENT_QC_MODEL=sensenova-6.7-flash-lite npm run verify:gui-smoke -- --reuse-running --timeout-ms 240000`，结果为 `pass`，已写入 `.lime/qc/verify-gui-smoke-current.json` 与 `.lime/qc/verify-gui-smoke-2026-05-11-0025-sensenova-pass.md`。

本次通过覆盖：DevBridge health、workspace-ready、browser-runtime、site-adapters、agent-service-skill-entry、runtime tool surface、runtime tool surface page、`claw-chat-ready-streaming`、knowledge-gui 和 design-canvas。`claw-chat-ready-streaming` 证据显示 `verdict=pass`，断言覆盖首个流式增量、停止按钮、interrupt scoped to long turn、long turn aborted、recovery turn completed、GUI 可见恢复结果、runtime 持久化和无 runtime mock fallback。

审计影响：`.lime/qc/verify-gui-smoke-current.json` 已从 fail 更新为 pass，但 `local-verify-gate` 仍不能关闭，因为它要求完整 `npm run verify:local` 当前 sidecar 为 pass；`.lime/qc/verify-local-current.json` 仍记录最新 full wrapper 为 fail。下一刀应在并发 Cargo/GUI 负载收敛后重跑完整 `npm run verify:local`，而不是只用单独 GUI smoke pass 替代本地统一门禁。
