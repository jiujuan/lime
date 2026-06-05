# Lime Agent 自主测试执行矩阵

> 本文件是 `internal/tests/lime-agent-autonomous-testing-plan.md` 的执行层补充：把“应该如何测试 Lime”落成 Agent 可以按步骤执行的矩阵。它不替代通用标准，也不替代 qcloop Evidence Pack；它只定义 Lime 作为样本产品时，测试 Agent 如何选择场景、采集证据、阻断发布和回写回归。

## 1. 适用范围

Lime 是桌面 GUI + Agent Runtime + 工具/技能/浏览器能力的组合产品，因此不能用单一测试手段证明可运营。一次 Lime Agent 自主测试至少覆盖四类事实：

| 事实层 | 需要证明什么 | 不能接受的假阳性 |
| --- | --- | --- |
| 壳层 | App / DevBridge / workspace ready 可用 | 页面打开但 `127.0.0.1:3030/health` 不通 |
| 运行时层 | thread / turn / stream / persistence 状态正确 | 模型有回复但 turn 状态、恢复状态或持久化错误 |
| 能力层 | tool / approval / sandbox / skill / browser 真实执行 | mock 返回、注册成功或 UI 显示可用被误认为能力可执行 |
| 运营层 | qcloop / Evidence Pack / release gate 可审计 | 一次宿主手工命令通过被当成发布证据 |

## 2. 执行前 Owner Gate

任何会复用 GUI、DevBridge、Cargo target 或 qcloop worker 的重型任务，先执行 owner gate。该 gate 只读取状态，不终止进程。

```bash
npm run agent-qc:qcloop-status -- \
  --base-url "http://127.0.0.1:18080" \
  --job-id "<running-qcloop-job-id>" \
  --format json \
  --output "./.lime/qc/qcloop-status.current.json"

npm run agent-qc:gui-owner-check -- \
  --format json \
  --output "./.lime/qc/gui-owner-current.json" \
  --watch-history-output "./.lime/qc/stale-owner-watch-history.jsonl"

npm run agent-qc:process-owner-check -- \
  --format json \
  --output "./.lime/qc/gui-process-owner-current.json" \
  --markdown-output "./.lime/qc/gui-process-owner-current.md" \
  --watch-history-output "./.lime/qc/raw-process-owner-watch-history.jsonl"

npm run agent-qc:qcloop-db-lease -- \
  --db "./.lime/qc/qcloop-isolated-worker-preflight.db" \
  --job-id "<running-qcloop-job-id>" \
  --format json \
  --output "./.lime/qc/qcloop-db-lease-current.json" \
  --markdown-output "./.lime/qc/qcloop-db-lease-current.md"

npm run agent-qc:payload-coverage -- \
  --payload "./.lime/qc/qcloop-p0-single-owner-ready-2026-05-11-0454.json" \
  --format json \
  --output "./.lime/qc/qcloop-p0-single-owner-ready-coverage-current.json" \
  --check
```

通过条件：

- `gui-owner-current.json` 没有 active / stale GUI qcloop owner。
- `gui-process-owner-current.json` 没有 active raw GUI smoke、qcloop worker、Cargo / Rust 构建 owner；passive qcloop serve、passive desktop runtime（Electron dev host / legacy Tauri runtime）和 observer shell 只作为上下文，不单独阻断。
- `qcloop-db-lease-current.json` 没有 running item、续约 lock 或 no-output active attempt。
- `qcloop-p0-single-owner-ready-coverage-current.json` 对 manifest P0 场景 `missing=[]`、`extra=[]`、`coverage.passed=true`。
- DevBridge preflight 通过：`npm run agent-qc:qcloop-preflight -- --require-devbridge --check`。

阻断条件：

- 存在 stale qcloop worker 且仍在续约 DB lease。
- 存在长时间 `smoke:*` 或 `verify:gui-smoke` 进程。
- 存在 Cargo / Rust 编译 owner，可能抢占 target；Electron dev host / legacy `tauri dev` 只有在被归类为 active owner 时才阻断。
- ready payload 与 manifest P0 不一致，或 payload coverage 仍未生成。
- 官方 `.lime/qc/agent-qc-evidence.json` 不是同一批次 8/8 P0 pass。

## 3. P0 执行矩阵

