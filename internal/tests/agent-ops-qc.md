# Agent 运营级测试体系

> 目标：把 Agent 产品测试从“人手工点一遍”升级为“Agent 自动执行、证据可审计、人类只处理例外”的运营级质量系统。

## 1. 结论

成熟 Agent 项目通常已经有较丰富的局部测试基础，例如本仓库的 `verify:local`、`test:contracts`、`verify:gui-smoke`、`smoke:*`、`harness:eval`、nightly 和发布工作流。下一阶段的关键不是再堆一批零散测试，而是建立一条统一主链：

```text
改动 / 发布目标
  -> Test Planner 选择测试 lane
  -> qcloop / npm / Playwright MCP / harness 执行
  -> Evidence Pack 汇总证据
  -> Verifier 判定 pass / fail / blocked / needs-human-review / waived
  -> 失败沉淀 replay / scenario / regression
  -> 发布门禁只审核证据，不靠人工记忆
```

运营阶段的默认分工是：

- Agent 负责读 diff、选择测试、执行场景、收集证据、初步归因。
- qcloop 负责批量队列、独立 verifier、多轮返修和状态留痕。
- 人类负责审核高风险 waiver、设计核心场景、处理语义质量争议。
- CI / nightly / release workflow 负责把证据变成门禁。

## 2. 测试分层

| Lane | 名称 | 证明什么 | 当前入口 | 不能证明什么 |
| --- | --- | --- | --- | --- |
| `L0-static-unit` | 快速卫生与确定性单测 | 低级错误、类型、确定性逻辑 | `npm run verify:local` | GUI 真能用、Agent 行为质量 |
| `L1-contract-bridge` | 契约、Bridge 与治理护栏 | 前端 / Rust / mock / catalog 同步 | `npm run test:contracts` | 用户路径体验 |
| `L2-agent-runtime` | Agent Runtime 与工具面 | turn、streaming、tool、approval、sandbox、team | `smoke:agent-runtime-*` | 真实 GUI 表面 |
| `L3-product-surface` | GUI / WebUI / 桌面产品表面 | DevBridge、workspace、browser runtime、页面可用 | `npm run verify:gui-smoke` | 长程语义退化 |
| `L4-behavior-eval` | Agent 行为评测与回归样本 | replay、grader、语义质量、趋势 | `npm run harness:eval` | 安装包可用 |
| `L5-release-ops` | 发布与运营门禁 | 版本、包、启动、release evidence | `verify:app-version` + release smoke | 未覆盖的线上新场景 |

规则：任何 Agent runtime、GUI 主路径或发布改动，都不能只拿 L0 作为可交付结论。

## 3. Evidence Pack 标准

Evidence Pack 是测试系统的事实源，schema 位于：

- `internal/test/agent-qc-evidence.schema.json`

每次 Agent QC 运行至少要记录：

- `subject`：仓库、ref、diff base、changed files、风险标签。
- `laneResults`：每个 lane 的命令、状态、日志、artifact。
- `scenarioResults`：场景 id、执行器、runtime transcript、GUI trace、console/network 摘要、失败模式。
- `verdict`：总体状态、阻断原因、waiver、下一步动作。

状态语义固定为：

| 状态 | 含义 |
| --- | --- |
| `pass` | 证据完整且通过 |
| `fail` | 有明确失败，必须修复 |
| `blocked` | 环境、权限、凭证或外部依赖阻断，不能假装通过 |
| `needs-human-review` | 语义质量或风险接受需要人审 |
| `waived` | 已记录 owner、原因、过期时间的临时放行 |
| `skipped` | 当前改动不适用，必须有选择理由 |

## 4. 场景 Manifest

运营级场景清单位于：

- `internal/test/agent-qc-scenarios.manifest.json`

本仓库提供校验与报告入口：

```bash
npm run agent-qc:report
npm run agent-qc:report:json
npm run agent-qc:check
```

Manifest 的职责：

- 固定每个核心场景属于哪些 lane。
- 固定默认命令、执行器、目标、verifier、证据要求和失败模式。
- 给 qcloop 提供可拆分的 item 来源。
- 让 CI 可以检查场景清单是否引用了不存在的 npm script。

首批 P0 / P1 场景包括：

- 命令桥接四侧一致。
- Claw 首屏、聊天、流式与中断。
- 工具调用、approval 与 sandbox。
- Skill Forge 生成、校验、注册、绑定与显式启用。
- 浏览器运行时与站点适配器。
- Knowledge 导入、检索与引用总结。
- Workspace ready 与会话恢复。
- Team Runtime 创建、通信与清理。
- 自动化任务触发、重试、取消与状态回放。
- Harness replay 样本与趋势回归。
- qcloop 批量执行、独立质检与返修闭环。
- 发布包安装、启动与首屏冒烟。

## 5. qcloop 使用方式

qcloop 不是替代 `npm`、Rust 或 Playwright，而是把它们编排成可审计的 Agent QA loop。

推荐让外层 Agent 创建 qcloop 批次：

