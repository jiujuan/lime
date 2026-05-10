# Lime Agent 自主化测试体系示例计划

> 本文件把通用 Agent QC 标准落到 Lime 这个实际产品上：目标不是让人多点几遍 GUI，而是让测试 Agent 能读改动、选场景、执行验证、收集证据、独立复核，并把失败回写为长期回归资产。

## 1. 问题判断

Lime 即将运营，测试策略必须从“开发者人工确认”升级为“Agent 自己证明自己可运营”。人工测试仍有价值，但只能用于设计场景、审核 waiver 和校准语义评测，不应作为发布通过的主要证据。

Agent 类产品的核心风险不是单个函数失败，而是多个不确定系统叠加后出现假阳性：

| 风险面 | 典型假阳性 | 必须自动采集的证据 |
| --- | --- | --- |
| GUI 桌面壳 | 页面能打开，但 DevBridge 未就绪 | health、workspace ready、截图或 trace、console/network 摘要 |
| Agent Runtime | 模型有回复，但 turn / thread 状态错 | session、thread、turn transcript、stream event、持久化结果 |
| Tool Surface | 工具显示可用，但未经过授权或未写回结果 | tool request、approval decision、sandbox policy、tool result/error |
| Streaming / Interrupt | UI 显示停止，后端继续写 completed | first token、interrupt command、post-stop transcript、resume turn |
| Skill / Service Skill | 已注册被误认为已可执行 | draft、verify、register、binding readiness、session enable、allowlist |
| Browser / Site Adapter | adapter catalog 可读，但 session 泄漏 | attach/status、adapter result、cleanup、network/console |
| Knowledge / Files | 能读取文件，但引用和来源不可信 | source id、chunk、引用位置、空结果策略 |
| Release Ops | 源码可跑，但发布包不可启动 | version check、artifact scope、startup smoke、release evidence |

结论：Lime 的测试体系要围绕“证据”建，而不是围绕“命令跑过”建。每个场景都必须回答：谁执行、执行了什么、看到了什么、为什么可以判定通过、失败后下次怎么提前发现。

## 2. 目标状态

目标流水线：

```text
Diff / Release Candidate / Nightly
  -> Test Planner Agent 识别风险与场景
  -> qcloop 拆分 P0/P1 item
  -> Executor Agent 执行 npm / Rust / GUI / harness / Playwright MCP
  -> Evidence Collector 写入 Evidence Pack
  -> Verifier Agent 按 manifest 独立判定
  -> Regression Curator 把失败沉淀为长期回归
  -> Release Gate 只读证据并阻断发布
```

角色分工：

| Agent | 职责 | 产物 |
| --- | --- | --- |
| Test Planner Agent | 读取 diff、manifest、风险矩阵，选择最小但足够的场景 | qcloop payload、测试计划摘要 |
| Executor Agent | 执行单个场景，不顺手修复无关问题 | 命令日志、GUI trace、runtime transcript |
| Verifier Agent | 独立审查 evidenceRequired / failureModes | JSON verdict |
| Regression Curator Agent | 把失败归类并生成长期回归资产 | 新增 smoke / replay / unit test / qcloop scenario |
| Release Gate Agent | 汇总 Evidence Pack 并生成 release note 质量小节 | `release-agent-qc.md`、CI gate 结果 |

人类只处理三件事：新增关键业务场景、审核高风险 waiver、校准 LLM judge 的 rubric。

## 3. Lime 风险地图

Lime 当前最需要覆盖的不是“所有代码行”，而是用户运营路径和 Agent 自主执行路径：

```text
桌面启动
  -> DevBridge health
  -> workspace ready / session restore
  -> Claw 输入与首屏
  -> Runtime submit_turn
  -> streaming / interrupt / resume
  -> tool request / approval / sandbox / result
  -> Skill / Browser / Knowledge 等能力面
  -> evidence pack / harness replay
  -> release startup smoke
```

按风险优先级分层：

