# Approval HITL Decision Model Plan

> 状态：active
> 更新时间：2026-07-10
> 主路线图：`internal/roadmap/approval/prd.md`
> 当前阶段：P0 输入区 approval 已落地并收敛为固定高度单行控件；P1 decision-based approval contract 已接入；P2 browser_control session-scoped 授权、scope/lifecycle、Evidence export、Gate A 聚合与 Gate B second-request 已接入；P4 Timeline/replay 历史只读分类已落地；P3 Plan / approval / A2UI 输入区编排已完成；2026-07-10 最新 Gate A、四个 Gate B CDP、GUI smoke 与 contracts 已通过；更多 tool family 第一刀已补 shell approval scope/contract 事件形状、`tool-runtime::execution_approval` current owner 和 App Server cache-owner fail-closed 守卫，暂不启用 shell session cache

## 目标

把 Approval 从“消息流 / A2UI 确认卡”收敛为 Codex-first 的 runtime control plane：长程任务先通过 Plan 前置确认需求和边界，执行中只在权限缺口处用输入区单行 approval prompt 打断用户，并支持允许一次、本会话允许、拒绝并继续、取消任务。

## 当前原则

1. `tool_confirmation` 不走 A2UI；输入区 approval prompt 是唯一可提交主入口。
2. A2UI 只承接 `ask_user`、`elicitation`、Service Skill 补参和结构化业务表单。
3. Plan 是长程任务的前置需求确认；Plan 确认后 runtime 应尽量少打扰、不打扰。
4. Approval 是权限授权，不是信息补充；授权事实必须回到 runtime decision / evidence。
5. `decline` 表示拒绝本次动作并继续尝试替代路径；`cancel` 才停止当前 turn。
6. P2 必须支持 session-scoped approval cache，避免同一长程任务重复弹同类确认。
7. 不新增 parallel approval UI，不复活消息流 pending `DecisionPanel` 或 approval A2UI 表单。

## Agent Verification Contract

### 预算标签

```text
budget:normal
```

P0 文档/输入区已完成时只需 C0/C1/C2 定向验证。P1 改到 App Server / RuntimeCore / GUI 主链时，允许 targeted GUI smoke，不默认跑 full qcloop / live Provider。

### 基本信息

```text
改动名称：Approval HITL decision model
执行计划文件：internal/exec-plans/approval-hitl-decision-model-plan.md
负责人：当前执行 Agent
预算标签：budget:normal
风险等级：P1
影响模块：Agent runtime approval、Workspace Inputbar、Timeline、A2UI boundary、App Server action response、Evidence
不做范围：不把 tool_confirmation 包装成 A2UI schema；不保留消息流 pending 提交入口；不一次性改完整 release qcloop
```

### Current 主链

```text
前端入口：src/components/agent/chat/components/Inputbar/components/InputbarApprovalPrompt.tsx
前端网关：agentSession/action/respond
Electron Desktop Host bridge：不直接新增；继续经 current DevBridge / App Server client 链路
App Server method：agentSession/action/respond；P1 已扩展为 decision-based approval response
RuntimeCore / service owner：App Server RuntimeCore pending action / approval waiter
read model：pendingActions / submittedActionsInFlight / thread timeline read model
runtime event：action_required(tool_confirmation) -> action/respond -> resolve pending approval
Evidence Pack 字段：read model / execution trace 记录 decision、scope、request id；Timeline 仅展示工具名 + 终态的一行状态；P2 first slice 导出 approval session cache hit / auto-resolved request / 非敏感 cache key
GUI surface：Workspace inputbar 固定高度单行 approval prompt；Timeline 只读 evidence
more tool family：shell / command execution 的 contract / scope / decisions projection 归属 `tool-runtime::execution_approval`；运行中事件只投影 `actionKind=tool_execution_policy`、`runtime_contract.contract_key=shell_command`、`toolFamily=shell_command` 和非敏感 `approvalScope`；默认 decisions 不含 `allow_for_session`；App Server 对没有 session cache owner 的 `allow_for_session` fail closed
```

### Happy Path

```text
用户输入 / Agent 输入：用户发起长程任务，Agent 先输出 Plan 并等待确认；执行中遇到权限缺口触发 tool_confirmation。
预期 runtime events：Plan item / PlanDelta；action_required(tool_confirmation)；approval resolved；turn continue / cancel。
预期 tool calls：命令执行、文件写入、网络访问等高风险动作在授权后执行。
预期 approval / sandbox：P1 `allow_once / allow_for_session / decline / cancel`；P2 first slice 已为 browser_control permission preflight 接入 session-scoped cache。
预期 artifact：无新增业务 artifact；Evidence 记录 approval decision。
预期 evidence：Timeline 只读单行记录工具名 + 终态，不提供二次提交；request、decision、scope、reason 进入 read model / Evidence export，且不导出敏感 preview。
预期 GUI 状态：pending approval 时普通输入框隐藏；提交后恢复；A2UI 不出现 tool_confirmation 表单。
失败时应停在哪一层：`tool_confirmation` 缺 decision 时停在 App Server contract；`ask_user` / `elicitation` 携带 approval decision 时 fail closed；UI 不得伪造 session-scoped 授权。
```

### Evidence Layers

| Layer               | 本次是否需要 | 证据路径 / 计划路径                                                                                      | 不需要的原因                        |
| ------------------- | ------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| deterministic-smoke | 是           | P0 定向 Vitest；P1 App Server / frontend contract                                                        | -                                   |
| Gate A              | 是           | renderer / browser projection：inputbar、A2UI、Timeline、Plan / approval 阻塞态互斥                      | -                                   |
| Gate B              | 是           | Electron CDP：真实 Electron renderer + preload invoke + `app_server_handle_json_lines` + JSON-RPC method | -                                   |
| runtime-transcript  | 是           | P1 approval sandbox / pending action transcript                                                          | P0 只需前端 projection，P1 必须补齐 |
| release-artifact    | 否           | -                                                                                                        | 本计划不是发版 / installer 变更     |

Gate A 只能证明 renderer projection 稳定；Gate B 才能声明真实产品链路闭环。普通 Chrome 打开的 `127.0.0.1:1420` 只能作为 Gate A / browser mirror，不得替代 Gate B。

### 必跑命令

