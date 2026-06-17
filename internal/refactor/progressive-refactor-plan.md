# 结构重构执行计划（机制驱动版）

> 状态：轴 A/B/F 主体完成、轴 C/D/E 继续收口（2026-06-18 复核更新）
> 上位规则：`AGENTS.md`、`internal/refactor/README.md`
> 证据底座：`architecture-debt-analysis.md`（条目优先级争议先回去核对证据）

每个条目独立可交付、可随时停。排序原则：**优先消除"新代码默认流向旧位置"的机制**，存量症状（拆大文件）作为各轴副产品偿还。

## 完成度口径

- **整体目标**：五个膨胀机制（轴 A-E）全部被机械守卫锁死 + 存量超线文件进入只减不增通道。
- **Y% 计算**：轴 A/B/C 各 25%（机制消除），轴 D/E 各 10%，轴 F 护栏 5%。存量文件拆了多少**不计入主口径**（它是轴 B/C 的验收副产品），仅在进度日志记录。
- **当前状态（2026-06-18 复核 + R-60 收口）**：约 **75%**。轴 A **25/25**（codegen + re-export + 守卫入链 test:contracts 全闭环）、轴 B ≈20/25（runtime/processor domain 化，aster 未动）、轴 C ≈13/25（守卫齐 + 状态分层进行中，AgentChatWorkspace 已开第一刀）、轴 D ≈8/10、轴 E ≈7/10、轴 F **5/5**（基线刷新 + 守卫恢复绿）。

---

## P0 · R-01 锁文件统一到 pnpm

**状态**：代码面完成（2026-06-11）
**已完成**：
- `package-lock.json` 已删除
- `pnpm-lock.yaml`（lockfileVersion 9.0）保留
- `packageManager` 已修正为 `"pnpm@9.15.9"`（与 CI `version: 9` + lockfile v9.0 对齐）

**剩余收尾（待网络恢复后执行）**：
1. `pnpm install` 验证（本地 pnpm 7.1.9 与 Node 23 存在兼容性问题，需 corepack/网络安装 pnpm 9）。
2. `npm run verify:app-version` 通过后 commit `package.json`。
3. CI / docs 中安装命令统一为 pnpm（如有 `npm ci` / `npm install` 残留）。

---

## 轴 A · 协议链路自动化（最高杠杆，1-2 轮）

### R-10 protocol.ts 从 Rust schema 生成

**状态**：**phase 1+2+3 全部完成**（2026-06-17）
**消除的机制**：TS 侧 3600 行手抄协议 + 每方法 2 处手动同步；Rust/TS 协议漂移风险归零。

**现状**：`app-server-protocol/src/schema_export.rs` 产出 JSON Schema bundle（`generate_json_schema_bundle()`），codegen 管线 + re-export 收缩均已落地。

**实现路线**（参照 codex 已验证形态，见 `codex-engineering-patterns.md` 轴 A）：
1. ~~先做 spike 二选一~~ → 已决策：**JSON Schema → TS 二跳生成**（自定义转换器，无外部依赖）。`ts-rs` 方案搁置（需改 Rust 源码 + 加依赖，收益不足以覆盖改动量）。
2. ✅ phase 1：codegen 管线就绪。
   - 生成脚本：`scripts/generate-protocol-types.mjs`（自定义 JSON Schema → TS 转换器）
   - 生成物：`packages/app-server-client/src/generated/protocol-types.ts`（3641 行，头部 `// @generated`）
   - npm scripts：`generate:protocol-types`（生成）、`check:protocol-types`（漂移检查）
   - 漂移守卫：`--check` 模式重新生成后 diff，不一致即红
3. ✅ phase 2 完成：`protocol.ts` 顶部已转为 `// @generated types re-export`，`export * from "./generated/protocol-types.js"`；手写部分收缩为 method name 常量 + helper。类型定义不再手抄。
4. ✅ phase 3 完成（2026-06-17）：`check:protocol-types` 已挂入 `test:contracts` 链首（`npm run check:protocol-types && …`），协议漂移即红；`npm run test:contracts` 全链验证 exit 0。
5. **二期（可选，未做）**：参照 codex `client_request_definitions!` 宏，把 Rust 侧 4 处注册收敛为 1 处宏条目。

