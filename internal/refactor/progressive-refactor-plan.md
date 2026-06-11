# 结构重构执行计划（机制驱动版）

> 状态：proposed（v2，2026-06-11 重写；v1 的行数驱动队列已废弃）
> 上位规则：`AGENTS.md`、`internal/refactor/README.md`
> 证据底座：`architecture-debt-analysis.md`（条目优先级争议先回去核对证据）

每个条目独立可交付、可随时停。排序原则：**优先消除"新代码默认流向旧位置"的机制**，存量症状（拆大文件）作为各轴副产品偿还。

## 完成度口径

- **整体目标**：五个膨胀机制（轴 A-E）全部被机械守卫锁死 + 存量超线文件进入只减不增通道。
- **Y% 计算**：轴 A/B/C 各 25%（机制消除），轴 D/E 各 10%，轴 F 护栏 5%。存量文件拆了多少**不计入主口径**（它是轴 B/C 的验收副产品），仅在进度日志记录。
- **当前状态**：约 5%（R-01 基本完成）。

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

**状态**：phase 1 完成（2026-06-11）
**消除的机制**：TS 侧 3600 行手抄协议 + 每方法 2 处手动同步；Rust/TS 协议漂移风险归零。

**现状**：`app-server-protocol/src/schema_export.rs` 已能产出 JSON Schema bundle（`generate_json_schema_bundle()`），万事俱备只欠 TS codegen。

**实现路线**（参照 codex 已验证形态，见 `codex-engineering-patterns.md` 轴 A）：
1. ~~先做 spike 二选一~~ → 已决策：**JSON Schema → TS 二跳生成**（自定义转换器，无外部依赖，因网络不通无法装 `json-schema-to-typescript`）。`ts-rs` 方案搁置（需改 Rust 源码 + 加依赖，收益不足以覆盖改动量）。
2. ✅ phase 1：codegen 管线就绪。
   - 生成脚本：`scripts/generate-protocol-types.mjs`（自定义 JSON Schema → TS 转换器）
   - 生成物：`packages/app-server-client/src/generated/protocol-types.ts`（447 个类型，63KB，头部 `// @generated`）
   - npm scripts：`generate:protocol-types`（生成）、`check:protocol-types`（漂移检查）
   - 漂移守卫：`--check` 模式重新生成后 diff，不一致即红
3. **phase 2（待做）**：`protocol.ts` 收缩为 re-export generated types + 手写 method constants + helper functions。需要逐步迁移消费者代码。
4. **phase 3（可选）**：漂移守卫挂入 `test:contracts` 链路。
5. **二期（可选）**：参照 codex `client_request_definitions!` 宏，把 Rust 侧 4 处注册收敛为 1 处宏条目。

**验证**：`node scripts/generate-protocol-types.mjs --check` 通过；生成的 `InitializeParams`/`AgentSessionOverview` 等与手写版本语义一致（生成版更精确：保留了 `null | string` nullable 语义）。
**退出条件**：新增 JSON-RPC 方法时 TS 侧零手写；CI 有漂移守卫。
**风险**：低（phase 1 已验证 447 个类型 0 失败；phase 2 是逐步迁移，每个 commit 独立可 revert）。

---

## 轴 B · App Server 方法注册去中心化（2-4 轮）

### R-20 processor/runtime 按 domain 模块化注册

**状态**：proposed
**消除的机制**：238 个 `handle_*` 和 521 个 RuntimeCore fn 必须写进两个中心文件的强制路径。

**方向**（复用仓库已有先例 `local_data_source/` 子模块模式）：
1. 按协议 domain（与 `protocol/v0/*.rs` 模块一一对应：agent_session、project_git、knowledge…）建 `app-server/src/runtime/<domain>.rs` 与 `processor/<domain>.rs`，方法实现与 handler 下放。
2. 中心文件收缩为：结构体定义 + dispatch 接线（match 或注册表）。第一阶段允许 dispatch 仍在中心文件（每方法 1 行），后续再评估宏/注册表。
3. `runtime/tests.rs`（4428 行）随 domain 下放到各子模块 `#[cfg(test)]`（测试随代码迁移，硬规则 9 精神）。
4. 切分节奏：每轮迁 1-2 个 domain，从最近活跃的开始（project_git、agent_session），每轮 `cargo test -p app-server --lib` + `npm run test:contracts` 收口。

