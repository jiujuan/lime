# Codex 对话兼容重构执行计划

状态：active
责任域：app-server-runtime / agent-ui
开始日期：2026-07-15
最近验证：2026-07-17
预算标签：high，重大架构重构

## 目标

以 `/Users/coso/Documents/dev/rust/codex` 的 current App Server、RolloutItem、
ThreadHistoryBuilder 与 Thread/Turn/Item 语义为参考，替换 Lime 现有 imported runtime event
双轨。导入历史不重放执行；导入后的新 turn 进入 Lime current provider/tool runtime。
导入是主验收流程，普通新对话、Lime 历史恢复和导入续聊必须共享同一 canonical schema、
tool lifecycle、执行器、审批、sandbox 与 GUI，不接受 imported-only 修补。

## Current 主链

```text
Electron Desktop Host
  -> app_server_handle_json_lines
  -> conversationImport/*
  -> thread/commit start + job/read progress
  -> Codex rollout decoder
  -> canonical Thread/Turn/Item history
  -> EventLog -> ThreadStore -> ProjectionStore
  -> agentSession/read / canonical notifications
  -> GUI

agentSession/turn/start
  -> agent-runtime provider loop
  -> CurrentTurnToolExecutor
  -> tool-runtime / approval / sandbox / MCP
  -> canonical Item lifecycle
```

## 窄写集

见 `internal/roadmap/codeximport/implementation-tracker.md`。不主动触碰当前脏工作树中的
multi-agent roster、team memory、Harness 或 refactor-v2 evidence 实现。

## 删除集与当前结果

- `ImportedRuntimeEvent` / `ImportedRuntimeEventNormalizer`：已从 current 编译图移除；只允许出现在历史 evidence / 负向 guard。
- `ImportedToolDraft` / `commit_events/tool_lowering.rs`：current 不再使用双重 wire lowering；source adapter 解析态直接交给 canonical history builder。
- `conversationImport/thread/runtimeEvents/read`：已由 canonical `agentSession/read`、`thread/read`、`thread/items/list` 承接。
- Renderer `source_client=codex` 驱动的工具分组、标题、强制展开和 fallback：已删除，历史与实时 Item 共用 renderer。
- imported-only i18n 文案与正向 fixture：已删除；旧字符串只留负向 guard/evidence。
- Claude Code importer 占位分支：继续保持 dead，不恢复扩展壳。
- 旧 compact “画布优先 + 聊天右抽屉”布局：已从 shared `LayoutTransition` 删除；窄容器改为聊天优先单面板，普通与导入会话共用。

## Happy Path

1. 用户从侧栏打开本地历史导入。
2. App Server 只读扫描 Codex home，并预览 canonical item 摘要。
3. 用户确认后，App Server 原子写入 Thread / Turn / Item 与 provenance。
4. GUI 读取相同 canonical history，按普通工具/命令/patch UI 展示。
5. 用户发送 follow-up；模型调用 `exec_command` 或其他工具。
6. current tool executor 完成审批/执行，产生新的 canonical completed Item。
7. 用同一 fixture 在普通 session 重复第 5-6 步，除 provenance 外结果结构一致。

## Evidence Layers

- Unit：rollout golden corpus、item mapping、id/order/status、source security。
- Contract：JSON-RPC/schema/generated client/Renderer gateway。
- Integration：ThreadStore/ProjectionStore/read model；历史零重放；live tool continuation。
- Gate A：canonical read model 到 GUI 的 command/tool/patch/reasoning 展示。
- Gate B：真实 Electron scan/preview/commit/read/turn-start/tool terminal 与 trace。

## Agent Verification Contract

```text
改动名称：Codex 对话兼容重构
执行计划文件：internal/exec-plans/codex-conversation-compat-refactor-plan.md
负责人：app-server-runtime / agent-ui
预算标签：budget:normal
风险等级：P0
影响模块：conversation import、ThreadStore/ProjectionStore、Agent GUI、tool continuation
不做范围：双向同步、source 写回、Claude Code importer、live Provider release evidence
```

```text
前端入口：侧栏本地历史导入
前端网关：src/lib/api/conversationImport.ts
Electron Desktop Host bridge：app_server_handle_json_lines 透传
App Server method：conversationImport/source/scan、thread/preview、thread/commit、job/read、agentSession/turn/start
RuntimeCore / service owner：conversation_import source adapter、ThreadStore、agent-runtime、tool-runtime
read model：agentSession/read + thread/read/items/list
runtime event：canonical Thread/Turn/Item notification
Evidence Pack 字段：source provenance、canonical item identity/status、tool terminal
GUI surface：会话消息时间线与普通 command/tool/file change 卡
```

```text
用户输入 / Agent 输入：选择 Codex thread 导入并发送 follow-up
预期 runtime events：导入只写 canonical completed history；follow-up 产生普通 live item lifecycle
预期 tool calls：provider fixture 发起 exec_command，CurrentTurnToolExecutor 执行并回传输出
预期 approval / sandbox：遵循当前 turn 选择；历史 approval 只读且不进入 pending queue
预期 artifact：command output / patch 使用 current output sidecar 与 preview contract
预期 evidence：Electron trace、read model item、provider fixture ledger、零历史重放 marker
预期 GUI 状态：普通 command/tool 卡，无 imported-only 标题或重复过程组
失败时应停在哪一层：decoder/schema 失败时 commit fail-closed，不创建半成品 session
```