| P0 场景 | 执行命令 | 必须采集的证据 | Release 判定 |
| --- | --- | --- | --- |
| `command-bridge-contract` | `npm run test:contracts` | 前端调用、Rust 注册、governance catalog、mock counts | 命令退出码 + contract 摘要均通过 |
| `workspace-ready-session-restore` | `npm run smoke:workspace-ready` + `npm run verify:gui-smoke -- --reuse-running` | workspace ready、session restore、DevBridge health、GUI trace | GUI ready 和恢复状态都可观察 |
| `claw-chat-ready-streaming` | `npm run verify:gui-smoke -- --reuse-running` 或专项 Claw smoke | first delta、interrupt command、aborted turn、follow turn completed、GUI 可见恢复结果 | 不能只有“有回复”，必须证明中断后状态正确 |
| `tool-approval-sandbox-boundary` | `npm run smoke:agent-runtime-tool-surface` + `npm run smoke:agent-runtime-approval-sandbox` | approval policy、sandbox policy、denied/resolved flow、tool timeline | approval / sandbox 进入 turn config 且无绕过 |
| `skill-forge-register-bind-enable` | `npm run test:contracts` + `npm run smoke:agent-service-skill-entry` | draft / verify / register / binding readiness / enable allowlist / runtime transcript | 注册不等于可执行，显式 enable 且 SkillTool gate 有结构化 transcript 才可进入能力面 |
| `browser-runtime-site-adapter` | `npm run smoke:browser-runtime` + `npm run smoke:site-adapters` | attach/status、adapter list、cleanup、console/network 摘要 | cleanup warning 必须归类；session 泄漏不可放行 |
| `harness-replay-regression` | `npm run harness:eval` + `npm run harness:eval:trend` | eval summary、observability gap、trend 样本 | trend 样本不足只能作为 seed，不能替代长期趋势 |
| `release-package-startup-smoke` | `npm run verify:app-version` + `npm run verify:gui-smoke -- --reuse-running` | version consistency、artifact scope、startup smoke | 必须标明 source-tree 还是 installer artifact |

执行原则：P0 全绿前不扩 P1/P2；P0 partial sidecar 只能排障，不能覆盖官方 Evidence Pack。

## 4. Agent 分工

| Agent | 输入 | 动作 | 输出 |
| --- | --- | --- | --- |
| Planner | diff、manifest、当前 owner sidecar | 选择最小 P0/P1 场景，生成 qcloop payload | `qcloop-*.json`、计划摘要 |
| Executor | 单个 scenario item | 只执行指定命令，不修无关问题 | stdout/stderr、trace、summary JSON |
| Verifier | manifest、stdout、exit code、artifact refs | 独立判断 evidence 是否满足要求 | `pass/fail/blocked` verdict |
| Curator | 失败 evidence | 把失败沉淀为单测、smoke、harness replay 或 GUI flow | 新回归资产和关闭条件 |
| Release Gate | Evidence Pack、tag、manifest | 验证 P0 覆盖和 pass 状态 | release summary / 阻断原因 |

关键约束：Executor 不能自证通过；Verifier 必须能从证据中复核每个 `evidenceRequired` 与 `failureModes`。

## 5. 组合测试策略

| 组合 | 何时使用 | Lime 示例 |
| --- | --- | --- |
| 白盒 + 黑盒 | 协议正确但 GUI 可能不可用 | `test:contracts` 后补 `verify:gui-smoke` |
| GUI + Runtime transcript | UI 显示正确但后端状态可能错 | Claw streaming / interrupt / resume |
| Smoke + Deep evidence | 快速入口通过但 P0 需要更强证据 | `verify:gui-smoke` pass 后仍检查 transcript、console、network |
| Direct host + qcloop | 区分产品问题和 worker 环境问题 | 宿主 smoke pass 但 qcloop worker loopback blocked |
| Replay + Trend | 修复一次失败后防止回归 | `harness:eval` + `harness:eval:trend` |
| Failure injection + Recovery | 权限拒绝、超时、断桥后仍要安全 | approval denied、tool timeout、DevBridge unavailable |

## 6. 失败分类与回写

| 失败分类 | 判定标准 | 回写资产 |
| --- | --- | --- |
| Product blocker | 宿主直接执行也失败，且影响 P0 行为 | 修产品 + Rust/Vitest/GUI 回归 |
| Environment blocker | qcloop worker blocked，但宿主 direct host pass | preflight、owner gate、qcloop runtime 修复 |
| Evidence blocker | 命令通过但缺 transcript / trace / failure mode 解释 | 强化 worker prompt、exporter、schema 或 verifier |
| Concurrency blocker | 多个 GUI owner 抢同一窗口/DevBridge | single-owner gate、stale owner runbook |
| Release blocker | Evidence Pack 非 pass 或 P0 覆盖不全 | release summary hard gate |