| 优先级 | 必测路径 | 当前主入口 |
| --- | --- | --- |
| P0 | command bridge contract | `npm run test:contracts` |
| P0 | GUI shell / workspace / DevBridge | `npm run verify:gui-smoke` |
| P0 | runtime tool / approval / sandbox | `npm run smoke:agent-runtime-tool-surface` + 专项 transcript evidence |
| P0 | Claw streaming / interrupt / resume | GUI deep flow + runtime transcript |
| P0 | Skill Forge register / bind / enable | `npm run smoke:agent-service-skill-entry` + runtime binding evidence |
| P0 | Browser runtime / site adapter / cleanup | `npm run smoke:browser-runtime` + `npm run smoke:site-adapters` |
| P0 | release startup and evidence gate | `npm run verify:app-version` + release summary gate |
| P1 | Knowledge product path | `npm run smoke:knowledge-gui` + `npm run knowledge:product-e2e` |
| P1 | Team / long task / harness trend | `npm run harness:eval` + `npm run harness:eval:trend` |

P0 的定义：失败会导致用户无法启动、无法对话、无法安全调用工具、无法恢复状态，或发布包不能可信上线。

## 4. 测试手段组合

单一测试方式无法覆盖 Agent 产品。Lime 默认使用组合策略：

| 手段 | 证明范围 | Lime 用法 |
| --- | --- | --- |
| 白盒测试 | 内部状态、协议、持久化是否正确 | Rust / Vitest / command contract / runtime transcript |
| 黑盒测试 | 用户可见路径是否可用 | GUI smoke、Playwright MCP、发布包启动 |
| 灰盒测试 | UI 操作与后端事件是否对应 | GUI 截图 + DevBridge health + runtime session read |
| 快照测试 | UI 结构、工作台布局、报告形状不漂移 | React snapshot / JSON report snapshot / evidence schema |
| 冒烟测试 | 快速确认主路径没断 | `verify:gui-smoke`、`smoke:*` |
| Replay 测试 | 线上失败或复杂任务可复现 | harness replay、runtime transcript replay |
| LLM Judge | 开放式答案质量与语义回归 | rubric + golden samples + human calibration |
| Metamorphic 测试 | 同义输入、顺序变化后核心约束仍成立 | 改写 prompt 后仍需调用同类 skill / tool |
| 故障注入 | 断网、工具拒绝、超时、权限拒绝时能恢复 | approval deny、tool timeout、DevBridge unavailable |
| Differential 测试 | mock / real backend、不同模型或不同 runtime 输出对比 | mock smoke 不能替代 release real path |
| 长程稳定性 | 资源泄漏、session 泄漏、趋势退化 | nightly qcloop、harness trend、browser cleanup |

组合原则：

- GUI P0 不能只有截图，必须带 DevBridge / console / network / runtime 证据。
- Runtime P0 不能只有命令退出码，必须带 transcript / tool timeline / approval / sandbox 证据。
- Release P0 不能只有源码 smoke，必须标明是 source-tree startup 还是 installer artifact。
- 语义场景不能只靠 LLM judge，必须有确定性 guardrail：结构、引用、禁止行为、工具调用边界。

## 5. 分阶段建设计划

### Phase 0：统一事实源

目标：让测试标准可以被机器读取。

已落地入口：

```bash
npm run agent-qc:report
npm run agent-qc:gui-flow:report
npm run agent-qc:check
```

完成标准：

- `docs/test/agent-qc-scenarios.manifest.json` 固定场景、命令、证据和失败模式。
- `docs/test/agent-qc-gui-flows.manifest.json` 固定 GUI / Playwright MCP flow。
- `docs/test/agent-qc-evidence.schema.json` 固定 Evidence Pack 形状。
- `npm run test:contracts` 包含 `agent-qc:check`，防止测试标准自身漂移。

### Phase 1：让 qcloop 接管场景执行

目标：每个 P0 场景都成为 qcloop item，由独立 verifier 判定，而不是执行者自评。

生成 P0 payload：

```bash
npm run agent-qc:qcloop-job -- \
  --risk P0 \
  --cwd "$(pwd)" \
  --base-url "http://127.0.0.1:8080" \
  --output "./.lime/qc/qcloop-p0-job.json" \
  --check
```

导出 Evidence Pack：

```bash
npm run agent-qc:export-evidence -- \
  --base-url "http://127.0.0.1:8080" \
  --job-id "<p0-qcloop-job-id>" \
  --output "./.lime/qc/agent-qc-evidence.json" \
  --ref "<release-or-pr-ref>" \
  --check
```

