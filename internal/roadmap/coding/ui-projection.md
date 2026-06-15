# Coding Workbench UI 投影

> 状态：active
> 更新时间：2026-06-15

## 固定原则

Coding Workbench 是 AgentUI projection 的产品表面，不是 runtime owner。

```text
RuntimeEvent + ThreadReadModel + TaskSnapshot + ArtifactSummary + EvidenceSummary
  -> AgentUI ProjectionState
  -> Coding Workbench
```

除 `ui` 子树外，所有可见状态都必须能从 runtime facts 重建。`ui` 只允许保存本地折叠、选中 tab、滚动位置、草稿输入和 focus。

## 信息架构

```text
Coding Workbench
  中央主画布
    tabs: 预览 / 文件 / 变更 / 输出 / 日志
    action: 刷新预览 / 系统打开 / 复制路径 / 修复失败 / 全屏
  右侧对话
    messages
    task progress
    action required
    composer
  诊断抽屉
    runtime capability
    provider readiness
    policy / sandbox
    evidence / replay
    raw diagnostics refs
```

首屏优先级：

1. 当前主对象：预览、主文件或变更集。
2. 当前阶段：生成中、等待审批、可预览、测试失败、变更待审阅。
3. 下一步动作：继续对话、审批、修复失败、查看变更、打开证据。
4. 轻量进度：正在执行的工具、最近输出、失败摘要。

Runtime inventory、raw JSON、完整 schema、内部命令名、evidence 细节默认进入诊断抽屉。

## 产品布局标准

Coding Workbench 是复杂工作台，不是聊天页附带一个文件卡片。首屏必须有稳定主对象和阶段状态：

```text
顶部对象带
  项目 / workspace / branch / 当前 turn 状态 / provider readiness / policy summary

主体
  左或中央：主任务画布
    预览 / 文件 / 变更 / 输出 / 日志 tabs
  右侧：对话与行动
    消息 / 当前步骤 / 审批 / 输入框 / 停止或继续

抽屉
  运行明细 / 诊断 / evidence / replay / raw refs
```

视觉规则：

- 主背景保持明亮、克制，工作台主体用实体底色和清晰边框，不使用半透明主表面。
- 不做营销 hero，不在工作台中放大段解释性文案。
- 主操作每个阶段只保留一个：等待审批时是审批/拒绝，失败时是继续修复，完成后是查看变更或预览。
- 技术词只在诊断抽屉出现；主流程用“查看变更 / 继续修复 / 运行测试 / 打开预览”等动作词。
- 中央画布宽度优先，右侧对话不遮挡预览和 diff。

## ProjectionState 扩展视图

Coding UI 不需要新增 runtime truth，但可以从标准 state 派生 coding view model。

```ts
interface CodingWorkbenchView {
  runtime: RuntimeStatusView;
  mainObject: CodingMainObjectView;
  files: CodingFileView[];
  changes: FileChangeView[];
  patches: PatchView[];
  changeSummary?: ChangeSummaryView;
  commands: CommandOutputView[];
  tests: TestRunView[];
  actions: ActionRequiredView[];
  artifacts: ArtifactRefView[];
  evidence: EvidenceRefView[];
  diagnostics: DiagnosticView[];
  ui: CodingLocalUiState;
}
```

这些对象都是 projection 派生，不写回 runtime。

## Surface 到 ViewModel 映射

| Surface    | ViewModel 输入                                | 本地 UI 可保存               | 禁止                                 |
| ---------- | --------------------------------------------- | ---------------------------- | ------------------------------------ |
| 顶部对象带 | `runtime`、diagnostics、provider/policy facts | 诊断抽屉开关                 | 直接读取 Provider key。              |
| 预览       | `artifacts`、preview diagnostics              | selected preview tab、zoom   | React 组件启动 server 或读文件系统。 |
| 文件       | `files`、artifact refs、checkpoint refs       | open file id、scroll         | 从正文解析文件路径。                 |
| 变更       | `changes`、`patches`、`changeSummary`         | selected diff、collapse      | 从 assistant summary 推断 diff。     |
| 输出       | `commands`、`tests`、output refs              | output filter、scroll follow | 从输出文本猜测试状态。               |
| 日志       | `diagnostics`、timeline refs                  | log level filter             | 把 raw secret payload 展示给用户。   |
| 审批       | `actions`                                     | focus/collapse               | 乐观写 approval state。              |
| 继续修复   | failed command/test/patch ids + refs          | draft input                  | 无结构化 id 时拼正文 prompt。        |