**验证**：`node scripts/generate-protocol-types.mjs --check` 通过；`npm run test:contracts` 全链 exit 0（协议守卫已作为首步运行）。
**退出条件**：新增 JSON-RPC 方法时 TS 侧零手写类型 ✅；CI 有漂移守卫 ✅（已入 test:contracts 链）。
**剩余缺口**：仅可选的 Rust 侧宏收敛；类型生成主线已完全闭环。

---

## 轴 B · App Server 方法注册去中心化（2-4 轮）

### R-20 processor/runtime 按 domain 模块化注册

**状态**：**基本完成**（2026-06-17 复核确认；中心文件 domain 化已落地，分 13 刀完成）
**消除的机制**：238 个 `handle_*` 和 521 个 RuntimeCore fn 必须写进两个中心文件的强制路径——已破除。

**执行轨迹**（git 可查，R-20 first→thirteenth cut）：first cut 把 `processor.rs` 转目录模块并抽 project_git → 逐轮抽 knowledge / skill / workspace / agent_session / gateway+agent_app+automation+media / model / mcp / voice / unified+project+gallery / wechat / file system / log+diagnostics+connect。

**实测结果**：
- `runtime.rs`：**8105 → 588 行**（只剩 RuntimeCore 结构体 + 接线）；实现下放到 `runtime/` 52 个子模块（合计约 3.4 万行，按 domain 切分：`projection_store.rs`、`conversation_import/`、`media_tasks.rs`、`knowledge.rs`、`model_providers.rs` …）。
- `processor.rs`：单文件 → **`processor/` 目录 24 个 domain 模块**（`agent_session.rs`、`project_git.rs`、`model.rs`、`knowledge.rs`、`media.rs` …）；`processor/mod.rs` 2444 行做 dispatch 接线。
- `runtime/tests.rs` 已下放（现仅 1049 行壳），测试随各 domain 进入 `runtime/tests/*.rs`（`external_events.rs`、`coding_events.rs`、`evidence_exports.rs` …），符合"测试随代码迁移"。

**已达成的退出条件**：新增方法的标准写集 = 修改 `runtime/<domain>.rs` + `processor/<domain>.rs` + 中心接线，不再撑大单一 impl；`runtime.rs` 行数已进入低位。

**剩余缺口**：
1. `processor/mod.rs`（2444 行）仍偏大，dispatch 接线可进一步按 domain 分组（非阻塞，登记为 R-20 尾项）。
2. domain 子模块中仍有个别超线（`projection_store.rs` 1357 行等），交由 R-60 棘轮持续约束。

### R-21 aster `agents/agent.rs`（8230 行）按相同模式子模块化

**状态**：proposed（R-20 已完成、手法已验证可套用；这是轴 B 当前主要剩余缺口）
**前提确认**：aster-rust 已完全自有化（无上游同步顾虑，见证据底座轴 E），可放心动结构。
**方向**：`agent/lifecycle.rs`、`agent/tool_dispatch.rs`、`agent/stream.rs` 等；`cargo test`（aster 子 workspace）收口。直接复用 R-20 在 `runtime/`、`processor/` 上验证过的 domain 下放手法。

---

## 轴 C · 前端分层矫正（守卫先行，N 轮）

### R-30 import 边界守卫（先锁方向，半轮）

**状态**：完成（2026-06-11）
**消除的机制**：lib → components/features 反向依赖无任何机械约束。

**已实现**：
1. ✅ ESLint `no-restricted-imports` 分层规则：`lib/**` 禁止 import `components/**`/`features/**`/`pages/**`；`features/**` 禁止 import `components/**`。
2. ✅ 存量 47 处违例记录在 `governance/import-boundary-baseline.json`，**只许减不许增**。
3. ✅ 守卫脚本 `scripts/check-import-boundaries.mjs`（轻量扫描，不跑完整 ESLint）。
4. ✅ npm script: `governance:import-boundaries`。

**退出条件**：已满足。lint 生效、baseline 已 commit、新违例 CI 红。

### R-31 偿还存量依赖违例（半轮-1 轮）

**状态**：proposed，依赖 R-30
**方向**：逐个把违例改为正向依赖——`lib/workspace/workbenchCanvas.ts` 的 re-export 移回 components 层或下沉真正的纯逻辑到 lib；`lib/api/agentApps.ts` 对 `features/agent-app/install` 的依赖改为参数注入或类型契约下沉。每修一处从 baseline 删除一行。