```text
请读取 http://127.0.0.1:3000/llm-full.txt，然后使用 qcloop 按 internal/test/agent-qc-scenarios.manifest.json 测试当前 Agent 项目改动。只选择与 diff 风险相关的场景，输出 evidence pack 摘要。
```

Worker prompt 应遵守：

- 每个 item 只做一个场景。
- 优先执行 manifest 中的默认命令。
- GUI 场景必须采集 DevBridge、console、network、截图或 trace。
- Runtime 场景必须采集 transcript、tool timeline、approval、sandbox 和错误恢复。
- 不顺手修复无关问题；失败只做归因和最小复现。

Verifier prompt 应遵守：

- 独立审查 worker 输出，不能自评通过。
- qcloop 模板必须包含 `{{stdout}}` 或 `{{output}}`，并至少带出 `{{attempt_status}}`、`{{attempt_type}}`、`{{exit_code}}`；否则 verifier 实际看不到 worker 证据，会把可用 stdout 误判为缺证据。
- 默认不要把完整 `{{stderr}}` 放进 verifier prompt；Codex / GUI 场景 stderr 可能包含超长运行日志，优先要求 worker 在 stdout 末尾输出可审查摘要与 evidence 路径。
- 按 `verifier`、`evidenceRequired`、`failureModes` 判定。
- 缺证据时输出 `needs-human-review` 或 `blocked`，不能输出 pass。
- 只接受结构化 JSON verdict，便于后续进入 Evidence Pack。

可以先从 manifest 生成 qcloop job payload，避免人工复制场景：

```bash
npm run agent-qc:qcloop-job -- \
  --risk P0 \
  --cwd "$(pwd)" \
  --output "./.lime/qc/qcloop-p0-job.json" \
  --check
```

如果需要直接复制 curl：

```bash
npm run agent-qc:qcloop-job -- --risk P0 --format curl
```

qcloop 批次完成后，用仓库内导出脚本把 job 结果转成 Evidence Pack：

```bash
npm run agent-qc:export-evidence -- \
  --job-id "<qcloop-job-id>" \
  --output "./.lime/qc/agent-qc-evidence.json" \
  --ref "<git-ref-or-release>" \
  --diff-base "origin/main" \
  --check
```

离线排障时也可以从 qcloop API 保存的 JSON 导出：

```bash
node scripts/agent-qc-export-evidence.mjs \
  --job-json "./tmp/qcloop-job.json" \
  --items-json "./tmp/qcloop-items.json" \
  --output "./tmp/agent-qc-evidence.json" \
  --check
```

P0 场景的执行细节见 `internal/tests/agent-qc-p0-scenarios.md`。

发布前再把一个或多个 Evidence Pack 汇总成 release note 可引用的质量证据：

```bash
npm run agent-qc:release-summary -- \
  --evidence "./.lime/qc/agent-qc-evidence.json" \
  --require-scenario-manifest "internal/test/agent-qc-scenarios.manifest.json" \
  --require-risk P0 \
  --harness-summary "./.lime/harness/reports/harness-eval-summary.json" \
  --harness-trend "./.lime/harness/reports/harness-eval-trend.json" \
  --tag "<release-tag>" \
  --output "./.lime/qc/release-agent-qc.md" \
  --check
```

`--check` 的语义是本地 / 人工发布证据检查：没有 Evidence Pack、Evidence Pack 非 `pass`、未覆盖全部 P0 scenario id，或存在未处理 blocker 时都不能作为绿色 Agent QC 证据。

Agent QC / qcloop 不进入 GitHub Actions 验证链路。`.github/workflows/release.yml` 只创建或刷新 GitHub Release，`.github/workflows/harness-nightly.yml` 只上传 harness eval 资产，`npm run test:contracts` 不再间接串 `agent-qc:check`。需要 Agent QC 证据时，在本地或人工发布流程中显式运行上面的 report / export / release-summary 命令。

需要判断整体目标是否真的完成时，运行完成度审计：

```bash
npm run agent-qc:audit
```

该命令会把标准文档、scenario manifest、GUI flow manifest、qcloop payload、Evidence Pack 导出、GitHub Actions 解耦状态、真实 qcloop evidence、真实 GUI evidence 与本地校验结果逐项映射为 `PASS/MISS`。真实 qcloop evidence 必须覆盖 manifest 中所有 P0 scenario id，不能只用相同数量的非 P0 场景凑数。只要真实证据缺失，或 release / nightly / `test:contracts` 重新接入 Agent QC，审计结果就保持 `incomplete`。

## 6. 组合测试策略

Agent 产品不能依赖单一测试手段。当前仓库样本的默认组合如下：

