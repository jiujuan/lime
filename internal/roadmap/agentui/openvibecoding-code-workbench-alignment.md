# OpenVibeCoding 编程工作台对齐计划

> 状态：P1/P2/P3/P4 current 编程工作台已收敛；旧 `CanvasWorkbenchOutputLead` 已判为 `dead` 并移除；仍需 GUI smoke / Playwright 证据收口
> 更新时间：2026-05-28
> 参考项目：`/Users/coso/Documents/dev/js/OpenVibeCoding`
> 关联入口：`internal/roadmap/agentui/README.md`

## 背景

当前 Lime 的编程工作台已经能进入 `code_orchestrated` 主链，也能展示文件写入、输出、快照和继续修复入口，但产品形态仍然是“把运行诊断、文件审阅、输出摘要、会话过程和预览揉在一起”。这会导致首屏杂乱、主任务不清楚，用户无法像在 OpenVibeCoding 编程模式里那样自然地完成“提出需求 -> 看实时结果 -> 继续修改 -> 查看文件/部署/日志”的闭环。

本计划把对齐目标从“补一个失败输出按钮”升级为“重构编程工作台信息架构”。不新增第二套 runtime，不新增 Tauri 命令，不复制 OpenVibeCoding 的黑色皮肤或 CloudBase 专有能力，只复用其可验证的编程模式骨架。

## 目标用户与用户闭环

目标用户是用自然语言让 Lime 创建或修改网页 / 小工具 / 代码项目的普通工程用户。

闭环从用户发送一个编程请求开始，到用户在主画布看到可读预览、在右侧继续对话、必要时打开文件 / 输出 / 快照并发起修复为止。

完成标准不是“诊断卡都显示出来”，而是用户打开工作台后 5 秒内知道当前结果在哪里、下一步该点哪里、失败时如何继续修复。

## OpenVibeCoding 可借鉴结构

1. **主预览优先**：`task-details.tsx` 的 coding mode 把中间主区域交给 Preview，顶部只有浏览器式控制条、刷新、外部打开、Fix preview errors 和全屏。
2. **聊天独立成右栏**：`TaskChat` 保持右侧稳定列，只承载对话、部署产物 tab、任务进度和输入框，不和预览争夺中心。
3. **文件是可切换工作区，不是首屏噪声**：Files / Preview / Cloud 通过顶部切换互斥展示，文件浏览、搜索、tab 和 diff 在需要时出现。
4. **任务进度压缩展示**：`TaskListPanel` 把 todo / task 工具调用压成一条可折叠进度条，不把每个工具步骤摊成首屏卡片。
5. **失败修复靠预览/输出上下文触发**：Fix preview errors 把错误摘要组织成后续对话，而不是另起一套执行入口。

## Lime 目标信息架构

```text
Lime 编程工作台
  左侧：Lime 全局导航，保持现状
  中央：编程主画布
    顶部：预览 / 文件 / 变更 / 输出 / 日志 的轻量标签
    默认：预览优先；没有可预览 HTML 时展示选中文件正文
    操作：刷新预览、系统打开、复制路径、修复失败、全屏
  右侧：对话与任务栏
    顶部：聊天 / 交付物 两个 tab
    中部：消息流
    下方：可折叠任务进度条
    底部：输入框和停止 / 发送
  诊断抽屉：权限、runtime、inventory、evidence、replay
```

## 首屏规则

首屏保留：

- 当前主对象：项目 / session / 正在处理的文件或预览。
- 当前阶段：生成中、等待确认、可预览、失败待修复、变更待审阅。
- 主操作：继续对话、查看预览、修复失败、审阅变更。
- 必要状态：任务进度、最近失败输出、当前文件路径。

首屏默认收纳：

- Runtime inventory、catalog、registry、extension、MCP 工具库存。
- Evidence pack、handoff bundle、replay sample、external analysis handoff。
- Browser Assist / LimeCore policy / completion audit 细节。
- 大段绝对路径、raw JSON、工具 schema、内部 command 名。

这些信息不能删除，但必须进入显式“诊断 / 证据”抽屉，不能继续占据编程工作台默认视图。

## 分阶段实施

### P0：冻结旧叠卡方向

状态：已建立约束，后续不再把编程主体验继续堆到诊断卡中心。

目标：停止在 `WorkspaceHarnessDialogs` 和 `CodeReviewSummaryPanel` 上继续堆首屏 UI。

动作：

- 将当前 `CodeWorkbenchGuide` / `CodeReviewSummaryPanel` 降级为右侧任务进度与失败入口的数据来源，不再作为中心体验。
- 记录 `HarnessStatusPanel` 默认首屏只进诊断抽屉，不再和编程预览同级竞争。
- 保留现有 `code_orchestrated`、file checkpoint、output signal 和 `harness.code_fix.source=failed_output` metadata，不改协议。

验收：