### R-32 巨型组件状态分层拆分（N 轮，原 v1 的 R-03/R-06 在此归并）

**状态**：first cut 完成，第三刀完成（2026-06-18）
**消除的机制**：业务状态机/解析器默认写进组件体（52 个 useState 模式）。

**正确样板**（仓库已有，直接复用，不发明新模式）：`packages/agent-runtime-projection` + `components/agent/chat/projection/` 的 projection/selector 分离。

**执行节奏**（每轮 1 个目标，先抽逻辑后拆 UI）：
1. ✅ `useWorkspaceSendActions.ts`（**5117 → 3180 行，累计 -1937 行，已分 15+ 刀**）：从 16 个命令 recent defaults 纯函数起步，逐轮抽离 skill launch resolvers、fast response helpers、intent helpers、service model helpers、browser assist helpers、image workbench helpers、skill install helpers 等纯逻辑到 `workspace/commands/` 与 helper 模块；hook 本体通过 import 复用。
2. `AgentChatWorkspace.tsx`（7029 → **当前 7172 行**，已抽三刀）：按 8 个正交关注点逐个抽 View Model / 子 hook。**first cut（2026-06-17）**：抽 `pathReferences` 状态 + add/remove/clear 三操作为内聚 hook `hooks/usePathReferences.ts`（58 行）+ `usePathReferences.test.tsx`（5 用例，全绿），主文件 7190→7178、清除 2 处 unused import。**second cut（2026-06-18）**：抽 `browserWorkspaceHintVisible` + localStorage 记忆 + auto-hide effect 为内聚 hook `hooks/useBrowserWorkspaceHomeHint.ts`（87 行）+ `useBrowserWorkspaceHomeHint.test.tsx`（5 用例），本轮主文件 7254→7215，`WorkspaceConversationScene` 只保留透传接线。**third cut（2026-06-18）**：抽 workbench 请求 / focus 状态到 `hooks/useWorkspaceWorkbenchRequests.ts`（149 行）+ `useWorkspaceWorkbenchRequests.test.tsx`（5 用例），主文件 7215→7172，browser/canvas 打开请求、artifact block focus、timeline focus 不再由主组件直接持有。后续刀：媒体任务 runtime、数据同步、canvas 联动…每轮抽 1-2 个，UI 子组件拆分放在状态抽完之后。**仍为轴 C 最高优先缺口**（距基线 7029 容差上限 7380 仍未越线）。
3. 后续队列按"改动频率 × 行数"动态排（`agentChatHistory.ts`、`capabilityDispatcher.ts`、`DesignCanvas.tsx` …），每个开工前补独立 R-3x 条目。

**每轮验证**：新抽逻辑 `*.unit.test.ts` 覆盖；`npm run verify:gui-smoke`（硬规则 5）；棘轮基线行数下降。

#### 进度日志（2026-06-18）