执行约束：

- 本地 API 使用 `http://127.0.0.1:8080`，避免 `localhost` 代理或 IPv6 干扰。
- qcloop 进程 cwd 可能不是 Lime，payload 必须显式传 `--cwd`。
- partial / sidecar evidence 只能用于排障，不能冒充正式 release pass。
- 运行中批次只做只读监控；使用 `npm run agent-qc:qcloop-status -- --job-id "<job-id>"` 判断 running / pending / exhausted / stale，不主动中断 worker。
- qcloop worker 执行前先跑 `npm run agent-qc:qcloop-preflight -- --check`；GUI / DevBridge 场景必须追加 `--require-devbridge`，否则不能把本地 loopback 权限缺失误判为产品通过或产品失败。

### Phase 2：先打穿 P0，再扩 P1/P2

目标：P0 全绿前，不把精力分散到大量低风险场景。

P0 最小闭环：

1. `command-bridge-contract`：防止前端、Rust、mock、治理目录漂移。
2. `workspace-ready-session-restore`：证明首屏和历史会话可恢复。
3. `claw-chat-ready-streaming`：证明聊天、流式、中断、恢复不是假通过。
4. `tool-approval-sandbox-boundary`：证明工具调用不绕过授权和 sandbox。
5. `skill-forge-register-bind-enable`：证明注册不等于自动执行，显式 enable 才进入 allowlist。
6. `browser-runtime-site-adapter`：证明 browser session、adapter 和 cleanup 可用。
7. `harness-eval-regression`：证明核心行为样本没有退化。
8. `release-package-startup-smoke`：证明版本、启动和 release gate 可复核。

只有 P0 通过后，再把 Knowledge、Team、长任务、任务调度、跨模型比较扩到 P1/P2。

### Phase 3：补齐 Runtime 级深证据

目标：让 runtime 测试从“命令通过”升级到“行为可信”。

每个 runtime 场景必须记录：

- `sessionId`、`threadId`、`turnId`。
- `submit_turn`、`stream event`、`interrupt`、`thread_read` 的顺序。
- tool request / approval decision / sandbox policy / result or error。
- 失败后的恢复动作：retry、fallback、用户可见错误或安全停止。
- mock 与 real path 的边界说明。

建议新增或强化专项 evidence：

| 缺口 | 建议资产 |
| --- | --- |
| approval / sandbox 证据不足 | `npm run smoke:agent-runtime-approval-sandbox` 生成确定性前端/投影 evidence；仍需补真实 runtime harness replay 和 tool timeline JSON |
| streaming stop 后状态不一致 | Rust persistence test + GUI deep flow regression |
| SkillTool allowlist 只测注册不测启用 | Rust gate test + frontend metadata builder test |
| tool timeout 后恢复不清晰 | failure injection smoke + transcript assertion |

### Phase 4：补齐 GUI / TUI / WebUI 产品证据

目标：任何用户可见主路径都能由 Agent 自动操作、截图、断言和归档。

GUI / WebUI flow 最小证据：

- 页面或窗口可达。
- 主交互前后截图或 trace。
- 可访问性节点或稳定选择器断言。
- console error / warning 摘要。
- network failure 摘要。
- 与后端状态对应的 runtime / DevBridge 证据。

TUI / CLI flow 最小证据：

- 命令输入、退出码、stdout/stderr 摘要。
- PTY 场景要记录关键屏幕帧或结构化 transcript。
- 长任务要记录取消、超时、恢复和清理。

Lime 是桌面 GUI 产品，所以 GUI 主路径仍以 `verify:gui-smoke` 和 Playwright MCP 为主；如果未来提供 TUI 或 WebUI，也应复用同一套 Evidence Pack schema，而不是另起一套口头流程。

### Phase 5：把失败变成长期资产

目标：每个真实 P0 失败都要留下下次可自动发现的资产。

失败归档规则：