**退出条件**：新增方法的标准写集 = 新建/修改 `<domain>.rs` 一处 + 中心文件 1 行接线；`runtime.rs`、`processor.rs` 行数进入单调下降。
**阻塞项**：建议 R-10 先行（codegen 落地后，domain 边界与 protocol 模块对齐更自然），但不强依赖。

### R-21 aster `agents/agent.rs`（8206 行）按相同模式子模块化

**状态**：proposed（排在 R-20 至少完成 2 个 domain 之后，套用同一手法）
**前提确认**：aster-rust 已完全自有化（无上游同步顾虑，见证据底座轴 E），可放心动结构。
**方向**：`agent/lifecycle.rs`、`agent/tool_dispatch.rs`、`agent/stream.rs` 等；`cargo test`（aster 子 workspace）收口。

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

**状态**：first cut 完成（2026-06-11）
**消除的机制**：业务状态机/解析器默认写进组件体（52 个 useState 模式）。

**正确样板**（仓库已有，直接复用，不发明新模式）：`packages/agent-runtime-projection` + `components/agent/chat/projection/` 的 projection/selector 分离。

**执行节奏**（每轮 1 个目标，先抽逻辑后拆 UI）：
1. ✅ `useWorkspaceSendActions.ts`（5117 → 4707 行，-410 行）：提取 16 个命令 recent defaults 纯函数到 `workspace/commands/commandRecentDefaults.ts`（450 行）。hook 本体通过 import 复用。
2. `AgentChatWorkspace.tsx`（7029 行）：按 8 个正交关注点逐个抽 View Model / 子 hook（媒体任务 runtime、数据同步、canvas 联动…），每轮抽 1-2 个；UI 子组件拆分放在状态抽完之后。
3. 后续队列按"改动频率 × 行数"动态排（`agentChatHistory.ts` 3560、`capabilityDispatcher.ts` 4344、`DesignCanvas.tsx` 3802…），每个开工前补独立 R-3x 条目。

**每轮验证**：新抽逻辑 `*.unit.test.ts` 覆盖；`npm run verify:gui-smoke`（硬规则 5）；棘轮基线行数下降。

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

**状态**：调查完成（2026-06-11）
**证据**：
- `agent-app-runtime`：src/ 零 import（只有字符串字面量匹配），CI 无引用，可安全删除。
- `agent-runtime-ui`：1 处 import（`AgentRunProjectionPanel.tsx`），评估是否并回 src。
**剩余**：执行删除（低风险，半轮）。

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

**状态**：完成（2026-06-11）
**定位**：止血护栏 + A/B/C 轴的验收仪表，**不是重构主线**。
**已实现**：
- 基线快照：`governance/file-size-baseline.json`（322 个超线文件：147 前端 + 175 Rust）
- 守卫脚本：`scripts/check-file-size-governance.mjs`
- npm script：`governance:file-size`
- 排除模式：测试文件、`target/`、`node_modules/`、生成代码（`@generated` 标记）
- 验证：当前代码通过、模拟 900 行新文件正确报错（exit 1）

---

## 执行协议

1. **认领**：开工前改条目状态为 `in_progress` + `执行者`；多 Agent 并行时按 `internal/aiprompts/parallel-agent-collaboration.md` 声明写集。
2. **进度日志**：每轮收尾在条目下补 `#### 进度日志`（实际方案、blocker、验证结果）。
3. **完成度报告**：收尾给「本轮完成度 X%」+「整体目标完成度 Y%」（口径见顶部）。
4. **中止**：用户喊停即停；守卫类成果（lint/棘轮/codegen 校验）一旦上线即锁住已有进展，断点可续。
5. **回滚**：迁移类条目每个 commit 独立可 revert；失败补 `#### Blocker` 小节并降级为更小批次。