- 第二刀把 `browserWorkspaceHintVisible`、localStorage 记忆和自动隐藏定时器从 `AgentChatWorkspace.tsx` 抽到 `hooks/useBrowserWorkspaceHomeHint.ts`。
- 新增 `useBrowserWorkspaceHomeHint.test.tsx` 覆盖首次展示、已记忆不再展示、entry banner 抑制、手动关闭和自动隐藏。
- `AgentChatWorkspace.tsx` 继续瘦身（7254 → 7215 行），主文件只保留 hook 接线与 `WorkspaceConversationScene` 透传。
- 验证：`npx eslint "src/components/agent/chat/AgentChatWorkspace.tsx" "src/components/agent/chat/hooks/useBrowserWorkspaceHomeHint.ts" "src/components/agent/chat/hooks/useBrowserWorkspaceHomeHint.test.tsx" "src/components/agent/chat/hooks/useFileManagerSidebar.ts" "src/components/agent/chat/hooks/useFileManagerSidebar.test.tsx" --max-warnings 0` 通过；`npm test -- "src/components/agent/chat/hooks/useBrowserWorkspaceHomeHint.test.tsx" "src/components/agent/chat/hooks/useFileManagerSidebar.test.tsx" "src/components/agent/chat/hooks/usePathReferences.test.tsx"` 通过（13 tests）；`npm run governance:file-size` 通过；`npm run verify:gui-smoke` 通过（renderer / Electron host / App Server sidecar / Claw workbench shell smoke 完成，退出码 0）。
- 第三刀把 browser workbench open request、canvas preview open request、artifact block focus、timeline focus 下放到 `hooks/useWorkspaceWorkbenchRequests.ts`，主组件保留 layout 切换包装以维持 `canvas` → `chat-canvas` 行为。
- 新增 `useWorkspaceWorkbenchRequests.test.tsx` 覆盖 requestKey 递增、handled 只清匹配请求、空值归一化、artifact block focus 和 timeline focus。
- `AgentChatWorkspace.tsx` 继续瘦身（7215 → 7172 行）。
- 第三刀验证：`npx eslint "src/components/agent/chat/AgentChatWorkspace.tsx" "src/components/agent/chat/hooks/useWorkspaceWorkbenchRequests.ts" "src/components/agent/chat/hooks/useWorkspaceWorkbenchRequests.test.tsx" --max-warnings 0` 通过；`npm test -- "src/components/agent/chat/hooks/useWorkspaceWorkbenchRequests.test.tsx" "src/components/agent/chat/hooks/useBrowserWorkspaceHomeHint.test.tsx" "src/components/agent/chat/hooks/useFileManagerSidebar.test.tsx" "src/components/agent/chat/hooks/usePathReferences.test.tsx"` 通过（18 tests）。
- `npm run governance:file-size` 当前失败，但失败来自本轮外 Rust 写集：`lime-rs/crates/app-server/src/runtime/conversation_import/codex/events.rs` 新文件 1048 行超 800，以及 `lime-rs/crates/app-server/src/runtime/thread_item_projection.rs` 839→981 超基线；本轮前端主文件仍下降，未新增前端体量违例。该 Rust 体量漂移应单独回到 R-60/轴 B 处理，不在本刀顺手修。
- `npm run verify:gui-smoke` 当前失败在本轮外 Rust sidecar 编译：`lime-rs/crates/agent/src/aster_state.rs` 仍引用 `AsterProviderConfig.force_responses_api`，但当前 `AsterProviderConfig` 只有 `protocol` 等字段，导致 `lime-agent` 编译失败（E0560/E0609）；renderer 与 Electron host 构建已通过，GUI smoke 未进入最终 Electron 交互阶段。该 Rust 字段漂移需单独回到 Rust/App Server 主链处理。
- 下一刀优先继续找能独立成 hook 的状态组，避免回到 UI 子组件拆分或边角文案整理。

---

## 轴 D · 网关收敛（与 CCD-012 协同，1-2 轮）

### R-40 业务代码统一走 lib/api，dev-bridge 降为传输细节

**状态**：守卫完成（2026-06-11）
**消除的机制**：业务 hook 直接 import `@/lib/dev-bridge` 造成的多路径调用。

**已实现**：
1. ✅ 盘点完成：11 处直接引用（10 个 `safeListen` + 1 个 `safeInvoke`）
2. ✅ ESLint 规则：`components/**`、`features/**`、`hooks/**` 禁止 import `lib/dev-bridge/**`（lib/api 内部豁免）
3. ✅ 存量 11 处违例记录在 `governance/import-boundary-baseline.json`（`business→dev-bridge` 规则）
4. ✅ 包装模块 `lib/api/bridgeEvents.ts`（re-export safeListen/safeEmit）
5. ✅ 守卫脚本更新：`check-import-boundaries.mjs` 扫描 components/hooks 目录

**剩余迁移**（R-31 协同）：逐个把 11 处 `import { safeListen } from "@/lib/dev-bridge"` 改为 `import { safeListen } from "@/lib/api/bridgeEvents"`，每修一处从 baseline 删除一行。

**退出条件**：dev-bridge 的非 lib/api 消费者归零且有 lint 守卫。

### R-41 packages 收缩：下线零引用的 agent-app-runtime

**状态**：**完成**（2026-06-17 复核确认已删除）
**结果**：
- `agent-app-runtime`：已从 `packages/` 删除（复核时目录已不存在）。
- `agent-runtime-ui`：仍保留（`packages/agent-runtime-ui`），1 处 import（`AgentRunProjectionPanel.tsx`），可在后续轮次评估并回 src，非阻塞。
**剩余**：仅 `agent-runtime-ui` 的并回评估（低优先，登记后续）。

---