```bash
# C0 / P0 文档与前端边界
npx prettier --write "internal/roadmap/approval/prd.md" "internal/exec-plans/approval-hitl-decision-model-plan.md"
git diff --check -- "internal/roadmap/approval/prd.md" "internal/exec-plans/approval-hitl-decision-model-plan.md"
npm test -- "src/components/agent/chat/workspace/useWorkspaceInputbarSceneRuntime.test.tsx" "src/components/agent/chat/__tests__/actionRequestA2UI.test.ts" "src/components/agent/chat/__tests__/StreamingRenderer.structuredContent.test.tsx" "src/components/agent/chat/__tests__/AgentThreadTimeline.test.tsx"

# C1 / P1 protocol
npm run test:contracts
npm run test:related -- "src/components/agent/chat/components/Inputbar/components/InputbarApprovalPrompt.tsx" "src/components/agent/chat/workspace/inputbarApprovalAction.ts"

# C2 / GUI 主路径
npm run verify:gui-smoke

# Gate A / renderer projection
npm run smoke:agent-runtime-current-fixture

# Gate B / Electron CDP，approval 专属场景
npm run smoke:claw-chat-current-fixture -- --scenario approval-request-resume --timeout-ms 240000 --cdp-port 9224 --prefix claw-chat-current-fixture-approval-request-resume-cdp --evidence-dir ".lime/qc/gui-evidence/claw-chat-current-fixture"
npm run smoke:claw-chat-current-fixture -- --scenario approval-request-decline --timeout-ms 240000 --cdp-port 9236 --prefix claw-chat-current-fixture-approval-request-decline-cdp-p5 --evidence-dir ".lime/qc/gui-evidence/claw-chat-current-fixture"
npm run smoke:claw-chat-current-fixture -- --scenario approval-request-cancel --timeout-ms 240000 --cdp-port 9237 --prefix claw-chat-current-fixture-approval-request-cancel-cdp-p5 --evidence-dir ".lime/qc/gui-evidence/claw-chat-current-fixture"
npm run smoke:claw-chat-current-fixture -- --scenario approval-request-full-access --timeout-ms 180000 --cdp-port 9235 --prefix claw-chat-current-fixture-approval-request-full-access-cdp-p4 --evidence-dir ".lime/qc/gui-evidence/claw-chat-current-fixture"

# Gate B / Electron CDP，基础 session / preload / JSON-RPC 链路
npm run smoke:agent-session-recovery-cdp-gate -- --cdp-port 9223 --prefix approval-hitl-session-recovery-cdp
```

如果本机 `9223` 被其它 Electron / CDP 会话占用，允许换空闲端口重跑；仍按真实 Electron renderer、preload bridge、Electron IPC、`app_server_handle_json_lines` 与 App Server JSON-RPC trace 判定 Gate B。

未跑命令记录格式：

```text
未跑：
原因：
风险：
后续触发条件：
```

### Agent QC 场景映射

```text
P0: tool-approval-sandbox-boundary, claw-chat-ready-streaming
P1: long-running-plan-confirmation, approval-session-scope-cache
P2: historical-evidence-readonly
```

选择依据：

```text
为什么需要：approval 直接影响 runtime pause/resume、sandbox authorization 和 GUI 输入区状态。
为什么不需要其它 P0：本计划不改变 release packaging、Skill Forge 注册、Browser Runtime site adapter 或 payment 主链。
是否允许单场景 sidecar：允许，优先 approval sandbox / inputbar focused smoke。
是否允许进入 official evidence：P1 完成后允许，P0 文档与前端收口不单独声明 release evidence。
```

### Supervisor Rubric

Supervisor 只判断：

```text
1. tool_confirmation 是否只有输入区一个可提交入口。
2. Plan / approval / ask_user / cancel 是否按 HITL 分层清晰区分。
3. P1 decision model 是否真实接到 App Server / RuntimeCore，而不是只加前端按钮。
```

Supervisor 不判断：

```text
1. schema / contract / bridge 是否同步。
2. mock 是否误入生产。
3. Evidence Pack 是否导出。
4. GUI owner 是否独占。
5. release scope 是否明确。
```

输入限制：

```text
只输入 evidence summary / transcript summary / artifact summary / rubric。
不输入完整 stderr、完整开发聊天、API key、未脱敏请求响应。
```

输出格式：

```json
{
  "score": 0,
  "verdict": "pass|fail|needs-human-review",
  "regressions": [],
  "reason": ""
}
```

### 回写规则

如果失败，必须至少回写一项：

| 失败类型                      | 回写资产                                    | 关闭条件                                         |
| ----------------------------- | ------------------------------------------- | ------------------------------------------------ |
| approval 双入口回流           | Timeline / A2UI / inputbar focused test     | pending `tool_confirmation` 只能在 inputbar 提交 |
| Gate A 投影失败               | renderer projection / component regression  | inputbar、A2UI、Timeline 投影均正确              |
| Gate B CDP 证据不足           | Electron CDP smoke / trace assertion        | 真实 Electron + IPC + JSON-RPC + GUI 状态均闭环  |
| session-scoped 授权是假实现   | App Server / RuntimeCore contract test      | `allow_for_session` 能真实跳过同类后续 request   |
| `decline` / `cancel` 语义混淆 | runtime transcript / approval sandbox smoke | decline 不触发 turn cancel，cancel 停止 turn     |
| Evidence 重复提交入口         | Timeline read-only regression               | 历史 approval 只读展示，不可再次提交             |

### 完成标准

```text
主线目标是否完成：P0 / P1 / P2 / P3 / P4 主链均已完成；P2 session-scoped approval cache 已完成 browser_control permission preflight current 闭环，scope key 覆盖 risk class、workspace、cwd/project root hash 与 network host，cancel / delete 会清理 session cache，Evidence export 能解释 session cache 命中，Gate B second-request 已证明同 session 同 scope 第二轮不再打扰；P3 已完成 Plan 前置确认、approval 优先抢占、A2UI 暂停和同一计划不重复确认。
已跑验证：本轮已跑定向 Vitest / i18n、protocol/client/Rust 定向测试、`npm run test:contracts`、Gate A `smoke:agent-runtime-current-fixture`、Gate B approval CDP、Gate B full-access CDP、Gate B session recovery CDP；scope/lifecycle 增量已跑 `permission_preflight`、`coding_snapshot`、`approval_session_cache_auto_resolved` 与 `cargo check -p app-server`。2026-07-10 最新验证中，Approval/A2UI/Timeline 定向组测 `4 files / 50 tests`、fixture 脚本测试 `58 tests`、`npm run typecheck`、`npm run i18n:unused -- --check`、Gate A 聚合、四个 Gate B CDP、`npm run verify:gui-smoke` 与 `npm run test:contracts` 均通过；resume pending 实测高度 `44px`，无 tool/command/details/pre；full-access 无 prompt、无 timeline record、无 `agentSession/action/respond`。后续 tool family first slice 已补 `approval_decision_contract` Rust test，证明 shell `allow_for_session` 没有 cache owner 时 fail closed。
未跑验证及原因：未跑 full qcloop / live Provider；本计划不涉及 release packaging 或 live model provider，Gate B 使用受控 fixture 足以证明当前 approval 主链。
是否存在 token / Provider / GUI owner 风险：Gate B 使用 fixture / CDP，不使用 live Provider。
是否可进入 release evidence：P2 browser_control session-scoped approval、P3 Plan / approval / A2UI 编排、P4 Timeline/replay 只读分类可进入受控 fixture evidence；仍不能声明所有 tool family 的完整 Codex `ApprovedForSession` 等价能力，后续需要按 tool policy 逐类接入。
下一刀：不再补旧 approval UI；后续只按 tool family 扩展 approval scope，或在修改 App Server / fixture approval contract 后按需重跑 Gate B p5。
```

