# 测试分层治理执行进度

> 补充执行记录：`internal/roadmap/test/README.md` 当前仍有并行写集，本文件用于保留可验证进度；README 释放后再回填主记录。

## 目标

- 将 Lime 前后端测试拆成纯单元、集成和 E2E / live-gated 层。
- 本地和 AI TDD 默认只跑纯单元测试。
- 前端复杂 UI / hook 逻辑优先抽到 View Model / projection / selector / helper，并用 `*.unit.test.ts` 覆盖；组件测试只保留渲染、事件接线和关键 UI 回归。
- 后端 Rust 单元测试默认不触发真实 Provider / ASR / live 网络路径。

## 已完成事实

- 前端分层入口已可用：`npm run test:unit`、`test:component`、`test:contract`、`test:integration`、`test:e2e`、`test:layers:stats`、`test:frontend:all`。
- Rust 分层入口已可用：`npm run test:rust:unit`、`test:rust:integration`、`test:rust:e2e`、`test:rust:layers:stats`。
- 测试分层规则已写入 `AGENTS.md` 和 `internal/aiprompts/quality-workflow.md`。
- CI quick gate 已接入分层入口：
  - PR 前端改动跑 `npm run test:unit` + `npm run test:contract`。
  - PR / main 前端验证在单测前运行 `node scripts/check-vitest-layer-budget.mjs --max-component-candidates 8`，防止 component VM 迁移候选数回升。
  - PR Rust 改动跑 `npm run test:rust:unit`。
  - main / 手动触发仍保留全量前端与 Rust 验证。
- 本地 Makefile 已接入分层入口：
  - `make tdd` 委托 `npm run test:unit`，作为本地 / AI TDD 的前端第一信号。
  - `make tdd-file FILE=...` 委托 `npm run test:unit -- <file>`，作为本地 / AI TDD 的单文件快速回路；传错层文件会被 Vitest 分层 runner 拦截。
  - `make tdd-rust` 委托 `npm run test:rust:unit`，作为后端第一信号。
  - `make test-layer-stats` 同时输出前端和 Rust 分层统计。
- 新增 component VM 迁移候选预算检查：
  - `scripts/check-vitest-layer-budget.mjs` 默认以 8 个候选为当前预算。
  - `make test-layer-budget` 会在候选数超过预算时失败，用于防止新 component 大测试回流。
- 新增 Rust E2E 默认运行预算检查：
  - `scripts/check-rust-layer-budget.mjs` 默认要求 Rust E2E 层文件不存在非 `ignore` 测试。
  - `make test-rust-layer-budget` 和 CI `Rust Quick` 在 `npm run test:rust:unit` 前执行该检查，防止 E2E / live-gated Rust 测试回流到 TDD 默认路径。
  - 该检查不把 unit 文件内“普通单测 + ignored live 测试”的混合结构当成失败；此类文件仍可运行普通单测，但 live 测试必须继续由 `#[ignore]` / `LIME_REAL_API_TEST=1` 门禁控制。
  - `scripts/rust-test-layer-classifier.test.mjs` 已补 mixed unit/live fixture，锁住该分类边界，避免后续把含 ignored live 的 unit 文件误迁到 E2E 或默认失败预算。
- 测试文件收集边界已补强：
  - `scripts/lib/vitest-test-file-filter.mjs` 排除 `*.testFixtures.*` / `*.test-fixture.*` 这类测试夹具支持文件。
  - `scripts/run-vitest-layer.mjs` 和 `scripts/lib/vitest-layer-report.mjs` 都复用该过滤边界，避免 fixture 被当成真实 component 测试运行或统计。
- Vitest 分层 runner 已补错层过滤器保护：
  - 显式传入测试文件时，`scripts/run-vitest-layer.mjs` 会校验每个过滤器至少命中当前层。
  - 如果文件只属于其他层或完全没有命中可运行测试，runner 直接失败并打印实际命中层，避免 AI / 本地 TDD 把“错层文件被跳过”误判为已验证。
- `HarnessStatusPanel` 已完成第一轮拆分：
  - `HarnessStatusPanel.tsx` 约 476 行。
  - `harnessStatusPanelViewModel.ts` 约 378 行。
  - 新增 `harnessEvidenceViewModel.ts`，承载 evidence / replay / review / LimeCore policy 纯逻辑。
  - 新增 `harnessEvidenceViewModel.unit.test.ts`，把 evidence 相关断言从总 VM 单测拆出。
  - `HarnessStatusPanel.test.tsx` 从巨型单文件拆成 focused component 测试集和共享 fixture，主文件约 300 行。