- 编程任务默认首屏不出现多组 runtime 诊断卡。
- 失败输出仍能生成继续修复 prompt。

### P1：编程工作台壳层

状态：已落地到 `CanvasWorkbenchLayout` 的 `coding` 模式，并由 `code_orchestrated` scene runtime 自动启用。

目标：把 Lime 编程模式改成稳定的“中央主画布 + 右侧对话”结构。

动作：

- 在 `CanvasWorkbenchLayout` 或其上层 scene runtime 引入 `codingWorkbench` 模式。
- 默认落在“预览”标签；如果没有可预览 HTML，则落在“文件”标签并展示当前主文件。
- 顶部标签固定为：`预览 / 文件 / 变更 / 输出 / 日志`，其中无数据的标签禁用或弱化，不再动态堆一排文件标签抢主导航。
- 右侧对话保留原输入框能力，任务进度压缩成类似 OpenVibeCoding `TaskListPanel` 的可折叠条。

验收：

- 用户截图中的网页生成场景，中央区域应优先展示网站预览，而不是裸 HTML 正文。
- 用户能在同一屏继续发送修改要求。
- 文件、输出、变更入口存在，但默认不压过预览。

2026-05-27 进展：

- `CanvasWorkbenchLayout` 新增 `workbenchMode="coding"`，固定顶栏为 `预览 / 文件 / 变更 / 输出 / 日志`。
- `code_orchestrated` runtime 自动传入 coding 模式；非编程场景保持原默认模式。
- coding 模式默认停在 `预览`，打开文件树中的文件后仍回到预览，不再把每个文件挤成全局顶部标签。
- 输出 / 日志入口消费现有 session/thread projection，不新增 runtime 命令或平行事实源。

### P2：预览能力对齐

状态：已完成静态 HTML 预览接入；浏览器式控制条、全屏、dev server / HMR 仍待后续评估。

目标：把 HTML / 静态网页从“源码预览”升级为“可视预览优先”。

动作：

- 复用现有 `workspaceFilePreview.ts` 的 HTML 类型判断，HTML 文件在编程工作台默认进入 iframe / srcdoc 预览。
- 对本地文件型预览提供浏览器式控制条：刷新、复制路径、系统打开、全屏。
- 没有 dev server 时先支持静态 HTML srcdoc；后续再评估 dev server / HMR，不在本轮新增 runtime 命令。
- 预览加载态使用结构化 skeleton，不使用大片空白或诊断说明。

验收：

- `index.html` 类任务默认看到网页结果。
- 用户可一键切到源码和变更。
- 失败时主操作是“继续修复”，不是让用户找工具输出。

2026-05-27 进展：

- HTML / HTM 选择会在预览标签显示 `HTML` badge，并复用现有 `GeneralCanvasPanel` 的 iframe / srcdoc 静态预览能力。
- 预览底部只保留轻量静态 HTML 提示；源码和项目树进入 `文件` 标签，避免首屏混排。
- 头部复制路径、定位、系统打开、下载等动作保持原工作台能力，并完成五语言本地化。

### P3：文件与变更工作区

状态：已落地当前主链展示。文件树已成为独立标签，变更标签已聚合本轮 `file_artifact`、Harness 写入事件、最近文件事件和快照摘要；接受 / 回退执行闭环仍待后续按真实 checkpoint restore 主链迭代。

目标：文件树、打开文件、diff、快照回滚形成独立工作区。

动作：

- 文件 tab 下展示项目文件树和打开文件列表，不再把所有文件标签挤在全局顶栏。
- 变更 tab 下聚合本轮写入 / 编辑文件，先展示 runtime 已有的写入中 / 已写入 / 失败状态，不提前引入接受 / 回退假状态。
- 快照 diff 和恢复仍复用现有 `agent_runtime_list_file_checkpoints` / `diff` / `restore` 主链。

验收：

- 多文件任务不会让顶部标签爆炸。
- 变更审阅不再混在聊天正文和诊断面板里。

2026-05-27 进展：

- `code_orchestrated` 工作台的 `变更` 标签现在只消费 current thread projection 的 `file_artifact` 与 `threadRead.file_checkpoint_summary`，不再把 Harness active writes / recent events 拼进工作台变更事实源。
- 变更队列只展示 runtime 文件写入状态 `completed / in_progress / failed` 与 checkpoint 摘要；Harness 文件审阅态继续留在独立 Harness 面板，不回流到 coding workbench。
- 点击变更文件复用现有工作台打开文件能力；详情区优先展示该文件 diff，没有上一版时展示文件摘要和快照 badge，不新增 runtime 命令。

### P4：输出、日志与修复循环

状态：部分落地。输出 / 日志已成为固定标签入口，失败 badge 可标红；`CodeReviewSummaryPanel` 已作为中心输出 lead，失败输出可直接回到当前 `code_orchestrated` session 继续修复；预览错误 banner 与更完整的浏览器预览错误聚合仍待产品化。