每个失败的关闭条件固定为：下次能由机器先发现、能定位到证据、能阻断发布。

## 7. 当前 Lime 样本执行顺序

当存在其他本地进程时，本轮只做安全动作：

1. 刷新 qcloop status、GUI owner、raw process owner、DB lease sidecar。
2. 若 owner 仍 busy，只更新文档和 sidecar，不启动新的 full P0 或完整 `verify:local`。
3. 若 owner 自然释放，先跑完整 `npm run verify:local`，关闭 `local-verify-gate`。
4. 在单一 GUI owner 前提下，使用修正后的 qcloop 环境跑 8/8 P0。
5. 只有 8/8 P0 pass 后，才覆盖 `.lime/qc/agent-qc-evidence.json`。
6. 再执行 `npm run agent-qc:release-summary -- --check` 与 `npm run agent-qc:audit -- --format json`。

## 8. 不允许的捷径

- 不把 isolated sidecar pass 当成官方 release evidence。
- 不把宿主 direct host pass 当成 qcloop verifier pass。
- 不把 `verify:gui-smoke` pass 当成完整 `verify:local` pass。
- 不在 stale GUI owner 仍存在时启动新的 full GUI P0。
- 不通过降低 verifier、删 evidenceRequired 或改 schema 来制造绿色。
- 不在 owner 未确认时 kill / pause / interrupt qcloop worker。

## 9. 相关事实源

- 通用标准：`internal/tests/agent-ops-qc.md`
- P0 场景：`internal/tests/agent-qc-p0-scenarios.md`
- Lime 分阶段计划：`internal/tests/lime-agent-autonomous-testing-plan.md`
- 当前阻断：`internal/tests/lime-agent-qc-current-blockers.md`
- qcloop 运维：`internal/tests/lime-agent-qc-qcloop-operations.md`
- Evidence 契约：`internal/tests/lime-agent-qc-evidence-contract.md`
- 机器 manifest：`internal/test/agent-qc-scenarios.manifest.json`
- Evidence schema：`internal/test/agent-qc-evidence.schema.json`

## 10. 2026-05-11 04:44 样本状态

当前执行矩阵的最新输入不是“缺少测试文档”，而是 owner gate 和官方 Evidence Pack 仍在阻断：

| Gate | 当前状态 | 下一步含义 |
| --- | --- | --- |
| `agent-qc:audit -- --check` | `incomplete`，`16/17` | 只剩 `real-qcloop-evidence` 未满足 |
| `agent-qc:objective-checklist -- --check` | `incomplete`，`5/7` | raw process owner busy + official Evidence Pack fail |
| `agent-qc:gui-owner-check -- --check` | pass | qcloop GUI owner 已清空 |
| `agent-qc:process-owner-check` | busy | PID `59011` stale `smoke:design-canvas` 是唯一 active blocker |
| official Evidence Pack | fail | `.lime/qc/agent-qc-evidence.json` 不能发布 |
| isolated P0 full v3 | failed，4 pass / 4 exhausted | 只能作为 sidecar，不可覆盖官方 evidence |
| Skill Forge runtime transcript 单项补证 | completed，1 pass / 0 fail | 已证明单项 verifier 可采信 runtime transcript，但不能替代 8/8 full P0 |

`skill-forge-register-bind-enable` 的最新前置证据是 `.lime/qc/skill-forge-runtime-transcript-current.json`：它覆盖 deterministic-smoke 与 runtime-transcript 两层、8 个事件，并证明 Rust exact tests 不再是 `running 0 tests`。随后 qcloop job `1778445676473687000` 已把该场景跑成 `success`，sidecar `.lime/qc/agent-qc-evidence.skill-forge-runtime-transcript.json` 为单场景 `pass`。但该 sidecar 缺少其余 7 个 P0 场景，release summary `--check` 仍正确失败；下一轮 full P0 必须在同一批次内重新覆盖 8/8，而不是拼接 partial pass。

因此当前安全动作只有三类：

1. 只读刷新 owner / qcloop status / audit sidecar。
2. 继续完善文档和 runbook，不能降低 verifier 或 evidenceRequired。
3. 等 PID `59011` 自然释放，或 owner 明确确认后按 stale raw GUI owner runbook 处理。
