---
title: Codex 对话兼容与导入路线图
status: active
owner: app-server-runtime
updated: 2026-07-17
---

# Codex 对话兼容与导入

## 主目标

Lime 读取 Codex 的 `state_*.sqlite`、`session_index.jsonl` 与 rollout JSONL，按 Codex
App Server 的 Thread / Turn / Item 语义重建历史；导入后的下一轮继续走 Lime current
`agentSession/turn/start -> agent-runtime -> tool-runtime`。GUI 对历史 Item 与实时 Item 使用
同一套展示，不保留“导入的命令记录”或 imported-only tool runtime。

导入是本路线图的主验收流程，但不是专用 runtime。普通新对话、Lime 历史恢复和 Codex
导入后的续聊必须共享同一套 Codex-aligned Thread / Turn / Item、tool lifecycle、approval、
sandbox 与 GUI；任何只对 imported metadata 生效的行为修补都不算完成。

```text
Codex rollout JSONL
  -> read-only source discovery
  -> Codex RolloutItem decoder
  -> canonical Thread / Turn / Item history builder
  -> ThreadStore + ProjectionStore
  -> agentSession/read + canonical notifications
  -> Agent GUI

next user turn
  -> agentSession/turn/start
  -> provider sampling
  -> current tool-runtime execution / approval / sandbox
  -> canonical Item lifecycle
```

## 架构裁决

1. 历史导入只重建已经发生的 Item，绝不重新执行历史 command、patch、MCP 或 tool call。
2. `ThreadItem` 是导入与实时执行的共同事实源；来源信息只放在 item/thread metadata。
3. Codex command 必须落为 `Command` item，MCP、dynamic、collab、web search、file change、
   reasoning、plan、message 必须落为各自 canonical item，不得全部压成 generic Tool。
4. 导入后的新 tool call 必须由 current provider loop 产生并交给 `tool-runtime`；导入模块
   不拥有 executor、审批状态、sandbox 或工具 catalog。
5. Renderer 不解析 rollout，不按 `sourceClient=codex` 创建第二套时间线或卡片。
6. Electron 只提供目录选择与 App Server JSONL 转发，不承接导入业务逻辑。
7. 普通对话与导入会话必须同构；导入只增加 provenance，不改变 Item schema、执行器或 UI。
8. GUI 响应式布局由 shared `LayoutTransition` 按实际内容容器宽度决策；窄态默认展示完整
   聊天，并通过明确模式控件切换工作台，不允许因窗口缩放重挂载消息树或丢失滚动位置与输入草稿。

历史 GUI 显示策略固定为 Codex App 语义：canonical Thread/Turn/Item 永不裁剪，read model
完整保留 command、reasoning、tool、approval、search 等运行事实；但 terminal turn 的消息主线
只投影 final 正文、附件、文件产物/变更与“已处理 Xs”分隔。分隔是不可交互的历史标记，不再
点击展开 operational timeline。只有当前 active turn 才挂载 reasoning、command、tool、search
和 approval 过程；普通对话、历史恢复与 Codex 导入共享这一规则。

## 治理分类

| Surface                                                                         | 分类    | 处理                                                                                               |
| ------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `conversationImport/source/scan`、`thread/preview`、`thread/commit`、`job/read` | current | typed App Server 边界；commit 启动同一 canonical owner 的后台 job，read 返回进度与 terminal result |
| source discovery、只读安全校验、provenance                                      | current | 保留并收敛到 source adapter                                                                        |
| `ImportedRuntimeEvent` / `commit_events/tool_lowering`                          | dead    | 已删除；禁止先造 imported product wire 再二次 lowering                                             |
| `conversationImport/thread/runtimeEvents/read` sidecar 下钻                     | dead    | 已删除；旧 method 只允许负向 guard                                                                 |
| terminal 历史里的 operational command/tool/approval 展开入口                     | dead    | 删除；历史只投影 final、附件、文件产物/变更与处理时长，canonical item 仍由 read model 保留          |
| `smoke:codex-import-content-studio` 真实数据脚本                                | dead    | 已删除；由 Rust corpus、点击导入 Gate B 与有界真实样本审计承接                                     |
| Claude Code importer 占位与 unsupported 分支                                    | dead    | 当前无需求，不保留扩展壳                                                                           |

## 阶段

### S0：事实源重置

- [x] 明确 Codex Thread / Turn / Item 为导入语义参考。
- [x] 明确历史不重放、续聊走 current tool executor。
- [x] 将旧路线图完成声明降为历史 evidence，不再作为 current 验收。

### S1：Canonical history builder

- [x] 从 rollout 解析 persisted `RolloutItem`，建立 turn boundary 与稳定 item identity。
- [x] 覆盖 message、reasoning、command、file change、MCP、dynamic tool、web search、plan、
      approval、image、context compaction、review 与 collab activity。
- [x] 直接写入 canonical Thread / Turn / Item；未知新事件 fail-closed 并计入 preview。
- [x] 删除 imported runtime draft、synthetic tool lifecycle 与 materialized window。

### S2：续聊与工具执行

- [x] 导入 session 恢复 cwd、workspace roots 与必要的 model-visible history。
- [x] 新 turn 只使用 Lime 当前 provider/model/approval/sandbox 选择。
- [x] provider 发出 `exec_command`、`apply_patch`、MCP、`request_user_input` 时，走与普通
      session 相同的 `CurrentTurnToolExecutor`。