| 失败类型 | 回写资产 |
| --- | --- |
| 合同漂移 | `test:contracts` / governance catalog test |
| GUI ready 假阳性 | `verify:gui-smoke` / GUI flow manifest / Playwright MCP trace |
| runtime 状态错 | Rust 定向测试 / transcript replay |
| approval bypass | approval policy unit test / harness replay |
| sandbox 漏洞 | sandbox boundary test / denylist snapshot |
| streaming 卡死 | interrupt regression / persistence assertion |
| 语义退化 | harness eval sample / LLM judge rubric |
| 发布失败 | release workflow gate / startup smoke |

复盘问题固定为：这次失败下次是否能由机器先发现？如果不能，修复没有完成。

### Phase 6：发布与运营门禁

目标：发布只接受 evidence，不接受“我刚手动测过”。

发布前 gate：

```bash
npm run agent-qc:release-summary -- \
  --evidence "./.lime/qc/agent-qc-evidence.json" \
  --require-scenario-manifest "docs/test/agent-qc-scenarios.manifest.json" \
  --require-risk P0 \
  --tag "<release-tag>" \
  --output "./.lime/qc/release-agent-qc.md" \
  --check
```

完成审计：

```bash
npm run agent-qc:audit -- --format json
```

发布可继续的条件：

- 官方 `.lime/qc/agent-qc-evidence.json` 存在。
- `verdict.status` 是 `pass`。
- 覆盖 manifest 中全部 P0 scenario id。
- release summary `--check` 通过。
- waiver 有 owner、原因、过期时间、复测计划。

## 6. 当前 Lime 样本状态

截至 2026-05-11 01:13，本地测试体系已经具备标准、manifest、schema、qcloop exporter、release summary 和 audit，但不能宣称 P0 完成。

当前关键事实：