## 当前验证证据

2026-06-03 当前已验证：

- `npm run test:layers:stats`
  - Total files: 1008
  - Runnable by default: 1007
  - Live-gated: 1
  - unit: 486
  - component: 393
  - contract: 78
  - integration: 50
  - e2e: 1
  - Component unit-migration candidates: 8
- `npm run test:unit -- src/components/agent/chat/components/harnessStatusPanelViewModel.unit.test.ts src/components/agent/chat/components/harnessEvidenceViewModel.unit.test.ts`
  - 2 files / 24 tests passed
- `npm run test:unit`
  - 482 files / 2849 tests passed。
  - 4 files / 7 tests failed，当前不能作为绿色 TDD 默认入口。
  - 失败集中在并行写集：`agentStreamRuntimeHandler.unit.test.ts`、`agentStreamTurnEventBinding.test.ts`、`harnessState.test.ts`、`workspaceServiceSkillEntryActionsViewModel.unit.test.ts`。
  - 全量耗时 `114.84s`，当前前端 unit 入口过重；修绿后仍需继续压缩 TDD 第一信号范围或拆更细入口。
- `npm run test:component -- src/components/agent/chat/components/HarnessStatusPanel*.test.tsx`
  - 7 files / 49 tests passed
- `npm run test:rust:layers:stats`
  - Total files: 779
  - Total test attributes: 8553
  - Runnable by default: 414
  - Live-gated: 10
  - unit: 771 files / 8536 tests / 410 runnable
  - integration: 4 files / 6 tests / 4 runnable
  - e2e: 4 files / 11 tests / 0 runnable
- `npm run test:rust:e2e`
  - 默认 gate 生效；未设置 `LIME_REAL_API_TEST=1` 时不运行 ignored/live Rust E2E。
- `/usr/bin/time -p npm run test:rust:unit`
  - 1551 passed / 1 ignored / 0 failed。
  - `real 61.76`，未出现 Cargo lock 等待提示；该数据可作为当前后端 TDD 默认入口的干净耗时基准。
- `.github/workflows/quality.yml`
  - 新增 `Rust Quick` job，PR Rust 变更默认执行 `npm run test:rust:unit`。
  - `Quality results` 汇总新增 `rust_quick` gate 与失败提示。
- `npm run test:unit -- scripts/quality-task-selector.test.ts`
  - 1 file / 1 test passed。
- `make -n help tdd tdd-rust test-layer-stats test-all-layers`
  - Makefile 目标解析通过。
- `make tdd-file FILE=scripts/run-vitest-layer.unit.test.mjs`
  - 1 file / 5 tests passed，耗时约 3.78s；可作为 AI 修改单个纯单元文件后的快速 TDD 回路。
- `make tdd-file FILE=scripts/rust-test-layer-classifier.test.mjs`
  - 预期失败通过；runner 输出 `wrong-layer matched layers=integration`，证明单文件 TDD 入口不会把 integration 文件伪装成 unit 绿色。
- `make tdd-file`
  - 预期失败通过；输出 `FILE is required`。
- `make test-layer-stats`
  - 前端和 Rust 分层统计均执行通过。
- `npm run test:unit -- scripts/check-vitest-layer-budget.test.mjs`
  - 1 file / 3 tests passed。
- `node scripts/check-vitest-layer-budget.mjs --max-component-candidates 8`
  - Component unit-migration candidates: 8，Status: ok。
- `make test-layer-budget`
  - 预算检查通过。
- `npm run test:unit -- scripts/check-rust-layer-budget.test.mjs scripts/check-vitest-layer-budget.test.mjs`
  - Rust / frontend 预算脚本单测通过。
- `npm run test:unit -- scripts/run-vitest-layer.unit.test.mjs scripts/check-rust-layer-budget.test.mjs`
  - 2 files / 9 tests passed；覆盖 Vitest runner 参数解析和错层过滤器保护。
- `npm run test:unit -- --list --explain | rg "run-vitest-layer|check-rust-layer-budget"`
  - 确认 `scripts/run-vitest-layer.unit.test.mjs` 和 `scripts/check-rust-layer-budget.test.mjs` 都属于 unit 层。
- `node -e "... spawnSync(... ['scripts/run-vitest-layer.mjs', 'unit', 'scripts/rust-test-layer-classifier.test.mjs'] ...)"`
  - 预期失败通过；runner 输出 `wrong-layer matched layers=integration`，证明错层文件不会再被静默跳过。
