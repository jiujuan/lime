# Lime 测试体系待办（2026）

> 本文件只保留当前仍未解决的测试问题；已落地能力已从优先级清单移除。

## 1. 事实源与分类

### current

以下路径已经是当前测试体系的事实源，不再作为“待建设能力”重复列入：

- `internal/test/README.md`：当前测试入口与命令索引
- `internal/test/e2e-tests.md`：当前浏览器续测与 E2E 总览入口
- Electron Desktop Host / preload / IPC：当前桌面壳与 GUI smoke 的事实源
- App Server JSON-RPC：当前 Agent runtime、跨 App 复用和服务化能力的事实源
- `packages/app-server-client`：当前前端 / 外部 App 复用 App Server 的 TypeScript client 事实源
- `src/lib/desktop-host/`：当前前端桌面 host mock 与 bridge fallback 事实源
- `internal/tests/agent-ops-qc.md`：当前 Agent 运营级测试体系、qcloop 场景与 Evidence Pack 门禁
- `internal/tests/agent-qc-p0-scenarios.md`：当前 Agent QC P0 场景执行、GUI/runtime 证据与失败沉淀手册
- `internal/tests/lime-agent-qc-rollout-plan.md`：当前 Lime 样本产品的 Agent 运营级测试分阶段落地计划
- `internal/test/agent-qc-scenarios.manifest.json`：当前 Agent QC 机器可读场景清单
- `internal/test/agent-qc-evidence.schema.json`：当前 Agent QC Evidence Pack schema
- `internal/test/agent-qc-gui-flows.manifest.json`：当前 Agent QC GUI / Playwright MCP flow 清单
- `internal/aiprompts/playwright-e2e.md`：当前浏览器续测 / Playwright MCP 事实源
- `package.json`：当前统一测试命令入口
- `npm run smoke:electron`：当前 Electron GUI 最小 smoke 入口
- `npm run verify:gui-smoke`：当前 GUI smoke 聚合入口，默认应串联 Electron current smoke
- `scripts/local-ci.mjs`：当前本地智能校验入口
- `scripts/agent-qc-report.mjs`：当前 Agent QC 场景报告与合同检查入口
- `scripts/agent-qc-gui-flow-report.mjs`：当前 Agent QC GUI flow 报告与合同检查入口
- `scripts/agent-qc-qcloop-job.mjs`：当前 Agent QC manifest 到 qcloop job payload 的生成入口
- `scripts/agent-qc-export-evidence.mjs`：当前 qcloop job 到 Evidence Pack 的导出入口
- `scripts/agent-qc-release-summary.mjs`：当前 Agent QC Evidence Pack 到 release note 质量证据的汇总入口
- `scripts/agent-qc-completion-audit.mjs`：当前 Agent QC 整体目标完成度审计入口
- `.github/workflows/harness-nightly.yml`：当前只上传 harness eval / cleanup / dashboard 资产，不进入 Agent QC / qcloop 验证
- `.github/workflows/release.yml`：当前只创建或刷新 GitHub Release，不读取 Agent QC Evidence Pack
- `scripts/report-legacy-surfaces.mjs`：当前 legacy / compat 回流护栏

### compat

- `safeInvoke`、DevBridge fallback、旧 `agent_runtime_*` facade：迁移期兼容入口，只能证明调用能委托到 current 路径
- `npm run test:bridge`：桥接兼容最小守卫；不得单独作为 Electron GUI current 可交付证据

### deprecated

- legacy Tauri adapter、legacy `tauri-mock`、旧 `tauri::generate_handler!` 相关测试口径
- `tauri-driver` 作为仓库推荐 E2E 方案的说法
- `npm run test:e2e` 作为现行测试入口的说法

### dead

- 旧 `src-tauri` 路径、旧 Tauri GUI smoke、旧 Tauri-only E2E 口径
- `npm run test:e2e` 作为现行仓库命令已不存在，不应继续作为测试标准引用

## 2. 已从待办移除的事项

以下能力已具备基础，不再保留在优先级清单中：