- `npm run agent-qc:check` 已能校验 scenario manifest 与 GUI flow manifest。
- `.github/workflows/release.yml` 已要求 Evidence Pack 和 P0 覆盖。
- `.lime/qc/agent-qc-evidence.json` 当前仍是 `fail`，不能发布。
- qcloop P0 v3 覆盖 8/8 P0，但只有部分通过。
- qcloop v4 已 completed / fail，6/6 exhausted；它证明旧 verifier / worker 环境不足以给出 P0 绿色证据。
- qcloop v5 已 completed / fail；6 个重跑项 0 pass，`claw-chat-ready-streaming`、`skill-forge-register-bind-enable`、`browser-runtime-site-adapter`、`workspace-ready-session-restore` 与 `release-package-startup-smoke` 均未产生可发布证据，其中多项 worker 明确输出 `QCLOOP_WORKER_RESULT=BLOCKED`，说明 qcloop worker 内 DevBridge health 被环境 / 权限阻断。
- `tool-approval-sandbox-boundary` 已补 `smoke:agent-runtime-approval-sandbox` 确定性 smoke，但当前 qcloop item 已 failed；worker stdout 自报 PASS 与 qcloop exit / verifier 结论冲突，不能替代官方 qcloop live transcript evidence。
- v5 completed 后宿主 shell 直连 `127.0.0.1:3030/health` 也失败；本轮已通过 headless Tauri 恢复宿主 DevBridge，并写入 `.lime/qc/qcloop-devbridge-health-restored.json`。
- 恢复宿主 DevBridge 后创建的只读 qcloop worker preflight job `1778403715309891000` 仍为 `blocked`：worker cwd/tmp 通过，但 `devbridge-health` 对 `127.0.0.1:3030` 仍 `fetch failed`。当前阻断已收敛为 qcloop 内层 worker loopback / sandbox 权限，不能直接重跑完整 P0。
- 通过隔离 qcloop server `127.0.0.1:18080`、独立 DB 和显式 Codex sandbox 配置，worker preflight job `1778404260108641000` 已通过，说明 qcloop worker 权限问题可以被环境修复。
- 在隔离 qcloop 下，`workspace-ready-session-restore`、`browser-runtime-site-adapter`、`skill-forge-register-bind-enable`、`release-package-startup-smoke` 四个 P0 sidecar 已通过；其中 release startup v2 明确只覆盖 `source-tree-startup-smoke`，不等同于 installer artifact 验证。
- 已启动 isolated full P0 v1 `1778405842243079000`：当前 4/8 success，`browser-runtime-site-adapter` running 且无 stdout/stderr，`--stale-minutes 1` 只读检查已标记 stale，后续 3 个 P0 pending；这仍是 sidecar running/stale 状态，不能覆盖官方 `.lime/qc/agent-qc-evidence.json`。
- 宿主 shell 直接执行 `agent-qc:qcloop-preflight -- --require-devbridge`、`smoke:browser-runtime`、`smoke:site-adapters` 已通过；browser runtime cleanup 有非阻断 warning，因此当前 full P0 卡点更像 qcloop worker / provider 无输出，而不是宿主 DevBridge 或产品命令不可用。
- 宿主 shell 直接执行 `harness:eval` 与 `harness:eval:trend` 已通过；trend 当前只有 1 个样本，只能作为 seed，仍需 qcloop verifier 和后续 nightly 样本确认长期趋势。
- 宿主 shell 直接执行 `smoke:workspace-ready`、`verify:app-version`、`verify:gui-smoke -- --reuse-running` 已通过；这证明 source-tree workspace / release smoke 可跑，但不替代 qcloop verifier 或 installer artifact 验证。
- 2026-05-10 19:50 只读刷新显示，仍有多个 qcloop 隔离批次未终态：`isolated-p0-full-v1` 4/8 success 且 `browser-runtime-site-adapter` stale；`nomcp-p0-v2` 已出现 `tool-approval-sandbox-boundary` failed；`mcpdisabled-p0-v1` 在 `claw-chat-ready-streaming` stale；`fast-p0-v1` 已通过 command bridge 后进入 `claw-chat-ready-streaming`；`fastmini-readonly-p0-v1` 已 terminal failed，8 个 item 全部 exhausted，sidecar evidence 为 6 fail / 2 blocked。主要原因是 verifier 正确拒绝缺少 deep evidence 的 worker 摘要，同时暴露了 `workspace-ready-session-restore` 中 `smoke:design-canvas` 保存成功状态断言失败，以及 `release-package-startup-smoke` GUI smoke 未自然收口。
- 这批失败把 P0 拆得更清楚：`verify:gui-smoke`、`smoke:agent-runtime-*`、`smoke:browser-runtime` 这类确定性 smoke 可以证明“主路径可执行”，但不能自动证明 live long-turn interrupt、approval/sandbox transcript、console/network trace、SkillTool gate 和 cleanup 证据都齐全。自主测试体系必须把二者分成不同证据层，而不是降低 P0 verifier。
- `smoke:design-canvas` 的细化证据已落到 `.lime/qc/design-canvas-failure-fastmini-workspace-extract.json`：页面已进入 `CANVAS:DESIGN 专属 GUI SMOKE`，DevBridge 为 `ok`，但 `project-roundtrip-save-open` 阶段没有出现 `已保存图层设计工程`，说明“页面可见”还不能证明“工程保存链路可用”。
- 当前仍有多个 GUI / DevBridge qcloop sidecar running 或 stale，后续 P0 必须先做到 GUI single-owner。否则多个 worker 复用同一个 `127.0.0.1:1420` / `127.0.0.1:3030` 会话，会让页面导航、按钮点击和状态断言互相干扰。manifest 已把 `GUI session owner / isolation statement` 与 `parallel GUI smoke interference` 纳入 GUI P0 证据。
- 2026-05-11 01:02 只读刷新显示，`isolated-p0-full-v1` 仍为 `stale`：4 success / 1 running / 3 pending / 1 stale，`browser-runtime-site-adapter` stale 约 `26202s`，DB lease 仍被 `qcloop-worker-1` 延长到 `2026-05-11T01:17:06+08:00`，active attempt stdout/stderr 仍为空；这证明当前卡点仍是 qcloop worker no-output owner，而不是可发布的 P0 完成。
- 最新完整 `verify:local` 已刷新为 `status=fail`，失败阶段是 `verify:gui-smoke / smoke:claw-chat-ready-streaming`。后续 direct Claw post-refresh fallback 已 pass，但另一轮 session-restore direct smoke 在 DevBridge 中途不可达时 fail；两者都只能作为 Claw deep flow 的 sidecar 证据，不能替代完整 `verify:local` pass。
- 2026-05-11 01:13 观察到外部 `verify:gui-smoke -- --reuse-running --timeout-ms 240000` 自然通过，且 Claw streaming / interrupt / resume 在 latest summary 中为 `verdict=pass`、`recoveryVisibleSource=live-stream`。这证明 GUI smoke 主链已经恢复到可通过状态，但 `.lime/qc/gui-process-owner-current.json` 仍显示 raw process owner `busy`，且完整 `verify:local` 尚未重跑通过。
- 2026-05-11 01:32 已把 raw process owner 检查脚本化为 `npm run agent-qc:process-owner-check`，把 qcloop SQLite lease 取证脚本化为 `npm run agent-qc:qcloop-db-lease`，并新增 `docs/tests/lime-agent-autonomous-test-execution-matrix.md` 作为 Lime 样本的执行矩阵。最新 sidecar 仍显示 `qcloop stale` 与 `raw process owner busy`，因此本轮仍不能启动完整 `verify:local` 或新的 full GUI P0。

