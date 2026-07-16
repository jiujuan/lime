---
title: Codex 对话兼容与导入路线图
status: active
owner: app-server-runtime
updated: 2026-07-15
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

## 治理分类

| Surface | 分类 | 处理 |
| --- | --- | --- |
| `conversationImport/source/scan`、`thread/preview`、`thread/commit` | current | 保留 typed App Server 边界，内部改为 canonical history builder |
| source discovery、只读安全校验、provenance | current | 保留并收敛到 source adapter |
| `ImportedRuntimeEvent` / `ImportedToolDraft` / `commit_events/tool_lowering` | dead | 删除；禁止先造 imported wire 再二次 lowering |
| `conversationImport/thread/runtimeEvents/read` sidecar 下钻 | deprecated | canonical item 分页承接后删除 |
| `source_client=codex` 驱动的“导入的命令记录”展示 | dead | 删除；复用普通 command/tool item UI |
| Claude Code importer 占位与 unsupported 分支 | dead | 当前无需求，不保留扩展壳 |

## 阶段

### S0：事实源重置

- [x] 明确 Codex Thread / Turn / Item 为导入语义参考。
- [x] 明确历史不重放、续聊走 current tool executor。
- [x] 将旧路线图完成声明降为历史 evidence，不再作为 current 验收。

### S1：Canonical history builder

- [ ] 从 rollout 解析 persisted `RolloutItem`，建立 turn boundary 与稳定 item identity。
- [ ] 覆盖 message、reasoning、command、file change、MCP、dynamic tool、web search、plan、
      approval、image、context compaction、review 与 collab activity。
- [ ] 直接写入 canonical Thread / Turn / Item；未知新事件 fail-closed 并计入 preview。
- [ ] 删除 imported runtime draft、synthetic tool lifecycle 与 materialized window。

### S2：续聊与工具执行

- [ ] 导入 session 恢复 cwd、workspace roots 与必要的 model-visible history。
- [ ] 新 turn 只使用 Lime 当前 provider/model/approval/sandbox 选择。
- [ ] provider 发出 `exec_command`、`apply_patch`、MCP、`request_user_input` 时，走与普通
      session 相同的 `CurrentTurnToolExecutor`。
- [ ] 历史 command/tool 永不再次执行，并有负向测试。
- [ ] 同一 provider fixture 分别从普通 session 与导入 session 发起相同工具调用，canonical
      Item、审批、sandbox、输出和终态除 provenance 外一致。

### S3：GUI 单轨

- [ ] 删除 imported-only command/tool group、标题和展开策略。
- [ ] 历史 command 显示命令、cwd、输出、exit code、duration；工具显示 name、arguments、
      output、status，遵循普通 Item 的折叠规则。
- [ ] 来源与导入时间只出现在会话详情/诊断，不进入消息主线。
- [ ] 五语言同步删除过时的 imported command 文案与正向断言。

### S4：验证与删除证明

- [ ] Rust golden corpus 覆盖当前 Codex rollout 版本与 archived / compressed rollout。
- [ ] 导入同一 source 幂等；替换导入不残留旧 ThreadStore / ProjectionStore 数据。
- [ ] Gate B 真实 Electron：scan -> preview -> commit -> read -> 输入 follow-up。
- [ ] runtime provider fixture：follow-up 触发真实 shell/tool，断言输出、终态和审批。
- [ ] 大样本、多视口、控制台错误、bridge trace 与 source leak 审计。
- [ ] `test:contracts`、`governance:legacy-report`、`verify:gui-smoke` 通过。

## 完成定义

只有同时满足以下条件才能标记完成：

1. 仓库不存在 imported-only tool lifecycle producer/consumer。
2. 导入历史与实时历史由同一 `ThreadItem` schema、read model 和 GUI renderer 消费。
3. 真实 Electron 导入可见，导入后真实 provider tool loop 可执行 command/tool。
4. 历史工具零重放，source 目录零写入，生产零 mock fallback。
5. current / deprecated / dead 守卫、架构确认、定向测试和 Gate B evidence 齐全。

执行进度见 [implementation-tracker.md](implementation-tracker.md)，产品边界见
[prd.md](prd.md)，验收矩阵见 [fidelity-acceptance-matrix.md](fidelity-acceptance-matrix.md)。