- 前端 `Vitest` 覆盖已经足够广，`src/components`、`src/hooks`、`src/lib/api`、`src/features/browser-runtime` 等已有大量测试
- Rust 单测 / 集成测试基础已经存在，`lime-rs/src` 与多个 workspace crate 都有可运行测试
- 本地统一校验入口已经存在：`test:frontend`、`test:bridge`、`test:rust`、`verify:local`、`verify:local:full`
- 桥接基础测试已经存在：`src/lib/dev-bridge/safeInvoke.test.ts`、`src/lib/desktop-host/core.test.ts`；legacy `src/lib/tauri-mock/core.test.ts` 如保留，只能作为退役守卫
- legacy 治理护栏已经存在：`npm run governance:legacy-report`
- 旧权限表面治理护栏已经补齐：`src/lib/governance/legacyToolPermissionGuard.test.ts` + `npm run governance:legacy-report`
- 跨层命令契约检查基础版已经落地：`npm run test:contracts` 已进入 `scripts/local-ci.mjs`
- 命令契约延期例外已经收口：`agent_terminal_command_response`、`agent_term_scrollback_response` 已退出 `runtimeGatewayCommands`，改为 `dead-candidate` 治理监控
- 自包含 smoke 最小基线已落地：`npm run smoke:electron`、`npm run smoke:workspace-ready`、`npm run smoke:browser-runtime`、`npm run smoke:site-adapters` 都无需人工准备；另外，`npm run smoke:agent-runtime-tool-surface` 与 `npm run smoke:agent-runtime-tool-surface-page` 已补齐“runtime inventory -> 应用层透传 / Runtime strip / 工作台 Runtime 能力摘要”这条应用层主线 smoke，`npm run verify:gui-smoke` 现已默认串联 Electron/App Server current smoke
- 测试文档事实源已经收口：`internal/test/README.md`、`internal/test/e2e-tests.md`、`internal/aiprompts/playwright-e2e.md` 已按“索引 / 总览 / 详细事实源”分层

## 3. 当前仍未解决的问题优先级

| 优先级 | 事项                                        | 为什么重要                                          | 当前证据                                                                                                                                                                                                  | 完成定义                                                                                               |
| ------ | ------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| P1     | Agent eval 仍未完全工程化                   | 价值高，且当前最缺的是把证据沉淀成长期回归资产      | 已补 `internal/test/harness-evals.md`、`harness-evals.manifest.json`、`scripts/harness-eval-runner.mjs`、`scripts/harness-eval-trend-report.mjs` 与 nightly 摘要 / trend 骨架，但真实执行与更多高价值样本仍缺 | 形成稳定任务集、可增长 replay 样本、grader、nightly 输出与趋势指标                                     |
| P1     | qcloop 真实运行结果尚未导出为 Evidence Pack | 运营级测试需要从“场景清单”进入“每次运行可审计证据” | 已补 Agent QC manifest、evidence schema 与本地报告脚本；Agent QC 已从 GitHub Actions / `test:contracts` 验证链路移出 | qcloop 批次可导出 `agent-qc-evidence.schema.json` 形状，并可被本地 / 人工发布证据流程消费             |
| P2     | terminal / App Server sidecar 自包含 smoke 仍可继续扩面 | 最小 GUI smoke 基线已具备，但更细分主链仍缺专项守卫 | 当前 `smoke:electron / workspace-ready / browser-runtime / site-adapters` 已覆盖 GUI 最小主链；`smoke:social-workbench` 仍依赖已有 session，terminal / App Server sidecar 还没有各自独立的自包含 smoke 入口                            | 如后续需要继续扩面，应补 terminal 或 App Server sidecar 的独立 smoke，而不是继续把现有 current smoke 算成缺口 |

## 4. 建议执行顺序

### 第 1 步：把 Agent eval 工程化

现在可以把它提到第一优先级，因为前面的最小 GUI smoke 基线已经具备：

- 有稳定门禁
- 有稳定契约检查
- 有可重复 smoke

当前已先补：

- 固定 manifest 与 replay fixture
- runner 摘要出口
- nightly artifact 与 trend 骨架

后续再继续补：

- transcript 存档
- 更多真实高价值 replay 样本
- 更长窗口的趋势报表

### 第 2 步：按需继续扩自包含 smoke 覆盖面

如果后续还要补 smoke，不要重复把 `workspace-ready / browser-runtime / site-adapters` 记成“未完成”。

下一轮更合理的扩面方向是：

1. terminal 基础链路
2. App Server sidecar 基础链路
3. 仍依赖人工前置状态的专项 smoke 去人工化

## 5. 当前建议

如果只看投入产出比，当前最值得先做的两刀是：

1. 把 Agent eval 工程化
2. 如需继续补 smoke，优先做 terminal / App Server sidecar 专项自包含场景

这两步做完之后，再继续往 nightly、趋势报表与 replay promotion 收口，收益会更高。