## 测试用例矩阵

### 常规测试用例

| ID         | 阶段 | 场景                         | 操作                                                     | 期望结果                                                                     | 证据入口                                                                       |
| ---------- | ---- | ---------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| APR-T-001  | P0   | 输入区替换普通输入框         | 渲染 pending `tool_confirmation`                         | 展示固定高度单行 approval prompt，普通 textarea 不渲染                       | `useWorkspaceInputbarSceneRuntime.test.tsx`                                    |
| APR-T-002  | P0   | 允许 / 拒绝回写              | 点击 `允许` / `拒绝`                                     | 分别发送 `decision=allow_once/decline` 与 `actionType`                       | `useWorkspaceInputbarSceneRuntime.test.tsx`                                    |
| APR-T-003  | P0   | 提交中恢复输入框             | request 进入 in-flight                                   | prompt 不再占位，普通 inputbar 恢复                                          | `useWorkspaceInputbarSceneRuntime.test.tsx`                                    |
| APR-T-003B | P0   | 单行视觉边界                 | request 带 tool / command / cwd / risk arguments         | 只展示单行 prompt 与 backend 决策；不渲染风险 badge、参数 chips 或 JSON 详情 | `InputbarApprovalPrompt.test.tsx`                                              |
| APR-T-004  | P0   | approval 不进入 A2UI         | 构造 `tool_confirmation` action                          | A2UI builder 返回 `null`                                                     | `actionRequestA2UI.test.ts`                                                    |
| APR-T-005  | P0   | Timeline 不提供 pending 提交 | 渲染 pending approval timeline                           | 不出现可提交 `DecisionPanel`                                                 | `StreamingRenderer.structuredContent.test.tsx`、`AgentThreadTimeline.test.tsx` |
| APR-T-006  | P1   | decision contract            | 发送 `allow_once / allow_for_session / decline / cancel` | App Server / RuntimeCore 收到真实 decision；缺 decision fail closed          | `permission_preflight` Rust test + `npm run test:contracts`                    |
| APR-T-007  | P2   | session cache                | 同类 request 重复触发                                    | `allow_for_session` 后同 scope 第二次 request 不再打扰；不同 host 不复用     | RuntimeCore approval cache unit / integration test                             |
| APR-T-008  | P1   | decline / cancel 分离        | 分别选择 decline 和 cancel                               | decline 不触发 turn cancel；cancel 停止 turn                                 | approval sandbox runtime transcript                                            |
| APR-T-009  | P4   | 历史 approval 单行回溯       | 渲染 completed / failed approval                         | 只展示工具名 + 终态；不展示 prompt/request/scope/source/read-only hint       | `AgentThreadTimeline.test.tsx`、`StreamingRenderer.structuredContent.test.tsx` |
| APR-T-010  | P4   | full-access 不展示记录       | 渲染 full-access approval record                         | `approval_policy=never` 或 `sandbox_policy=danger-full-access` 时不生成记录  | `itemConverters.unit.test.ts`                                                  |

### Gate A 测试用例

| ID        | 阶段 | 场景                     | 操作                                                           | 必须断言                                                                     | 完成证据                       |
| --------- | ---- | ------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------ |
| APR-A-001 | P0   | pending approval 投影    | renderer / browser projection 注入 pending `tool_confirmation` | inputbar 显示单行 approval prompt；textarea 隐藏；窄宽度按钮不改变输入区高度 | Gate A summary / screenshot    |
| APR-A-002 | P0   | A2UI / Timeline 回流守卫 | 同时渲染 A2UI、Timeline、inputbar                              | 只有 inputbar 可提交；A2UI 和 Timeline 没有 pending 提交入口                 | Gate A summary / DOM assertion |
| APR-A-003 | P0   | 提交恢复                 | 模拟 submitted in-flight                                       | inputbar 恢复普通输入，不被旧 pending request 占住                           | Gate A summary / DOM assertion |
| APR-A-004 | P1   | decision 动作投影        | 注入 `available_decisions`                                     | 只显示 backend 宣告可用动作；无 backend 支持时不显示“本会话允许”             | Gate A summary / DOM assertion |
| APR-A-005 | P1   | Plan / approval 互斥     | 同时构造 Plan 确认态和 approval prompt fixture                 | 输入区只展示一个阻塞态；Plan 修改不会误触发 approval respond                 | Gate A summary / DOM assertion |
| APR-A-006 | P4   | 历史 approval 单行投影   | renderer / fixture 注入 completed approval                     | 记录只是一行；无 prompt/request/scope/source/read-only hint                  | Gate A DOM assertion           |
| APR-A-007 | P4   | full-access 隐藏投影     | renderer / fixture 注入 full-access approval                   | 不生成 `timeline-approval-record`                                            | Gate A DOM assertion           |

### Gate B 测试用例

Gate B 必须是 Electron CDP：真实 Electron renderer、preload/contextBridge、Electron IPC、`app_server_handle_json_lines`、App Server JSON-RPC、read model 和用户可见状态全部有证据。

| ID        | 阶段 | 场景                           | 操作                                                 | 必须断言                                                                                                                                                            | 完成证据                                                |
| --------- | ---- | ------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| APR-B-001 | P0   | Electron CDP attach            | `chromium.connectOverCDP("http://127.0.0.1:<port>")` | `window.__LIME_ELECTRON__ === true`；`window.electronAPI.invoke` 存在；URL 是真实 Electron renderer                                                                 | CDP summary，proofLevel=`Gate B CDP controlled fixture` |
| APR-B-002 | P0   | approval pending 可见          | 执行 `approval-request-resume` CDP 场景              | inputbar 显示 approval prompt；普通输入框隐藏；A2UI / Timeline 无 pending 提交入口                                                                                  | summary + screenshot + read model                       |
| APR-B-003 | P0   | 允许后真实 respond action      | 在真实 Electron 页签点击允许                         | trace 包含 `transport=electron-ipc`、`app_server_handle_json_lines`、`agentSession/action/respond`；backend ledger 收到 respond                                     | trace summary + backend ledger                          |
| APR-B-004 | P0   | resolve 后恢复并继续           | 等待 request resolve                                 | pending request 清空；inputbar 恢复；assistant / read model 完成；无 actionable console error                                                                       | GUI summary + read model summary                        |
| APR-B-005 | P2   | 本会话允许                     | 选择 `allow_for_session` 后触发同类 request          | session cache 自动允许同类 request；Evidence 记录 `scope=session`；不同 scope 不复用                                                                                | approval cache transcript + Evidence summary            |
| APR-B-006 | P1   | 拒绝并继续                     | 选择 decline                                         | 当前动作不执行；runtime 继续替代路径；turn 不进入 abort                                                                                                             | runtime transcript + GUI summary                        |
| APR-B-007 | P1   | 取消任务                       | 选择 cancel / abort                                  | 当前 turn 停止；read model 标记 canceled/aborted；inputbar 等待用户下一条命令                                                                                       | runtime transcript + read model summary                 |
| APR-B-008 | P1   | 历史 evidence 单行只读         | 重开同一 session 或导入历史记录                      | Timeline 只展示工具名 + 终态；无 prompt/request/scope/source/read-only hint；不产生新的 `action/respond`                                                            | history hydrate CDP summary / timeline screenshot       |
| APR-B-009 | P4   | full-access 无 approval record | 完全授权 / full-access 会话完成后检查时间线          | `approvalPolicy=never`、`sandboxPolicy=danger-full-access`；不出现 pending approval prompt；不出现 `timeline-approval-record`；不发送 `agentSession/action/respond` | full-access Electron CDP summary / screenshot           |