## 轴 E · crate 抗膨胀（长期，规则先行）

### R-50 core/services 抗膨胀规则 + 模型注册重复定义归并

**状态**：规则完成 + 调查完成（2026-06-11）
**执行清单**：
1. ✅ `AGENTS.md` 基础约束 21 已补："新增 Rust 逻辑禁止默认落 `lime-core` / `services` 平铺层"。
2. ✅ 模型注册类型调查：`lime_core::models::model_registry` 定义类型（`EnhancedModelMetadata` 等），`services/model_registry_service.rs` 消费这些类型。不是"双写"，是"类型定义 + 服务实现"的正常分层。无需归并。
3. `services/` 目录分组：延后到 R-20 完成后评估。

---

## 轴 F · 体量护栏（支撑项，1 轮内）

### R-60 文件体量棘轮守卫（原 v1 R-02，定位降级）

**状态**：完成并恢复绿（2026-06-18）
**定位**：止血护栏 + A/B/C 轴的验收仪表，**不是重构主线**。
**已实现**：
- 基线快照：`governance/file-size-baseline.json`（2026-06-18：152 前端 + 161 Rust，排除测试目录与生成代码）
- 守卫脚本：`scripts/check-file-size-governance.mjs`
- 共享扫描库：`scripts/governance/file-size-baseline-lib.mjs`
- 手动刷新入口：`scripts/governance/update-file-size-baseline.mjs` / `npm run governance:file-size:update`
- npm script：`governance:file-size`
- 排除模式：测试文件、`target/`、`node_modules/`、生成代码（`@generated` 标记）
- 验证：`npm run governance:file-size` 通过；`npm run governance:scripts` 通过

#### Blocker（2026-06-17 发现，2026-06-18 已解决）：基线漂移导致守卫为红

`governance/file-size-baseline.json` 仍为 2026-06-11 快照，之后多个文件增长 / 新建已超基线，`npm run governance:file-size` 当前 **exit 1**，例如：
- `agentThreadGrouping.ts`（基线 1050 → 现 1127，超容差）
- `agentStreamRuntimeHandler.ts`（基线 1672 → 现 1999，超容差）
- 多个新 ViewModel（`CanvasWorkbenchChangesPanelViewModel.ts` 823、`generalWorkbenchTaskRailViewModel.ts` 831、`ToolCallDisplayViewModel.ts` 807）超 800 行新文件阈值

**影响**：棘轮失去"只减不增"效力（红线已被绕过）。**下一刀建议**：单独一轮 R-60 维护——重扫基线、把已合理拆分/增长的文件同步进 baseline、把超 800 行新 ViewModel 评估拆分或纳入冻结，让守卫恢复绿、重新具备拦截力。本刀（R-32 first cut）未引入新违例，主文件为下降。

#### 进度日志（2026-06-18）

- 新增 `scripts/governance/file-size-baseline-lib.mjs`，让检查脚本与刷新脚本共用同一套扫描、排除、生成代码识别与行数统计逻辑。
- 新增手动刷新入口 `npm run governance:file-size:update`，刷新 `governance/file-size-baseline.json` 到当前仓库事实：前端 152 个、Rust 161 个非测试 / 非生成超 800 行文件。
- 修正测试目录误收口径：`src/**/**/*.test/**` 目录不再被当成生产源文件纳入体量基线。
- 验证：`npm run governance:file-size` exit 0；`npm run governance:scripts` exit 0。
- 后续：R-60 回到仪表角色；下一刀优先回到 R-32 拆 `AgentChatWorkspace.tsx`，不要继续以基线刷新替代轴 C 主线。

---

## 执行协议

1. **认领**：开工前改条目状态为 `in_progress` + `执行者`；多 Agent 并行时按 `internal/aiprompts/parallel-agent-collaboration.md` 声明写集。
2. **进度日志**：每轮收尾在条目下补 `#### 进度日志`（实际方案、blocker、验证结果）。
3. **完成度报告**：收尾给「本轮完成度 X%」+「整体目标完成度 Y%」（口径见顶部）。
4. **中止**：用户喊停即停；守卫类成果（lint/棘轮/codegen 校验）一旦上线即锁住已有进展，断点可续。
5. **回滚**：迁移类条目每个 commit 独立可 revert；失败补 `#### Blocker` 小节并降级为更小批次。