目标：失败输出和预览错误成为清晰的修复循环。

动作：

- 输出 tab 展示最近 test / bash / build output，失败优先。
- 预览区出现失败 banner 时，按钮直接生成结构化修复 prompt。
- 修复 prompt 继续经 `agent_runtime_submit_turn` 到同一 `code_orchestrated` session，不新增平行命令。
- 成功输出只保留轻量状态，不默认铺开日志。

验收：

- 测试失败、构建失败、预览错误三类都能从同一“继续修复”路径进入下一轮。
- 修复后预览 / 输出 / 变更状态同步更新。

2026-05-27 进展：

- 中央输出 lead 已收敛为 `CodeReviewSummaryPanel`：统一消费 current `HarnessSessionState` 的输出、文件事件和 checkpoint summary，不再保留旧 `CanvasWorkbenchOutputLead` 平行入口。
- “继续修复”仍经上层 `onSubmitCodeFixPrompt` 回到 `code_orchestrated` session，并带 `requestMetadata.harness.code_fix.source=failed_output`，不新增平行命令。
- 旧输出 lead 文件与 thread-item 本地 prompt helper 已删除，避免 current UI 与旧摘要入口并存。

2026-05-28 进展：

- `useWorkspaceConversationSceneRuntime` 的输出 lead 已统一为函数式 `CodeReviewSummaryPanel`，通过 `CanvasWorkbenchLayout` 的 `openTab` 在输出 / 变更 / 日志之间跳转，不再从 workspace runtime 直接拼旧失败输出卡。
- `CanvasWorkbenchLayout` 的变更条目增加审阅态展示：`pending_review / applied / rejected` 继续复用五语言 key，并在输出摘要中按 current 变更队列汇总待处理数量。
- `AgentChatWorkspace` 向 scene runtime 透传当前 `HarnessSessionState` 与 `onSubmitCodeFixPrompt`，失败修复继续回到同一个 `code_orchestrated` session；测试环境没有上层 harness 时，runtime hook 才从 current thread items 派生临时展示态。
- 旧 `CanvasWorkbenchOutputLead` 文件、`buildCodeFixSignalFromThreadItems` helper、`failedLeadTitle / failedLeadFiles` 五语言 key 已删除；`buildCodeFixPromptFromHarnessSignal` 只保留在 `CodeReviewSummaryPanel` current 修复入口中。
- 定向验证已通过：`CodeReviewSummaryPanel.test.tsx`、`useWorkspaceConversationSceneRuntime.test.ts`、`CanvasWorkbenchLayout.test.tsx`、`tsc --noEmit`、`i18n:scan`、`i18n:check`、`i18n:unused -- --check`。

## 设计规则

- 页面类型：流程贯穿式复杂工作台，不是卡片工作台，也不是诊断面板。
- 主对象：当前编程 session 与当前项目文件。
- 当前阶段：生成中、可预览、失败待修复、变更待审阅。
- 下一步动作：继续对话、修复失败、审阅变更、打开文件。
- 默认视觉：明亮、实体表面、低噪声，继承 Lime 左侧栏和浅青绿选中态。
- 禁止项：不要暗黑复刻 OpenVibeCoding，不要把所有 runtime 诊断放首屏，不要新增第二套命令协议，不要让文件标签无限挤占顶部栏。

## 验证门槛

每个阶段至少执行：

```bash
npm exec vitest run "src/components/agent/chat/components/CanvasWorkbenchLayout.test.tsx"
npm exec vitest run "src/components/agent/chat/workspace/WorkspaceHarnessDialogs.test.tsx"
npm run typecheck
npm run i18n:check
npm run i18n:unused -- --check
```

涉及 GUI 主路径后必须执行：

```bash
npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000
```

用户可见文案必须覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。如果全量 `verify:local` 被并行工作区的硬编码扫描阻塞，必须同时给出本轮文件级 `i18n:scan` 结果和全量失败边界。

## 当前决策

- 继续使用 `code_orchestrated` current runtime。
- 继续使用现有 file checkpoint / output signal / Harness facts。
- 先做静态 HTML 可视预览和信息架构收口，再评估 dev server / HMR。
- 诊断能力不删除，但默认从首屏移入显式诊断入口。

## 下一刀

1. 先补 GUI smoke / Playwright 证据：确认 `code_orchestrated` 编程工作台首屏仍默认预览优先，输出 lead 可打开输出 / 变更 / 日志，并且继续修复会回到同一会话。
2. P4 后续：把预览错误 banner 接入同一个“继续修复”入口，仍经 `agent_runtime_submit_turn` 回到当前 `code_orchestrated` session。
3. P3 后续：按真实需求补接受 / 回退审阅闭环，并复用现有 checkpoint diff / restore 主链，不提前新增工作台私有协议。