## 分阶段计划

### P0：输入区 approval current 收口

- [x] 新增 `InputbarApprovalPrompt`，pending `tool_confirmation` 时替换普通输入框。
- [x] 将 `InputbarApprovalPrompt` 收敛为固定高度单行控件，删除风险 badge、工具/参数 chips、JSON 详情和对应废弃 i18n。
- [x] 新增 `inputbarApprovalAction` selector，集中选择当前待处理 approval。
- [x] 提交后通过 `submittedActionsInFlight` 释放输入区，普通输入框恢复。
- [x] pending `tool_confirmation` 不再进入 A2UI。
- [x] pending `tool_confirmation` 不再在消息流 `DecisionPanel` 提供提交入口。
- [x] Harness approvals / runtime status panel 不再提供 inline approval submit，只保留只读 evidence 与输入区提示。
- [x] 五语言 i18n 覆盖输入区 approval 文案。
- [x] PRD 写入背景、目标、A2UI 分类、HITL 分层、图和验收标准。

退出条件：

- 输入区是 `tool_confirmation` 唯一可提交入口。
- 输入区 approval 只有一行 prompt 与 backend 宣告决策；不得恢复详情卡、风险 badge 或参数面板。
- A2UI approval 表单、消息流 pending decision panel 和 Harness inline approval 按 `dead` 处理。
- `ask_user` / `elicitation` 原行为不受影响。

### P1：decision-based approval contract

- [x] 盘点当前 `agentSession/action/respond` payload 与 App Server pending action response contract。
- [x] 定义 `ApprovalDecision` / `AgentSessionApprovalDecision`，覆盖 `allow_once`、`allow_for_session`、`decline`、`cancel`。
- [x] App Server / RuntimeCore 接收 decision-based approval response；`tool_confirmation` 缺 decision fail closed。
- [x] `ask_user` / `elicitation` 携带 approval decision fail closed。
- [x] Runtime 投影 `available_decisions`，前端 inputbar 基于可用 decision 渲染精简动作。
- [x] `decline` 映射为“不执行当前动作但不触发 turn cancel”。
- [x] `cancel` 映射为停止当前 turn，并等待用户下一条指令。

退出条件：

- App Server / frontend contract 测试覆盖 decision 枚举。
- 固定两按钮不是协议事实源；它只是 `available_decisions` 的 P0 降级显示。
- 没有前端用 `{ confirmed }` 伪造 tool approval 成功。

### P2：session-scoped approval cache

- [x] 定义 browser_control session-scoped approval key：`action_kind + tool_family + approval_policy + sandbox_policy + contract_key + scope`。
- [x] RuntimeCore 写入并读取 browser_control permission preflight session approval cache。
- [x] 输入区提供“本会话允许”动作，仅在 backend `availableDecisions` 宣告且 RuntimeCore cache 接入时显示。
- [x] Gate B second-request 证明同一 session、同一 browser_control contract 的第二次 request 不再打扰输入区，并由 read model 记录 cache 来源 auto-resolved。
- [x] 泛化更细 scope key：risk class、workspace id、cwd/project root hash、network host。
- [x] Evidence export 记录 session cache hit、自动 resolved request、`decisionScope=session` 与非敏感 cache key，不记录敏感命令输出或 secret。
- [x] turn cancel / approval cancel / session delete 清理 session cache，避免跨任务泄漏授权。

退出条件：

- browser_control first slice：同一 session、同一 contract / approval / sandbox policy 的同类授权不重复打扰。
- 完整 P2：不同目录、host、risk class 不错误复用授权。
- first slice：Evidence export 能解释为什么后续 request 被自动允许。
- 完整 P2：Evidence / read model / replay 均能按更细 scope 解释自动允许来源；Timeline 不展示 scope/source 详情。

### P3：Plan 前置确认与 approval 编排

- [x] 明确 Plan 确认态和 approval prompt 的优先级：同一时间只允许一个输入区阻塞态，顺序固定为 `approval pending > Plan confirmation > normal Inputbar`。
- [x] Plan 确认进入 `submittedActionsInFlight` 后不继续占用输入区，避免确认后执行阶段被 stale pending Plan request 反复打断。
- [x] 长程任务开始前优先展示 Plan 确认；确认后执行阶段不因普通状态同步打断。本轮把本地 proposed plan 的 submitted / dismissed 记忆从 request id 扩展到 plan confirmation key，同一计划从 message 同步到 thread item / plan state 时不再重复弹出确认。
- [x] Plan 修改 / steer 不应误触发 approval response；本轮已覆盖 inputbar slot 层不会把 Plan 继续/修改误发到 approval response，并把本地 proposed plan accept/adjust 的 submit 决策抽到 `buildPlanImplementationSubmitPlan`，`AgentChatWorkspace` 只执行普通 `handleSend` 计划。
- [x] Approval pending 时普通输入、Plan 编辑和 ask_user / elicitation / Service Skill 表单不能抢占同一 request；`AgentChatWorkspace` 用 inputbar approval selector 暂停 effective A2UI，approval submitted 后恢复原 A2UI 业务链路。

退出条件：

- Plan / approval / ask_user / cancel 在 UI 状态机中互斥且语义明确。
- Plan history hydrate 不被 approval 状态污染。

### P4：Evidence / Timeline / Harness 只读闭环

- [x] Timeline 记录 approval resolved status，但用户可见 UI 只展示工具名 + 终态的一行回溯；scope/source/request id 留在 read model / Evidence，不进入聊天详情卡。
- [x] full-access / 完全授权策略下不展示 approval record，避免把无确认动作伪造成一次用户授权。
- [x] pending approval 的消息流 `DecisionPanel` 和 Harness approvals 区不展示提交按钮，不允许二次 respond。
- [x] 历史 approval 不展示提交按钮，不允许二次 respond。
- [x] Evidence export 能区分 session cache 自动允许来源；Timeline / replay 能分类 approved_for_session、declined、cancelled、expired。
- [x] GUI 与 runtime transcript 均证明 denied 后可继续、cancel 后停止。

退出条件：

- 审计能追踪授权来源和作用域。
- 历史回放不会重新执行授权动作。

## 建议写集