- `npm run test:integration -- scripts/rust-test-layer-classifier.test.mjs`
  - 1 file / 5 tests passed；覆盖 Rust unit / integration / e2e / excluded subcrate，以及 mixed unit + ignored live 分类边界。
- `npm run test:integration -- --list | rg "scripts/rust-test-layer-classifier.test.mjs"`
  - 确认 Rust classifier fixture 测试因使用临时文件系统而属于 integration 层，不进入 TDD 默认 `test:unit`。
- `node scripts/check-rust-layer-budget.mjs --max-e2e-runnable 0`
  - E2E files with non-ignored tests: 0，Status: ok。
- `make test-rust-layer-budget`
  - Rust E2E 默认运行预算检查通过。
- `make tdd-rust-filter FILTER=prop_valid_client_type_parsing`
  - 命令入口通过但实际运行 `0` 个测试；该过滤器当前不是有效证据，不能计入后端 TDD 定向验证。
- `make tdd-rust-filter FILTER=workspace_support::tests::sanitize_project_dir_name_should_replace_invalid_chars`
  - 先执行 Rust E2E 默认运行预算检查，随后只运行 root `lime` lib 中 1 个 Rust unit 测试。
  - 1 test passed，1551 filtered out。
  - 调整为先校验 `FILTER`，再执行预算检查，避免缺参数时跑无意义校验。
  - `real 11.45`，可作为后端单测定向 TDD 回路证据；全量后端 unit 基准仍是约 `61.76s`。
- `make tdd-rust-filter`
  - 预期失败通过；缺 `FILTER` 时立即输出参数提示，不再先跑 Rust layer budget。
- `npm run test:unit -- scripts/lib/vitest-test-file-filter.test.mjs scripts/lib/vitest-layer-report.unit.test.mjs scripts/run-vitest-layer.unit.test.mjs scripts/check-vitest-layer-budget.test.mjs`
  - 4 files / 11 tests passed。
- `.github/workflows/quality.yml`
  - `Frontend Quick` 和 `Frontend Full` 都已接入 `Test layer budget` step。
  - frontend quick / full 的失败提示包含预算检查复现命令。
  - `Rust Quick` 已接入 `Rust layer budget` step，并在失败提示中给出 Rust unit-layer 本地复现命令。
- `npm run test:component -- --list --explain`
  - `HarnessStatusPanel.testFixtures.tsx` 未出现在 component 层列表中。

## 当前阻塞与不可夹写范围

- `internal/roadmap/test/README.md` 当前仍有并行写集，暂不直接写入。
- 全量 `npm run test:unit` 仍有 4 个文件 / 7 个断言失败，且失败相关写集当前不安全：
  - `src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts` 为未跟踪文件。
  - `src/components/agent/chat/utils/harnessState.ts` 为并行 dirty 文件。
  - `src/components/agent/chat/hooks/agentStreamTurnEventBinding.test.ts` 当前断言仍依赖上述运行时行为。
  - `src/components/agent/chat/workspace/workspaceServiceSkillEntryActionsViewModel.unit.test.ts` / `workspaceServiceSkillEntryActionsViewModel.ts` 仍在并行新增写集。

## 剩余主线

1. 等并行写集释放后，修复全量 `npm run test:unit` 的 4 个失败文件，确保纯单元默认入口可作为 TDD 第一信号。
2. 继续治理 8 个 component migration candidates：
   - `src/components/agent/chat/components/EmptyState.test.tsx`
   - `src/components/agent/chat/components/GeneralWorkbenchSidebar.test.tsx`
   - `src/components/agent/chat/components/MarkdownRenderer.test.tsx`
   - `src/components/agent/chat/components/MessageList.test.tsx`
   - `src/components/agent/chat/components/StreamingRenderer.test.tsx`
   - `src/components/agent/chat/workspace/useWorkspaceConversationSceneRuntime.test.ts`
   - `src/components/agent/chat/workspace/useWorkspaceSendActions.test.tsx`
   - `src/components/agent/chat/workspace/useWorkspaceServiceSkillEntryActions.test.tsx`
3. 分析 Rust unit 默认入口约 61.76 秒的主要耗时来源，决定是否继续把后端 TDD 第一信号拆到更窄 crate / package 默认集。
4. 将本文件的进度摘要回填到 `internal/roadmap/test/README.md`，再删除或归档本补充记录。