| Layer               | 需要 | 证据                                                     |
| ------------------- | ---- | -------------------------------------------------------- |
| deterministic-smoke | 是   | Rust golden corpus、contracts、agent runtime fixture     |
| gui-trace           | 是   | Codex click-through Electron fixture + real sample audit |
| runtime-transcript  | 是   | 本地 provider fixture，只保存 tool marker/terminal facts |
| release-artifact    | 否   | 本轮不进入 release evidence，需责任开发者架构确认        |

```bash
# C0
npm run test:contracts
npm run governance:legacy-report

# C1
npm run test:rust:related -- lime-rs/crates/app-server/src/runtime/conversation_import
npm run smoke:agent-runtime-current-fixture

# C2
npm run smoke:codex-import-click-through-electron-fixture -- --timeout-ms 180000
npm run smoke:local-history-import-real-sample-visual-audit -- --timeout-ms 240000 --max-source-lines 5000 --max-source-messages 200 --max-source-items 1200
npm run verify:gui-smoke
```

P0 场景：导入后真实 tool continuation、普通对话同构、历史 tool 零重放、canonical read
model 与 GUI 单轨。
本轮不跑 C3/C4、qcloop 或 live Provider；本地确定性 provider fixture 足以证明 tool loop owner。

## 2026-07-17 结果

- Gate B click-through：`codex-import-click-through-v30-summary.json` 通过，导入后 read model 为 15 items / 4 messages，续聊使用同一 session/cwd；reasoning、command、approval、web search、file artifact、附件与 Markdown / HTML / DOCX / XLSX / PPTX / PDF 预览均可见。
- responsive GUI：desktop 保持分栏；compact / narrow 使用聊天优先单面板和显式“聊天 / 工作台”切换；窗口缩放不重挂载消息树；fixture 直接断言模式控件与其他按钮无矩形重叠。
- 真实 Codex sample：`local-history-import-real-sample-visual-audit-v4-summary.json` 通过，使用当前工作区 source 的只读 bounded sample（5,000 行 / 200 消息 / 1,200 items），投影 5 个 turn 组、10 条消息、346 个 tool row、10 个文件产物，三视口乘三滚动位置无 source leak、console error、工具栏遮挡或输入框阻塞。
- Rust app-server 1181/1181、后台导入 gateway / View Model / DOM 与 Electron guards 46/46、contracts 291 checks、`smoke:agent-runtime-current-fixture`、legacy/scripts governance 与 `verify:gui-smoke` 全部通过。
- 最终 fidelity matrix、click-through 与真实样本 visual-audit 守卫 19/19；响应式 GUI 已进入 required matrix row，privacy guard 直接校验 `collectVisibleTextLeaks`、来源品牌模式、source metadata 隐藏与失败消息，未增加展示豁免。
- `conversationImport/thread/commit` 已统一为后台 job start，`conversationImport/job/read` 返回 reading/building/persisting/finalizing 进度和 terminal canonical result；GUI 使用单一紧凑进度带，不增加 imported-only read model。
- public JSON-RPC 集成、RuntimeCore job 单元与 40 turns / 1,200 commands 压力回归通过；commit-start 小于 2 秒，后台 5.59 秒完成、进度 40/40、`budgetDropped=0`。
- `codex-import-click-through-background-v1` 与 `local-history-import-real-sample-background-v1` Gate B 通过；前者 trace 包含 `job/read` 并保持续聊/预览/三视口，后者完成 434 canonical items、346 tool rows、10 file artifacts 与 9 组审计。
- `npm run docs:boundary` 与本计划相关文件 Prettier 检查通过，文档收尾完成；计划仅因责任开发者架构确认保持 active。Windows 真实 Electron 路径证据留给 Windows runner，不在 macOS 本机伪造。

失败必须回写 Rust golden corpus、Electron fixture 或 contract guard。只有主链验证、删除证明、
架构确认三者齐全后才可进入 release evidence。

## 架构确认

- 重大架构变更：是。
- 架构影响：Codex import 从 imported RuntimeEvent 第二事实源迁到 canonical Thread/Turn/Item。
- 架构图章节：`internal/aiprompts/architecture.md` 第 7 节 Agent 产品主链。
- 责任开发者：待 PR 填写。
- 确认日期：待 PR 填写。

责任开发者与日期未填写前，不进入 release evidence，不标记计划完成。

## 退出条件

1. 删除集全部物理删除并有回流守卫。
2. Rust/TS/contract/governance 校验通过。
3. Gate B 证明导入与 live tool continuation；历史工具零重放。
4. 有界真实样本多视口可读，无 generic imported command 列表泛滥；超大历史性能跟进单独验收。
5. 路线图、架构、执行计划与最终 evidence 同步。