| 层               | 可能文件                                                                                  | 说明                                            |
| ---------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------- |
| PRD / 计划       | `internal/roadmap/approval/prd.md`、本文件                                                | 产品口径与执行计划事实源                        |
| Frontend UI      | `InputbarApprovalPrompt.tsx`、`inputbarApprovalAction.ts`                                 | 输入区承载点和 selector                         |
| Frontend runtime | `useWorkspaceInputbarSceneRuntime.tsx`、agent runtime API types                           | pending action / submitted state / payload      |
| Timeline / A2UI  | `StreamingProcessRun.tsx`、`AgentThreadTimelineItemRenderers.tsx`                         | 只读 evidence，禁止 pending 提交入口            |
| Harness evidence | `DecisionPanel.tsx`、`HarnessApprovalsSection.tsx`、`HarnessStatusPanel.runtime.test.tsx` | 消息流 / Harness 只读，不发送 approval decision |
| App Server       | `lime-rs/crates/app-server/**`                                                            | P1 decision contract 和 approval response       |
| RuntimeCore      | `lime-rs/crates/**/runtime**`                                                             | waiter、decision、session cache                 |
| Tests            | workspace inputbar、A2UI、timeline、contract、approval sandbox smoke                      | 防回流和 runtime transcript                     |

避让：

- 不恢复旧 `agent_runtime_*` 生产事实源。
- 不新增 A2UI approval schema。
- 不把 mock fallback 当生产路径。
- 不在没有 App Server 支持时先加“本会话允许”前端按钮。

## 进度日志