这正是自主测试体系的价值：它没有把“本机某次手动看起来可用”误判为发布通过，而是把缺证据和真实产品 blocker 留在门禁中。

## 7. 近期执行顺序

在不打断本机其他进程的前提下，下一步按以下顺序推进：

1. 保留 qcloop v5 completed / fail sidecar、宿主 DevBridge 恢复 sidecar、默认 worker preflight blocked sidecar、isolated worker pass sidecar、4 个 isolated P0 pass sidecar，以及 release startup v1 blocked 历史证据，不覆盖官方 evidence。
2. 继续只读观察所有 running / stale qcloop 批次；若当前 worker 自然结束，再导出 sidecar 并根据终态决定是否复用待用 payload。没有 owner 明确授权前，不 kill、不 pause、不重启这些进程。
3. 把 P0 分成两层验收：确定性 smoke 层用于证明主路径可执行，deep evidence 层用于证明 live transcript / trace / console-network / cleanup / approval-sandbox 证据齐全；官方 release gate 仍必须看 deep evidence pass。
4. 先等当前 running/stale GUI qcloop 批次自然结束，或在 owner 明确授权下收口；下一轮只允许一个 GUI owner 跑 full P0，worker 必须输出 GUI session owner / isolation statement。
5. 在单一 GUI owner 前提下，定位 `workspace-ready-session-restore` 中 `smoke:design-canvas` 的保存成功状态断言失败，因为它已经是 qcloop worker 内可复现的 GUI P0 signal，不应被旧 isolated pass 覆盖；下一步重点是确认导出按钮点击后是否有保存中 / 保存成功状态，还是导出流程在首个可观察状态前卡住。
6. 把 `tool-approval-sandbox-boundary` 拆成更窄的 runtime transcript 或 harness replay 场景，让 approval / sandbox 证据以结构化 JSON 进入 verifier，而不是只引用组件级 smoke。
7. 在 `.lime/qc/gui-process-owner-current.json` 不再显示长时间 raw GUI smoke / Cargo owner 后，重新跑完整 `npm run verify:local`；只有该统一门禁通过，`local-verify-gate` 才能关闭。
8. 环境阻断解除后，定位 `claw-chat-ready-streaming` 的 stop / interrupt 后持久化、会话恢复和 DevBridge 中途不可达问题，补 Rust 或 harness replay 回归。
9. 只有 8/8 P0 全部 pass 后，才把结果导出为官方 `.lime/qc/agent-qc-evidence.json`，再运行 `npm run agent-qc:release-summary -- --check` 和 `npm run agent-qc:audit -- --format json`。

## 8. 与其他文档的关系

- 通用运营标准：`docs/tests/agent-ops-qc.md`。
- P0 场景执行手册：`docs/tests/agent-qc-p0-scenarios.md`。
- Lime 落地路线：`docs/tests/lime-agent-qc-rollout-plan.md`。
- Lime 执行矩阵：`docs/tests/lime-agent-autonomous-test-execution-matrix.md`。
- 当前 P0 阻断：`docs/tests/lime-agent-qc-current-blockers.md`。
- 机器可读场景：`docs/test/agent-qc-scenarios.manifest.json`。
- 机器可读证据 schema：`docs/test/agent-qc-evidence.schema.json`。

本文件负责回答“Lime 作为实际 Agent 产品，应该如何一步步从现有丰富测试升级为自主化运营测试体系”。