- [x] 历史 command/tool 永不再次执行，并有负向测试。
- [x] 同一 provider fixture 分别从普通 session 与导入 session 发起相同工具调用，canonical
      Item、审批、sandbox、输出和终态除 provenance 外一致。

### S3：GUI 单轨

- [x] 删除 imported-only command/tool group、标题和展开策略。
- [x] active turn 显示 command/tool/approval 运行过程；terminal 历史只保留 final、附件、文件
      产物/变更与处理时长，canonical operational item 由 read model 完整保留。
- [x] 来源与导入时间只出现在会话详情/诊断，不进入消息主线。
- [x] 五语言同步删除过时的 imported command 文案与正向断言。
- [x] desktop 保持聊天/工作台分栏；compact/narrow 使用聊天优先单面板，并保留工作台入口。
- [x] 断点切换保持消息树稳定，不丢历史摘要、滚动位置和输入草稿；历史摘要不可交互。

### S4：验证与删除证明

- [x] Rust golden corpus 覆盖当前 Codex rollout 版本与 archived / compressed rollout。
- [x] 导入同一 source 幂等；替换导入不残留旧 ThreadStore / ProjectionStore 数据。
- [x] Gate B 真实 Electron：scan -> preview -> commit -> job/read -> session read -> 输入 follow-up。
- [x] runtime provider fixture：follow-up 触发真实 shell/tool，断言输出、终态和审批。
- [x] 有界真实样本、多视口、控制台错误、bridge trace 与 source leak 审计。
- [x] 超大历史 commit 统一进入可观测后台 job；GUI 展示阶段/百分比，重复提交复用 active job。
- [x] 批量确认先启动全部 job；关闭弹窗不取消后台任务，重开优先展示 importing 会话并按 `importJobId -> job/read` 重新附着同一 active job。
- [x] `test:contracts`、`governance:legacy-report`、`verify:gui-smoke` 通过。

## 2026-07-17 证据

- 点击导入 Gate B：`codex-import-click-through-v30-summary.json`，15 个 canonical item、4 条消息，覆盖 reasoning、command、approval、tool、web search、file artifact、六类文件预览、附件与同 session 续聊；desktop / compact / narrow 均通过，输入框与消息列表可用，模式控件无按钮重叠，console error 为 0。
- 真实 Codex 样本 Gate B：`local-history-import-real-sample-visual-audit-v4-summary.json`，来自当前工作区的只读 source，canonical item 全量保留；terminal 历史 tool row 与 operational details 为 0，仍可见 final、附件、文件产物/变更与处理时长。三视口乘三滚动位置无 source leak、console error、工具栏遮挡或输入框阻塞。默认预算为 5,000 rollout 行、200 消息、1,200 timeline item。
- `app-server` Rust 单元测试 1181/1181；contracts 291 项；后台导入 gateway / View Model / DOM 与 Electron guards 46/46；治理扫描零边界违规；`smoke:agent-runtime-current-fixture` 与 `verify:gui-smoke` 通过。
- 后台导入 Gate B：`codex-import-click-through-background-v1-summary.json` 的 trace 包含 `conversationImport/job/read`，15 items / 4 messages、六类预览、同 session 续聊与三视口审计保持通过；`local-history-import-real-sample-background-v1-summary.json` 覆盖 1,500 source lines、785 个预估导入项、5 turns，最终 434 canonical items、346 tool rows、10 file artifacts 与 9 组视觉审计通过。
- 后台关闭/重附着 Gate B：`codex-import-click-through-background-resume-v1-summary.json` 明确记录 `started / closed / reattached = true`，并断言整个闭环只有 1 次 `thread/commit` / 1 次 `job/read`；181 条 command 压力来源最终形成 195 个 canonical item / 4 条消息，`agentSession/turn/start` 同 session 续聊、六类预览与 desktop / compact / narrow 审计保持通过，console error 为 0。
- 多 turn 压力回归把 1,200 commands 分布到 40 turns：commit-start 在 2 秒预算内返回，后台 5.59 秒完成，进度 40/40、`budgetDropped=0`。长导入不再受单次 JSON-RPC commit 超时限制。

## 完成定义

只有同时满足以下条件才能标记完成：

1. 仓库不存在 imported-only tool lifecycle producer/consumer。
2. 导入历史与实时历史由同一 `ThreadItem` schema、read model 和 GUI renderer 消费。
3. 真实 Electron 导入可见，导入后真实 provider tool loop 可执行 command/tool；历史 operational detail 不挂载。
4. 历史工具零重放，source 目录零写入，生产零 mock fallback。
5. current / deprecated / dead 守卫、架构确认、定向测试和 Gate B evidence 齐全。

当前实现已满足 1-4 与验证门禁；第 5 项仍等待责任开发者填写架构确认，计划保持 `active`，不进入 release evidence。Windows 真实 Electron 路径证据仍需在 Windows runner 补齐，本机只完成跨平台路径定向测试。

执行进度见 [implementation-tracker.md](implementation-tracker.md)，产品边界见
[prd.md](prd.md)，验收矩阵见 [fidelity-acceptance-matrix.md](fidelity-acceptance-matrix.md)。