- 2026-07-08：P0 输入区 approval current 实现已落地；`tool_confirmation` 不走 A2UI，不在消息流 pending `DecisionPanel` 提交；五语言 i18n、定向 Vitest、typecheck、GUI smoke 已有通过记录。
- 2026-07-08：PRD 补入 HITL 分层、长程任务原则、Codex-rs 对照、P1 decision model、流程图、时序图、架构图和 P0/P1 验收。
- 2026-07-08：新增本执行计划，后续实现从 P1 decision-based approval contract 开始。
- 2026-07-08：P1 decision contract 已接入：`tool_confirmation` 必须携带 `decision`，输入区 approval 不再发送 `{ confirmed }`，`ask_user` / `elicitation` 携带 approval decision fail closed；permission preflight 覆盖 decline 不 cancel、cancel 才停止 turn。
- 2026-07-08：清理旧 inline approval 提交面：消息流 `DecisionPanel` 和 Harness approvals / runtime status panel 均改为只读 evidence，pending `tool_confirmation` 只提示用户回到输入区完成授权；相关测试断言不再接受 `{ confirmed }` 作为 pending approval 正向提交。
- 2026-07-09：Gate B approval CDP 已通过：`approval-request-resume` 真实 Electron 场景从输入区 pending 到 `agentSession/action/respond` 再到 read model completed 闭环；fixture 断言已改成 decision-first，要求前端 respond request 使用 `decision=allow_once` 且不携带旧 `{ confirmed }`。
- 2026-07-09：Gate B session recovery CDP 首次使用 `9223` 失败，原因为本机端口已被占用；改用 `9225` 后通过，证据输出到 `.lime/cdp-evidence/approval-hitl-session-recovery-cdp-summary.json`、`approval-hitl-session-recovery-cdp-trace-summary.json` 和 `approval-hitl-session-recovery-cdp-screenshot.png`。
- 2026-07-09：脚本级回归 `npm test -- "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"` 通过 `33 passed`，覆盖 current fixture assertion / scenario 逻辑，防止 Gate B 重新要求旧 `{ confirmed }` 正向合同。
- 2026-07-09：P2 first slice 已接入：新增 RuntimeCore session approval cache，`allow_for_session` 后按 `action_kind + tool_family + approval_policy + sandbox_policy + contract_key` 写入 session cache；后续同 session browser_control permission preflight 会注入 `harness.approval_session_cache` 并由 backend 产生 `action.resolved decision=allow_for_session`，不再发 `action.required`。`pending_requests` 现在把 `availableDecisions` 投影到顶层，输入区能真实看到 backend 宣告的“本会话允许”；Timeline/read model 的 approval response 也保留 `decision_scope=session`，cache 命中事件保留 `source=approval_session_cache` 与非敏感 cache key。验证：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server permission_preflight --lib -- --nocapture`，`5 passed`。
- 2026-07-09：补跑边界验证 `npm run test:contracts` 通过，覆盖 protocol types check、app-server-client contract、command contracts、harness contracts、modality contracts、scripts governance、Electron release workflow guard、harness cleanup contract 与 docs boundary。
- 2026-07-09：P2 Evidence export first slice 已接入：`CodingEvidenceSummary` 从 `evidence_provider.rs` 拆到 `evidence_provider/coding.rs`，父模块降到 737 行；summary 新增 `approvalSessionCacheHitCount`、`approvalSessionCacheResolvedCount`、source/resolved request ids 与非敏感 `approvalSessionCacheHitKeys`。同时补 App Server event sequence 例外，只允许 `source=approval_session_cache + decision=allow_for_session + decisionScope=session + actionType=tool_confirmation` 的自动 `action.resolved` 不要求前置 `action.required`，普通 action terminal 仍 fail closed。验证：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server coding_snapshot --lib -- --nocapture`，`3 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server approval_session_cache_auto_resolved --lib -- --nocapture`，`1 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server permission_preflight --lib -- --nocapture`，`5 passed`。
- 2026-07-09：P2 Gate B second-request 已通过：`approval-request-resume` 扩展为两轮真实 Electron CDP 场景，第一轮从输入区点击 `allow_for_session`，前端 trace 走 `electron-ipc` + `agentSession/action/respond` 且正向 payload 不带 `{ confirmed }`；backend ledger 记录 `decisionScope=session`。第二轮先把输入区 access mode 切为 `current`，再通过真实 GUI 输入 `@浏览器 打开 https://example.com/approval-session-cache 并确认页面标题`；backend turn start 为 `approvalPolicy=on-request`、`sandboxPolicy=workspace-write`、`browserAssistContractKey=browser_control`，并带 `approval_session_cache decision=allow_for_session scope=session`。GUI 未出现 approval prompt，read model `pendingRequestCount=0`，包含 cache source / second permission request id / auto-resolved。验证：`CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" npm run smoke:claw-chat-current-fixture -- --scenario approval-request-resume --timeout-ms 240000 --cdp-port 9231 --prefix claw-chat-current-fixture-approval-request-resume-cdp --evidence-dir ".lime/qc/gui-evidence/claw-chat-current-fixture"`，通过，summary：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-approval-request-resume-cdp-summary.json`。
- 2026-07-09：Gate A 聚合入口已补跑通过：`CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" npm run smoke:agent-runtime-current-fixture` 覆盖 history/cache hydration、turn completed 收尾、Claw GUI current fixture、Inputbar pending steer 队列 / 恢复、Plan revisioned history hydrate、Skills / Multi-Agent / MCP / media contentParts / Expert Skills / 内容工厂 article editor 等 current fixture，`liveProviderUsed=false`。此前阻塞该入口的 `tool-runtime` 编译问题已用 `ExecutionProcessOutputKind` 最小修正，并通过 `CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p tool-runtime`。
- 2026-07-09：P2 scope/lifecycle 已接入 App Server current owner：`SessionApprovalCacheKey` 扩展 `scope`，包含 `riskClass`、`workspaceId`、`workingDirHash`、`projectRootHash`、`networkHost`，其中 path 只保存 sha256 摘要，URL 只保存 scheme/host/port，不保存 query/token；`action.required` 与 `turn/start.runtimeOptions` 使用同一 scope 口径。`agentSession/turn/cancel`、approval `decision=cancel` 和 `agentSession/delete` 会清理 session cache。验证：`CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server permission_preflight --lib -- --nocapture`，`7 passed`；`coding_snapshot` `3 passed`；`approval_session_cache_auto_resolved` `1 passed`；`cargo check -p app-server` 通过。
- 2026-07-09：P2 scope/lifecycle 后 Gate B 复验收口：`approval-request-resume` 首轮受控 external fixture 的 `action.required/action.resolved` 已补齐与 production `permission_preflight` 同构的 `approvalScope/approval_scope`，其中 `networkHost=https://example.com`、目录类 scope 只输出 sha256 摘要。为避免继续扩展 1200+ 行 backend script，新增 `scripts/agent-runtime/claw-chat-current-fixture-approval-backend-events.mjs` 承接 approval resume backend event renderer，主脚本只保留生成器接线。复验命令 `CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" npm run smoke:claw-chat-current-fixture -- --scenario approval-request-resume --timeout-ms 240000 --cdp-port 9231 --prefix claw-chat-current-fixture-approval-request-resume-cdp --evidence-dir ".lime/qc/gui-evidence/claw-chat-current-fixture"` 通过；summary proofLevel 为 `Gate B CDP controlled fixture`，renderer `electron=true`、`hasInvokeBridge=true`、`supportsAppServer=true`，respond trace 为 `transport=electron-ipc` + `agentSession/action/respond`，18 项 approval 场景断言全 true，包含 `approvalRequestResumeSessionCacheHitInjected=true`、`approvalRequestResumeSecondNoPendingApproval=true`、`approvalRequestResumeSecondReadModelAutoResolved=true`。
- 2026-07-09：本轮验证期间发现 refactor v1 当前工作树的 `agent-runtime::reply_backend::RuntimeReplySourceCall::run_with(...)` 缺少 `M: Send` / `C: Send` 泛型边界，导致 `BoxFuture` 编译失败并阻塞 App Server approval 测试；已按既有 `Send` future contract 做最小修复，并通过 `CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -- --nocapture`，`18 passed`。这不是 approval 逻辑扩展，只是解除 refactor current owner 的编译阻塞。
- 2026-07-09：本轮完整验证：`node --check` 两个 fixture backend 模块通过；`npm test -- "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`，`34 passed`；`npm run test:contracts` 通过；`permission_preflight` `7 passed`；`approval_session_cache_auto_resolved` `1 passed`；`coding_snapshot` `3 passed`；`cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server` 通过；Gate A `smoke:agent-runtime-current-fixture` 通过且 `liveProviderUsed=false`；回流扫描 `handleApprovalResponse|submittedActionIds|canRespondToActions|approvalTarget`、旧 `{ confirmed }` 正向文档、Agent approval hook/cache 关键字均无命中。
- 2026-07-09：P4 Timeline / replay 只读闭环落地：新增 approval record 纯投影，前端按 `response.decision / decision_scope / source / auto_resolved / imported_read_only` 和 lifecycle metadata 分类 `approved_for_session / declined / cancelled / expired / failed`；Timeline 与 streaming submitted `tool_confirmation` 不再进入 `DecisionPanel`；App Server replay 将 `action.canceled/action.cancelled/action.expired` 视为 terminal，避免历史取消或过期 request 重新变成 pending。验证：`npm test -- "src/components/agent/chat/components/timeline-utils/itemConverters.unit.test.ts" "src/components/agent/chat/components/AgentThreadTimeline.test.tsx" "src/components/agent/chat/components/StreamingRenderer.structuredContent.test.tsx" "src/components/agent/chat/components/timeline-utils/timelineCopy.test.ts"`，`41 passed`；`CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server action_replay --lib -- --nocapture`，`2 passed`；`npm run typecheck` 通过；`npm run test:contracts` 通过；Gate A `CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" npm run smoke:agent-runtime-current-fixture` 通过，`liveProviderUsed=false`；Gate B `CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" npm run smoke:claw-chat-current-fixture -- --scenario approval-request-resume --timeout-ms 240000 --cdp-port 9234 --prefix claw-chat-current-fixture-approval-request-resume-cdp-p4 --evidence-dir ".lime/qc/gui-evidence/claw-chat-current-fixture"` 通过，summary：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-approval-request-resume-cdp-p4-summary.json`。
- 2026-07-09：根据 GUI 复核反馈，approval 历史记录从详情卡收敛为时间线单行状态：只展示工具名 + 终态，不展示 prompt、request id、scope、source 和“历史记录只读”；full-access / 完全授权策略下不生成 approval record，避免把无确认动作伪造成一次授权。Gate B fixture completion snapshot 新增 `approvalRecordShape`，approval resume / decline / cancel 场景断言记录为单行且无旧详情片段。验证：`npm test -- "src/components/agent/chat/components/timeline-utils/itemConverters.unit.test.ts" "src/components/agent/chat/components/AgentThreadTimeline.test.tsx" "src/components/agent/chat/components/StreamingRenderer.structuredContent.test.tsx" "src/components/agent/chat/components/timeline-utils/timelineCopy.test.ts"`，`44 passed`；脚本语法检查 `node --check scripts/agent-runtime/claw-chat-current-fixture-gui-completion-waits.mjs` 与 `node --check scripts/agent-runtime/claw-chat-current-fixture-approval-assertions.mjs` 通过。
- 2026-07-09：完全授权 Gate B 已补齐并通过：`npm run smoke:claw-chat-current-fixture -- --scenario approval-request-full-access --timeout-ms 180000 --cdp-port 9235 --prefix claw-chat-current-fixture-approval-request-full-access-cdp-p4 --evidence-dir ".lime/qc/gui-evidence/claw-chat-current-fixture"` 真实 Electron CDP 场景通过，summary：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-approval-request-full-access-cdp-p4-summary.json`。断言覆盖 `approvalPolicy=never`、`sandboxPolicy=danger-full-access`、无输入区 approval prompt、无 `timeline-approval-record`、read model 无 pending approval / action required / action resolved、trace 不发送 `agentSession/action/respond` 且无旧 `agent_runtime_respond_action`。为使 Gate B 进入该断言层，本轮仅补 `claw-chat-current-fixture-common-assertions.mjs` 的 full-access 通用 GUI 可见性分支；同时配合并行 `agent-compat` staging 做 manifest 构建对齐，恢复 App Server sidecar 构建，没有向 Agent/agent-compat 新增 approval 逻辑。
- 2026-07-09：decline / cancel Gate B 已有通过证据：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-approval-request-decline-cdp-p4-final-summary.json`，`checkedAt=2026-07-09T00:08:14.812Z`，`ok=true`，`proofLevel=Gate B CDP controlled fixture`，`43` 个断言全通过；`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-approval-request-cancel-cdp-p4-final-rerun-summary.json`，`checkedAt=2026-07-09T00:19:23.817Z`，`ok=true`，`proofLevel=Gate B CDP controlled fixture`，`43` 个断言全通过。断言覆盖 `agentSession/action/respond decision=decline|cancel`、payload 不带旧 `{ confirmed }`、decline 不产生 `turn.canceled` 且继续替代路径、cancel 产生 `turn.canceled`、两者均不执行被拒绝工具、Timeline approval record 为单行 compact 且无旧详情片段。贴边复核已通过：`node --check` 覆盖 `claw-chat-current-fixture-approval-resume.mjs`、`approval-assertions.mjs`、`approval-gui.mjs`、`approval-read-model.mjs`；`npm test -- "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" "scripts/agent-runtime/current-fixture-regression-smoke.test.mjs"` 通过，`55 passed`。本轮重复启动 `approval-request-decline` 时被并行 `smoke:electron` / `electron:dev` 的 `app-server` sidecar rebuild 占用构建锁阻塞，未生成新的 p5 summary；若后续修改相关脚本或 App Server approval contract，需要按上方命令重跑 p5 证据。
- 2026-07-09：P3 第一刀完成：输入区阻塞态优先级固化为 `approval pending > Plan confirmation > normal Inputbar`。`useWorkspaceInputbarSceneRuntime` 在 Plan 确认与 pending approval 同时存在时只渲染 approval；同一 approval 进入 `submittedActionsInFlight` 后释放输入区，如果还有 Plan 确认则回到 Plan，不误调用 `onRespondToAction`。同时 `selectLatestPlanComposerDecision` 开始排除 `submittedActionsInFlight` 中的 Plan request，避免后端 read model 短暂未清 pending 时 Plan 确认继续占位。验证：`npm test -- "src/components/agent/chat/workspace/useWorkspaceInputbarSceneRuntime.test.tsx" "src/components/agent/chat/workspace/planComposerDecision.unit.test.ts"`，`25 passed`；`npm test -- "src/components/agent/chat/workspace/PlanComposerDecisionPanel.test.tsx"`，`7 passed`。
- 2026-07-09：P3 Plan accept / adjust 接线完成：`buildPlanImplementationSubmitPlan` 统一构造本地 proposed plan 的 accept / steer 发送计划，accept 发送 `Implement the plan.` 且 `task=false`，adjust 发送用户修改文本且继续 `mode=plan` / `task=true`；测试断言 send plan 不包含 `agentSession/action/respond`、`allow_once`、`decline`、`cancel` 等 approval response 形状。`AgentChatWorkspace` 只根据 helper 结果执行 `handleSendRef.current(...)` 或 dismiss，不再在巨型组件里拼 Plan implementation metadata。验证：`npm test -- "src/components/agent/chat/workspace/planImplementationDecision.unit.test.ts"`，`13 passed`；P3 相关组测 `npm test -- "src/components/agent/chat/workspace/useWorkspaceInputbarSceneRuntime.test.tsx" "src/components/agent/chat/workspace/planComposerDecision.unit.test.ts" "src/components/agent/chat/workspace/PlanComposerDecisionPanel.test.tsx" "src/components/agent/chat/workspace/planImplementationDecision.unit.test.ts"`，`45 passed`；`npm run typecheck` 通过。
- 2026-07-09：P3 approval / A2UI 互斥收口：`useWorkspaceA2UIRuntime` 增加 `suppressPendingA2UI`，`AgentChatWorkspace` 通过 current `selectPendingInputbarApprovalAction` 在未提交 approval pending 时暂停 message A2UI、ask_user / elicitation A2UI、Service Skill 补参和 scene gate effective A2UI，避免业务表单抢占同一底部决策区；approval 进入 `submittedActionsInFlight` 后恢复原 A2UI 链路。验证：`npm test -- "src/components/agent/chat/workspace/useWorkspaceA2UIRuntime.test.tsx" "src/components/agent/chat/workspace/useWorkspaceInputbarSceneRuntime.test.tsx" "src/components/agent/chat/workspace/planComposerDecision.unit.test.ts" "src/components/agent/chat/workspace/planImplementationDecision.unit.test.ts"`，`49 passed`；`npm run typecheck` 通过；`npm run verify:gui-smoke` 通过，真实 Electron renderer、App Server sidecar、Claw workbench shell 和 memory settings ready。
- 2026-07-09：P3 Plan 确认后不重复打断收口：`planImplementationDecision` 为 proposed plan 生成 `plan_confirmation_key(s)`，同时保留 text fingerprint fallback 和 revision+fingerprint key；`AgentChatWorkspace` 在 accept / adjust / ignore 后记录 submitted / dismissed confirmation keys，普通 read model 状态同步把同一计划从 message 提升为 thread item / plan state 时不会再次弹出 Plan 确认；同一 revision 内容变化仍会重新确认。验证：`npm test -- "src/components/agent/chat/workspace/planImplementationDecision.unit.test.ts" "src/components/agent/chat/workspace/planComposerDecision.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceInputbarSceneRuntime.test.tsx"`，`40 passed`；P3 完整贴边组测 `npm test -- "src/components/agent/chat/workspace/useWorkspaceA2UIRuntime.test.tsx" "src/components/agent/chat/workspace/useWorkspaceInputbarSceneRuntime.test.tsx" "src/components/agent/chat/workspace/planComposerDecision.unit.test.ts" "src/components/agent/chat/workspace/PlanComposerDecisionPanel.test.tsx" "src/components/agent/chat/workspace/planImplementationDecision.unit.test.ts"`，`58 passed`；`npm run typecheck` 通过；`npm run verify:gui-smoke` 通过，真实 Electron renderer、App Server sidecar、Claw workbench shell 和 memory settings ready。
- 2026-07-09 13:20 CST：P3 release 级 Gate A 聚合复跑通过：`CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" npm run smoke:agent-runtime-current-fixture` 覆盖 history/cache hydration、turn completed 收尾、真实 Electron 首页首发热路径、Coding Workbench、图片命令、cancel-then-continue、approval allow-for-session resume / decline / cancel / full-access no prompt、Inputbar pending steer 队列 / 恢复、Plan revisioned history hydrate、Skills / Multi-Agent / MCP / media contentParts / Expert Skills / 内容工厂 article editor 等 current fixture，`liveProviderUsed=false`。其中 full-access 场景断言完全授权下无 approval prompt / 无 timeline record，P3 相关场景证明 Plan / approval / inputbar 队列编排未回流旧面。
- 2026-07-09：更多 tool family 第一刀完成：shell / command execution 的 `action.required` 补齐 decision-first payload，包括 `actionKind=tool_execution_policy`、`toolFamily=shell_command`、`runtime_contract.contract_key=shell_command`、`approvalScope/approval_scope` 非敏感摘要、`contractKey/contract_key` 与 `availableDecisions`。默认 shell decisions 固定为 `allow_once / decline / cancel`，不宣告 `allow_for_session`；即使上游 metadata 错误透传该 decision，App Server 也要求 `allow_for_session` 能生成 RuntimeCore session approval cache entry，否则 fail closed。`approvalScope` 中 cwd/project root 只输出 hash，不输出 raw path，network URL 只归一化到 scheme/host/port。验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过；`CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle --lib -- --nocapture` 通过，`14 passed`。
- 2026-07-09：App Server approval decision contract guard 完成：新增 `runtime::approval_decision_contract`，`agentSession/action/respond` 在调用 backend 前校验 decision 必须来自 pending `tool_confirmation.availableDecisions`；`allow_for_session` 还必须能通过 `approval_cache::entry_from_action_response` 生成 current session cache entry。shell / command execution 当前没有运行中 tool lifecycle cache consumer，所以 `allow_for_session` 即使被错误宣告也会 fail closed，且不会调用 backend resume。验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server -- --check` 通过；`CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server approval_decision_contract --lib -- --nocapture` 通过，`1 passed`；`CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server permission_preflight --lib -- --nocapture` 通过，`8 passed`。文件体量备注：`turn_execution.rs` 已超过 1000 行，本轮只接一行 current guard 调用并把新逻辑拆到 `approval_decision_contract.rs`；下一次触碰 respond path 时应继续把 action response contract / workflow audit helper 从中心文件拆出。
- 2026-07-09：shell approval contract / scope projection owner 收敛到 `tool-runtime::execution_approval`，`lime-agent` 的 `ToolApprovalActionSnapshot` 只负责把 current projection materialize 成 `RuntimeAgentEvent::ActionRequired`。`lime-agent` 不再持有 URL 归一化和 scope hash 规则，也移除了 `url` 直接依赖；该改造没有启用 shell `allow_for_session`，只是把后续 stable shell approval key 的 owner 放回 Turn tool lifecycle 层。验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime execution_approval --lib -- --nocapture` 通过，`2 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle --lib -- --nocapture` 通过，`14 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator --lib -- --nocapture` 通过，`16 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server approval_decision_contract --lib -- --nocapture` 通过，`1 passed`。
- 2026-07-10：按最终 GUI 反馈将输入区 approval 从多行 compact panel 收敛为固定高度单行控件：只保留权限图标、单行截断 prompt 和 backend `availableDecisions` 动作；窄宽度下按钮隐藏文字但保留图标、`aria-label` 与 tooltip。删除风险分级、工具/命令/目录参数 chips、JSON details/pre、旧 risk/argument/details i18n，并补 `InputbarApprovalPrompt.test.tsx` 防止详情卡回流。该刀不修改 App Server contract、RuntimeCore cache 或 `agent-compat`。
- 2026-07-10：单行 UI 静态与组件验证完成：Approval/A2UI/Timeline 定向组测 `4 files / 50 tests`，fixture 脚本测试 `58 tests`，`npm run typecheck`、`npm run i18n:unused -- --check`、Prettier 与 `git diff --check` 通过；五语言 `agentInputbar.json` 已删除废弃 risk/argument/tool/details 文案，unused key 为 `0`。
- 2026-07-10：Gate A 聚合 `npm run smoke:agent-runtime-current-fixture` 通过。最新 approval current fixture summary 的 resume `50`、decline `43`、cancel `43`、full-access `40` 项断言全部通过；resume pending UI 实测 `44px`、textarea 隐藏、无 tool/command/details/pre；full-access 无 prompt 与 timeline record。该聚合不替代 CDP proof level。
- 2026-07-10：四个最新 Gate B Electron CDP 场景全部通过，proof level 均为 `Gate B CDP controlled fixture`，renderer 均为真实 Electron + preload invoke + App Server current bridge，且无失败断言。证据分别为 `claw-chat-current-fixture-approval-request-resume-cdp-p6-summary.json`、`claw-chat-current-fixture-approval-request-decline-cdp-p6-summary.json`、`claw-chat-current-fixture-approval-request-cancel-cdp-p6-summary.json`、`claw-chat-current-fixture-approval-request-full-access-cdp-p6-summary.json`。resume 证明单行 pending 与 session cache second-request；decline/cancel 证明 decision 语义分离；full-access 证明无 prompt、无 timeline record、无 `agentSession/action/respond`。
- 2026-07-10：GUI 与契约最终门槛通过：`npm run verify:gui-smoke` 证明真实 Electron renderer、preload、App Server sidecar、Claw workbench shell 与 memory settings ready；`npm run test:contracts` 证明 protocol/client/Electron command/Harness/modality/scripts/release/docs boundary 无漂移。首次 Gate B 使用相对隔离 `CARGO_TARGET_DIR=".lime/cargo-target/r4-verification"` 时，仅因 target 缺少 `sherpa-onnx` 预编译库在 sidecar 链接阶段失败，未进入 Electron/CDP；改回默认 `lime-rs/target` 后四场景全部通过，未修改 `agent-compat`。