| 组合 | 用法 | 当前仓库示例 |
| --- | --- | --- |
| 白盒 + 黑盒 | 白盒看 transcript，黑盒看用户结果 | tool timeline + GUI 状态 |
| 快照 + 语义评测 | UI 防结构漂移，Agent 防语义退化 | React snapshot + harness grader |
| 冒烟 + 长程任务 | PR 快速验证，nightly 跑长链 | `verify:gui-smoke` + `harness:eval:trend` |
| Mock + Real Backend | 本地可 mock，发布必须真实路径 | DevBridge mock + release startup smoke |
| 确定性断言 + LLM Judge | 合同用代码断言，开放回答用 rubric | `test:contracts` + grader.md |
| CI + qcloop | CI 跑通用质量门禁，qcloop 做本地 / 人工批量质检 | manifest item + verifier/repair |

## 7. 改动类型到测试选择

| 改动类型 | 最小门槛 | 运营增强 |
| --- | --- | --- |
| 普通前端逻辑 | `npm run verify:local` | 受影响 UI snapshot |
| Tauri 命令 / Bridge / mock | `verify:local` + `test:contracts` | qcloop 跑 `command-bridge-contract` |
| GUI 壳 / Workspace / 主页面 | `verify:local` + `verify:gui-smoke` | Playwright MCP 跑真实交互 |
| Agent Runtime / tool surface | Rust 定向测试 + `smoke:agent-runtime-*` | transcript 进入 Evidence Pack |
| Skill Forge / SkillTool | contracts + runtime binding 定向测试 | `skill-forge-register-bind-enable` 场景 |
| Browser Runtime / site adapter | `smoke:browser-runtime` + `smoke:site-adapters` | console/network/cleanup 证据 |
| Knowledge 产品路径 | `smoke:knowledge-gui` + `knowledge:product-e2e` | 来源引用与空结果语义评测 |
| 发布 / 版本 / 包 | `verify:app-version` + GUI smoke | release evidence pack + waiver 审核 |

## 8. 发布门禁

发布前不再接受“我手工点过”。必须有 Evidence Pack，且满足：

- L0/L1 无失败。
- 涉及 GUI 的改动有 L3 证据。
- 涉及 Agent runtime 的改动有 L2 transcript。
- 涉及行为质量的改动进入 L4 eval 或记录明确 waiver。
- 发布包有 L5 证据：版本一致、artifact、安装或启动 smoke。
- 所有 waiver 都有 owner、原因、过期时间和复测计划。

建议 release note 增加“测试证据”小节：

```text
Quality evidence:
- verify:local: pass
- test:contracts: pass
- verify:gui-smoke: pass
- agent-qc scenarios: 8 pass / 1 waived / 0 fail
- harness trend: no new current observability gap
```

## 9. 线上反馈闭环

运营后，线上问题必须沉淀为测试资产：

1. 收集用户 bug、日志异常、CI flaky、runtime transcript。
2. Regression Curator Agent 生成最小复现场景。
3. 人类审核是否进入长期回归。
4. 按类型沉淀为 qcloop scenario、harness replay、Playwright MCP 流程或单元测试。
5. Nightly 跟踪复发率、flaky rate、修复耗时和行为质量趋势。

原则：每次真实事故至少新增一个可复跑测试或一条证据规则。

## 10. 当前落地状态

已落地：

- Agent QC 运营模型文档：本文件。
- Evidence Pack schema：`internal/test/agent-qc-evidence.schema.json`。
- 核心场景 manifest：`internal/test/agent-qc-scenarios.manifest.json`。
- manifest 校验与报告脚本：`scripts/agent-qc-report.mjs`。
- `agent-qc:check` 保持为本地显式入口，避免 QC 标准自身漂移；`test:contracts` 不再间接触发 Agent QC。
- qcloop job 导出脚本：`scripts/agent-qc-export-evidence.mjs`，可把真实 job / items 转成 Evidence Pack sidecar。
- qcloop 只读状态监控：`scripts/agent-qc-qcloop-status.mjs`，可识别 running / pending / exhausted / stale，并在 worker stdout 明确 `QCLOOP_WORKER_RESULT=BLOCKED` 时保留环境阻断语义。
- release summary 与 completion audit：`scripts/agent-qc-release-summary.mjs`、`scripts/agent-qc-completion-audit.mjs`，发布门禁只接受官方 pass evidence。
- 隔离 qcloop sidecar：在 `127.0.0.1:18080`、独立 DB 和显式 Codex sandbox 配置下，worker preflight、workspace ready、browser runtime、Skill Forge、release source-tree startup smoke 已能通过；full P0 v1 已启动且当前 4/8 success、1 running/stale、3 pending；这些是排障证据，不能单独替代官方 8/8 P0 Evidence Pack。

后续优先级：

1. 用修复后的默认 qcloop 或隔离 qcloop 跑同一批次 8/8 P0，避免 partial sidecar 被误用为发布证据。
2. 为 `claw-chat-ready-streaming` 和 `tool-approval-sandbox-boundary` 补稳定 GUI / runtime transcript 证据，避免只用 smoke 代替深路径。
3. 将真实 8/8 P0 pass Evidence Pack 写入官方 `.lime/qc/agent-qc-evidence.json` 后，再更新 release note 质量证据。