当前工程落点：

| View                                | 当前 owner                                                                          | 状态                                                                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CodingWorkbenchView`               | `packages/agent-runtime-projection/src/coding.ts`                                   | current selector，持续补全。                                                                                                                                               |
| `CanvasWorkbenchLayout` coding mode | `src/components/agent/chat/components/CanvasWorkbenchLayout.tsx`                    | compat/current UI surface，负责渲染，不负责解释 facts。                                                                                                                    |
| read model projection adapter       | `workspaceConversationWorkbenchViewModel.ts` / `codingSessionOverviewProjection.ts` | current `threadRead` 进入 selector；session overview 从 `CodingWorkbenchView` 生成中性 activity items。旧 thread item adapter 已删除，不再承接 command/test/action truth。 |
| output projection panel             | `CodingWorkbenchOutputPanel.tsx`                                                    | current UI slice，直接渲染 `CodingWorkbenchView.commands/tests/actions/diagnostics`；旧 output thread item 面板不再作为产品输出状态来源。                                  |
| conformance replay                  | `packages/agent-runtime-projection/src/fixtureReplay.ts`                            | current guard，检查 `expected.coding`。                                                                                                                                    |

## Runtime facts 到 UI

| Runtime facts                             | Coding UI                                |
| ----------------------------------------- | ---------------------------------------- |
| `turn.submitted/started/completed/failed` | 顶部状态、任务进度、右侧消息节奏。       |
| `model.delta/completed`                   | 对话消息和最终说明。                     |
| `reasoning.summary/plan.*`                | 可折叠计划和过程摘要。                   |
| `tool.started/progress/result/failed`     | 工具 timeline 和当前活动提示。           |
| `file.changed`                            | 变更 tab、文件 badge、checkpoint 入口、变更摘要。 |
| `patch.started/applied/failed`            | patch viewer、失败原因、继续修复入口、变更摘要。  |
| `command.started/output/exited`           | 输出 / 日志 tab。                        |
| `test.started/completed`                  | 测试状态、失败摘要、修复 prompt 上下文。 |
| `action.required/resolved`                | 审批卡、等待态、resolved 后状态清理。    |
| `permission.denied/sandbox.blocked`       | 阻断卡和可恢复动作。                     |
| `artifact.changed`                        | Artifact 引用和打开 owner surface。      |
| `evidence.exported`                       | Evidence lane 和导出入口。               |
| `snapshot.updated/history.compacted`      | hydration repair 和 stale 清理。         |

## 旧 UI 迁移规则

现有 coding UI 已有预览 / 文件 / 变更 / 输出 / 日志结构，可以保留壳层，但必须按下面规则迁移：

1. `file_artifact`、`command_execution`、`approval_request`、`turn_summary` 等旧 thread item 只能留在历史测试 / fixture / 已删除适配器证据里，不得再作为 production migration adapter 输入。
2. 历史 hydrate 若仍需迁移，必须在 App Server / read model 边界输出标准 facts：`file.changed`、`command.started/exited`、`patch.started/applied/failed`、`test.started/completed`、`action.required/resolved`。
3. Coding Workbench 的 `changeView / outputView / logView / actionView / diagnosticsView` 必须从 `CodingWorkbenchView` 派生。
4. React 组件内只允许保存选中 tab、展开状态、滚动和 focus；不得再维护 command/test/patch 状态机。
5. 当 App Server 已能直接输出 coding RuntimeEvent / read model facts 后，thread item adapter 必须删除；恢复视为旧路回流。

迁移顺序：

1. `changeView` 从 `CodingWorkbenchView.changes/patches/files/changeSummary` 派生（已接入）。
2. `commands/tests/actions` 从 RuntimeEvent 与 App Server `thread_read.commands/tests/pending_requests` 双路径合并（已接入 selector 与 Workspace adapter）。
3. `outputView` 从 `commands/tests/actions/diagnostics` 派生（已接入输出 tab 内容和计数）。
4. `logView` 从 timeline/diagnostics refs 派生。
5. `actionView` 从 `actions` 派生，并接 `agentSession/action/respond`。
6. `diagnosticsView` 从 runtime/provider/policy/evidence diagnostics 派生。
7. 删除旧 thread item direct reader；只允许历史 fixture / 负向守卫证明旧路未回流。

任何一步都不能让旧路径继续新增业务逻辑；如果当前 App Server fact 不足，应先补 RuntimeEvent，而不是在 React 层猜。

## 必需 UI 状态

| 状态                 | 触发                                | UI 要求                                   |
| -------------------- | ----------------------------------- | ----------------------------------------- |
| `running`            | active turn/tool/test               | 显示当前工具和可停止动作。                |
| `waiting_action`     | pending `action.required`           | 审批卡固定可见，不藏进日志。              |
| `blocked`            | permission/sandbox/provider blocked | 显示原因和 owner，不伪装成失败回答。      |
| `failed_recoverable` | command/test/patch failed           | 主操作为继续修复。                        |
| `changes_ready`      | file/patch artifacts available      | 变更 tab 可见，支持打开 diff/checkpoint。 |
| `preview_ready`      | preview artifact available          | 默认停在预览。                            |
| `stale`              | sequence gap / hydration issue      | 标记修复中或需重读 read model。           |

状态优先级：

1. `blocked` 高于 `failed_recoverable`。
2. `waiting_action` 高于 `running`。
3. `failed_recoverable` 高于 `changes_ready`。
4. `preview_ready` 只决定默认 tab，不覆盖失败或审批主动作。
5. `stale` 必须以轻量 banner 或诊断提示出现，不能隐藏执行状态。

## 禁止事项

- 从 assistant 文本解析文件名来判断真实变更。
- 从工具输出文本猜测测试是否通过。
- 把审批按钮状态写进 React 本地 state 后绕过 `action.respond`。
- 把完整文件 bytes 或 secret-bearing raw payload 放进 projection。
- 在产品应用内再维护一套 command/test/patch 状态机。
- 让 mock fixture 在生产路径被自动 fallback。

## Tabs 规则

| Tab  | 内容                                                | 默认显示条件                             |
| ---- | --------------------------------------------------- | ---------------------------------------- |
| 预览 | HTML/app preview、artifact preview、预览错误 banner | 有可预览 artifact 时默认。               |
| 文件 | 项目文件树、打开文件、只读源码预览                  | 无预览但有主文件时默认。                 |
| 变更 | 本轮 file changes、patches、checkpoints、diff       | 有 `file.changed` / patch facts 时启用。 |
| 输出 | 命令和测试输出，失败优先                            | 有 command/test facts 时启用。           |
| 日志 | 低层工具过程、diagnostics refs                      | 默认收起，显式查看。                     |

无数据 tab 不删除，只降级为 disabled/empty，避免运行中布局跳动。

默认 tab 决策：

| 条件                              | 默认 tab                                      |
| --------------------------------- | --------------------------------------------- |
| 有 pending action                 | 右侧 action card 聚焦，中央保持当前 tab。     |
| 有 patch/test/command failed      | 输出或变更，取决于失败来源。                  |
| 有 preview artifact 且无阻塞/失败 | 预览。                                        |
| 无预览但有 changed files          | 变更。                                        |
| 无变更但有主文件                  | 文件。                                        |
| 只有文本回复                      | 对话保持主焦点，中央显示空态或日志 disabled。 |

空态必须说明下一步动作，但不能长篇解释实现机制。

## 继续修复入口

继续修复必须基于结构化 facts 构造上下文：

- 失败的 `command/test/patch` id。
- 相关 file/artifact/checkpoint refs。
- 最近失败摘要 ref。
- 当前 thread/turn/task ids。

继续修复仍走同一 `agentSession/turn/start` 或 queue/steer 语义，不创建新 runtime、不新增专用命令。

继续修复上下文结构：

```ts
interface CodingWorkbenchRecoveryContext {
  schemaVersion: "coding-workbench-recovery/v1";
  failureKind: "command" | "test" | "patch" | "diagnostic";
  sourceIds: {
    toolCallId?: string;
    commandId?: string;
    testRunId?: string;
    patchId?: string;
    actionId?: string;
  };
  refs: {
    outputRefs?: string[];
    diffRef?: string;
    artifactRefs?: string[];
    evidenceRefs?: string[];
    checkpointRef?: string;
    sourceEventIds?: string[];
  };
  relatedFiles: string[];
  latestCheckpointPath?: string;
  signals: Array<{
    kind: "command" | "test" | "patch" | "diagnostic";
    id: string;
    title: string;
    summary?: string;
    preview?: string;
    sourceIds?: {
      toolCallId?: string;
      commandId?: string;
      testRunId?: string;
      patchId?: string;
      actionId?: string;
    };
    refs?: {
      outputRefs?: string[];
      diffRef?: string;
      artifactRefs?: string[];
      evidenceRefs?: string[];
      checkpointRef?: string;
      sourceEventIds?: string[];
    };
  }>;
}
```

UI 可以把这段结构交给 request builder，但不能把它本地序列化成 assistant 文本后绕过 runtime。

## 本地化要求

所有用户可见文案必须进入 current i18n 资源：

| 文案类别       | 示例                             | 要求                                           |
| -------------- | -------------------------------- | ---------------------------------------------- |
| tab label      | 预览、文件、变更、输出、日志     | 五语言资源。                                   |
| 状态           | 等待审批、被权限阻断、测试失败   | 五语言资源，状态 enum 不翻译。                 |
| 主按钮         | 继续修复、查看变更、运行测试     | 五语言资源。                                   |
| 空态           | 暂无变更、等待输出               | 五语言资源，说明下一步。                       |
| 错误 / blocked | 沙箱阻断、Provider 未配置        | 五语言资源 + diagnostics ref。                 |
| 导出 / copy    | evidence、prompt、artifact title | Rust / App Server 导出走 locale copy service。 |

不得只写中文或英文兜底；确需临时例外时必须回到实施计划登记退出条件。

## 响应式与稳定尺寸

| 区域       | 桌面                            | 窄屏                                |
| ---------- | ------------------------------- | ----------------------------------- |
| 顶部对象带 | 一行摘要 + 状态 badges          | 两行内换行，按钮不挤压项目名。      |
| 主画布     | 中央优先，右侧对话固定宽度      | tabs 占满宽，右侧对话下沉或抽屉化。 |
| tabs       | 固定高度，disabled 不移除       | 可横向滚动或紧凑标签。              |
| 输出       | 等宽字体，长行 wrap/scroll 可控 | 默认 wrap，保留复制入口。           |
| 审批卡     | 右侧固定可见                    | 顶部 sticky 或底部 action sheet。   |

文本不得溢出按钮或 badge；动态输出不能改变 toolbar 高度。

## GUI smoke 场景

Coding Workbench GUI smoke 至少覆盖：

1. 提交一个 coding fixture turn，主画布打开。
2. `file.changed` 出现在变更 tab，点击能看到路径 / diff / checkpoint。
3. `command.output` 和 `command.exited` 出现在输出 tab。
4. `action.required` 显示审批卡，刷新后仍 pending。
5. `sandbox.blocked` 显示 blocked 状态，不变成普通失败文本。
6. `test.completed failed` 显示继续修复入口，继续修复携带结构化 ids。
7. hydration repair 后不重复追加输出，不丢失 active/terminal 状态。

## 验收

最小 UI 验收：

1. 纯文本 coding turn 正常渲染。
2. 文件变更出现在变更 tab，不靠正文。
3. 命令输出出现在输出 tab，失败有继续修复。
4. 审批 pending 时刷新页面仍可恢复。
5. sandbox blocked 显示为 blocked，不当成模型失败。
6. 预览、文件、变更、输出、日志之间切换不改变 runtime facts。

全量 UI 验收：

1. 六类 conformance fixture 全部可投影到 Coding Workbench。
2. 真实 App Server fixture turn 可打开工作台，显示文件变更、命令输出、测试状态和审批。
3. 刷新 / hydrate 后 pending action、failed command、blocked sandbox 保持一致。
4. 继续修复使用结构化 ids 和 refs 构造 turn metadata。
5. GUI smoke 覆盖提交编程需求、查看变更、查看输出、处理审批、失败后继续。
6. 五语言文案覆盖新增 presentation copy。
7. 诊断抽屉能解释 provider、policy、sandbox、evidence，不压过主流程。
