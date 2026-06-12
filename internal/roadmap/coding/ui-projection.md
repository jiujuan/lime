# Coding Workbench UI 投影

> 状态：draft
> 更新时间：2026-06-12

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

## ProjectionState 扩展视图

Coding UI 不需要新增 runtime truth，但可以从标准 state 派生 coding view model。

```ts
interface CodingWorkbenchView {
  runtime: RuntimeStatusView;
  mainObject: CodingMainObjectView;
  files: CodingFileView[];
  changes: FileChangeView[];
  patches: PatchView[];
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

## Runtime facts 到 UI

| Runtime facts | Coding UI |
| --- | --- |
| `turn.submitted/started/completed/failed` | 顶部状态、任务进度、右侧消息节奏。 |
| `model.delta/completed` | 对话消息和最终说明。 |
| `reasoning.summary/plan.*` | 可折叠计划和过程摘要。 |
| `tool.started/progress/result/failed` | 工具 timeline 和当前活动提示。 |
| `file.changed` | 变更 tab、文件 badge、checkpoint 入口。 |
| `patch.started/applied/failed` | patch viewer、失败原因、继续修复入口。 |
| `command.started/output/exited` | 输出 / 日志 tab。 |
| `test.started/completed` | 测试状态、失败摘要、修复 prompt 上下文。 |
| `action.required/resolved` | 审批卡、等待态、resolved 后状态清理。 |
| `permission.denied/sandbox.blocked` | 阻断卡和可恢复动作。 |
| `artifact.changed` | Artifact 引用和打开 owner surface。 |
| `evidence.exported` | Evidence lane 和导出入口。 |
| `snapshot.updated/history.compacted` | hydration repair 和 stale 清理。 |

## 必需 UI 状态

| 状态 | 触发 | UI 要求 |
| --- | --- | --- |
| `running` | active turn/tool/test | 显示当前工具和可停止动作。 |
| `waiting_action` | pending `action.required` | 审批卡固定可见，不藏进日志。 |
| `blocked` | permission/sandbox/provider blocked | 显示原因和 owner，不伪装成失败回答。 |
| `failed_recoverable` | command/test/patch failed | 主操作为继续修复。 |
| `changes_ready` | file/patch artifacts available | 变更 tab 可见，支持打开 diff/checkpoint。 |
| `preview_ready` | preview artifact available | 默认停在预览。 |
| `stale` | sequence gap / hydration issue | 标记修复中或需重读 read model。 |

## 禁止事项

- 从 assistant 文本解析文件名来判断真实变更。
- 从工具输出文本猜测测试是否通过。
- 把审批按钮状态写进 React 本地 state 后绕过 `action.respond`。
- 把完整文件 bytes 或 secret-bearing raw payload 放进 projection。
- 在产品应用内再维护一套 command/test/patch 状态机。
- 让 mock fixture 在生产路径被自动 fallback。

## Tabs 规则

| Tab | 内容 | 默认显示条件 |
| --- | --- | --- |
| 预览 | HTML/app preview、artifact preview、预览错误 banner | 有可预览 artifact 时默认。 |
| 文件 | 项目文件树、打开文件、只读源码预览 | 无预览但有主文件时默认。 |
| 变更 | 本轮 file changes、patches、checkpoints、diff | 有 `file.changed` / patch facts 时启用。 |
| 输出 | 命令和测试输出，失败优先 | 有 command/test facts 时启用。 |
| 日志 | 低层工具过程、diagnostics refs | 默认收起，显式查看。 |

无数据 tab 不删除，只降级为 disabled/empty，避免运行中布局跳动。

## 继续修复入口

继续修复必须基于结构化 facts 构造上下文：

- 失败的 `command/test/patch` id。
- 相关 file/artifact/checkpoint refs。
- 最近失败摘要 ref。
- 当前 thread/turn/task ids。

继续修复仍走同一 `agentSession/turn/start` 或 queue/steer 语义，不创建新 runtime、不新增专用命令。

## 验收

最小 UI 验收：

1. 纯文本 coding turn 正常渲染。
2. 文件变更出现在变更 tab，不靠正文。
3. 命令输出出现在输出 tab，失败有继续修复。
4. 审批 pending 时刷新页面仍可恢复。
5. sandbox blocked 显示为 blocked，不当成模型失败。
6. 预览、文件、变更、输出、日志之间切换不改变 runtime facts。