## 当前下一刀

P2 browser_control session cache、scope/lifecycle、Evidence export first slice、Gate B second-request、full-access Gate B、decline/cancel Gate B、P4 Timeline / replay 只读分类、P3 输入区阻塞态优先级、Plan accept/adjust 接线、approval/A2UI 互斥、Plan 确认后不重复打断、P3 release 级 Gate A 聚合、shell approval scope/contract 事件形状 first slice、`tool-runtime::execution_approval` owner 收敛，以及 App Server cache-owner fail-closed 守卫均已完成。当前不再新增 approval 旧 UI / A2UI 兼容入口。下一刀策略：

1. 修改 App Server / fixture approval contract 后，再按需重跑四个 approval-request Electron CDP 场景并生成新证据前缀。
2. 若继续推进 shell / command execution 的 `ApprovedForSession`，必须先在 App Server / RuntimeCore 定义 stable shell scope key、Evidence 非敏感摘要、cache lifecycle 和 read model auto-resolved 事件，再把 `allow_for_session` 加入默认 decisions 并补对应 Gate B。
3. 进入其它 tool family 的 approval scope 接入时，沿用同一顺序：先 contract/scope 形状，再 cache owner，再 Gate B；不得直接在前端或 Agent adapter 展示“本会话允许”。

工程边界提醒：`scripts/agent-runtime/claw-chat-current-fixture-approval-resume.mjs` 当前约 `794` 行，已接近仓库 `800` 行拆分预警线。下一次扩展 approval CDP 场景前，先按 GUI 操作、trace/read-model assertion、backend ledger summary 拆分，避免继续向单一 smoke scenario 文件堆逻辑。
