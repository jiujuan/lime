# Lime Artifacts Current 路线图

> 状态：current，Preview Artifact Contract 已进入导入历史与文件预览主链
> 更新时间：2026-06-18
> 主目标：Codex 导入对话、Lime 原生对话、任务结果、文件、图片、DOCX、HTML、URL、Agent App shell entry 等所有可打开对象，都通过统一预览合同进入右侧工作台或独立窗口；正式交付物继续由 `ArtifactDocument v1` 承接。

## 当前结论

Lime 不再采用“文件预览优先于 artifact”的双轨规则。

新的事实源划分固定为：

- `Preview Artifact Contract`：全局 UI 投影层，负责打开、选中、展示、独立窗口、系统打开、来源能力、临时生命周期。
- `ArtifactDocument v1`：正式交付物事实源，负责报告、PRD、方案、研究、对比、计划等可编辑、可版本化、可导出的长期文档。
- 业务事实源：文件、任务、URL、知识库、App Server session、Agent App runtime、数据库记录仍保留在各自 domain；preview artifact 只引用它们，不接管它们。

一句话：

**打开链路 artifact 化，业务事实源不 artifact 化。**

## 外部参考与取舍

本轮补充参考了 Context7、WebSearch 与本地 `/Users/coso/Documents/dev/js/ag-ui`。WebSearch 只采用官方 / 一手资料：

- AG-UI 的可借鉴点是事件与 UI 投影分离：`RUN_* / STEP_*` 管生命周期，`TEXT_MESSAGE_* / MESSAGES_SNAPSHOT` 管消息，`TOOL_CALL_*` 管工具，`STATE_SNAPSHOT / STATE_DELTA` 管状态，`CUSTOM / ACTIVITY_*` 承接展示扩展。Lime 吸收“snapshot + delta 可重建、UI projection 不抢业务事实源”的原则，不直接套 AG-UI wire format。参考：`https://docs.ag-ui.com/concepts/events` 与本地 `docs/ag_ui.md`。
- OpenAI Apps SDK 的可借鉴点是 `structuredContent` 与组件 `_meta` 分离：模型可见结构和组件渲染元数据不混写。Lime 对应为 `ArtifactDocument` 与 `PreviewArtifact.meta` 分层。参考：`https://developers.openai.com/apps-sdk/reference`、`https://developers.openai.com/apps-sdk/build/chatgpt-ui`。
- Vercel AI SDK / Generative UI 的可借鉴点是 message parts / tool parts 有明确生命周期，工具结果可以映射为专用组件，但组件不是持久业务状态本身。Lime 对应为不同 `contentKind / renderMode` 的 preview projection。参考：`https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message`、`https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data`。
- Claude Artifacts 的可借鉴点是“对话旁边的独立工作区、可查看/修改/复用的内容对象”。Lime 对应为右侧 Workbench 与必要时的 Electron 独立窗口。

## Current 事实源

前端 current：

- `src/lib/artifact/types.ts`：现有轻量 artifact 类型。
- `src/lib/artifact/previewArtifact.ts`：Preview Artifact Contract 的投影 helper。
- `src/components/agent/chat/workspace/useWorkspaceArtifactPreviewActions.ts`：Workspace 文件/产物点击统一打开入口。
- `src/components/agent/chat/AgentChatWorkspace.tsx`：消息附件、任务预览与 timeline 文件打开统一投影到 preview artifact / workbench selection。
- `src/components/agent/chat/components/canvas-workbench/CanvasWorkbenchPreviewModePanel.tsx`：workbench 内直接消费媒体 / system-open / unsupported preview artifact，不再把图片伪装成 Markdown/Code。
- `src/components/agent/chat/workspace/workbenchPreview.tsx`：右侧工作台预览入口。
- `src/components/artifact/*`：渲染器、媒体预览、不可内嵌 fallback、工具栏、HTML 独立窗口动作。

后端 current：

- `lime-rs/crates/services/src/file_browser_service.rs`：文件预览读取与文档文本投影。
- `lime-rs/crates/document-preview/`：DOCX、XLSX、PPTX 与可解析 PDF 文本流的文档预览抽取。
- App Server / RuntimeCore / services / agent crates：对话、任务、事件、artifact snapshot、evidence 的事实源。
- Electron Desktop Host：只承接本地桌面壳能力，如文件预览独立窗口、系统打开、Finder/Explorer 定位。

明确不是 current：

- `lime-rs/src/**`、旧 Tauri command wrapper、旧 `agent_runtime_*` 作为新增能力落点。
- 组件内直接散落 `WebviewWindow`、裸 `invoke` 或浏览器下载旁路。
- “真实文件直接画布、artifact 另走一套”的双轨预览策略。

## Preview Artifact Contract v1

Preview artifact 是普通 `Artifact` 的 source-backed 投影，`meta` 必须至少表达：

- `previewArtifact: true`
- `isSourceBacked: true`
- `source`: `file | artifact | task | knowledge | url | session_file | app | database_record`
- `sourceRef`: 稳定引用，优先使用路径、URL、task id 或 domain id
- `sourcePath` / `filePath` / `filename`
- `contentKind`: `text | markdown | code | html | image | document | audio | video | binary | app_shell | unsupported`
- `renderMode`: `inline | canvas | media | document_text | external_window | system_open | unsupported`
- `lifecycle: "transient"`，除非用户显式保存或 domain 明确要求持久化
- `capabilities`: `preview / edit / save / reveal / systemOpen / externalWindow` 等布尔能力

规则：

1. 用户点击任何可预览对象，都先投影为 preview artifact，再走 `openArtifactInWorkbench`。
2. `openArtifactInWorkbench` 是通用工作台的唯一 upsert 入口；文件、任务文件、LayeredDesign 与附件点击只负责构造 projection 并委托打开，避免同一 preview artifact 被写入两次。
3. workbench 打开必须同时携带稳定 selection key，例如 `artifact:<previewArtifact.id>`；只更新 `selectedArtifactId` 不足以证明右侧工作台已切换。
4. preview artifact 默认不写入正式消息产物历史，不污染 `ArtifactDocument` 版本。
5. 内容来自真实 source；编辑必须显式保存才写回 source。
6. HTML 允许在右侧 iframe 预览，也允许经 Electron Desktop Host 打开独立窗口。
7. DOCX 不再按 UTF-8 lossless 读取 ZIP 字节；必须先抽取可读文本。
8. 图片、音频、视频必须写入 `meta.previewUrl` 并由媒体 renderer 消费；不得把 `<img>` / `<audio>` / `<video>` HTML 字符串塞进 document renderer。
9. 只有可抽取出可读文本的文档才进入 `renderMode=document_text`；DOCX、XLSX、PPTX 与可解析 PDF 文本流优先走后端 `document-preview` 抽取。PDF 扫描件、复杂编码文本流、旧版 Office 二进制格式或抽取为空的文档仍保留同一 preview artifact，但必须退化为 `renderMode=system_open`，由统一 artifact 工具栏调起系统默认应用，而不是渲染空白正文。
10. 二进制不可内嵌时仍进入同一 preview artifact，renderMode 退化到 `system_open` 或 `unsupported`，并由 `ArtifactRenderer` 渲染明确兜底面，而不是消失、乱码或落回空内容文档。

## 与 ArtifactDocument v1 的边界

`ArtifactDocument v1` 只负责正式交付物：

- 报告、PRD、方案、研究、对比、路线图、执行摘要。
- block、source、version、rewrite、diff、export。
- 模型输出 schema、validator、repair、fallback。

它不负责：

- 普通文件列表里的图片/DOCX/HTML 预览。
- 任务 JSON 状态文件本身。
- URL 快照、Agent App shell window、数据库记录详情的业务事实。
- 所有 source-backed 临时打开行为。

如果 preview artifact 被用户“另存为正式文档”或 Agent 明确生成正式交付物，才升级为 `ArtifactDocument v1`。

## 实施阶段

### P0：文档与旧规则清理

- 清理 `internal/roadmap/artifacts/*` 中旧 `lime-rs/src/**` 落点。
- 更新 `internal/aiprompts/workspace.md`，删除“不得先合成 artifact”的旧规则。
- 写明 Preview Artifact Contract 与 ArtifactDocument 的边界。

### P1：全局 Preview Projection

- 新增 `src/lib/artifact/previewArtifact.ts`。
- Workspace 文件点击改成 source-backed preview artifact。
- 保留 `canvas:design` 等专用 artifact 主链。
- 补纯单元测试与 Workspace hook 回归。

### P2：文档与乱码修复

- 接入 `lime-rs/crates/document-preview`。
- `file_browser_service.read_file_preview` 对 DOCX / XLSX / PPTX / 可解析 PDF 返回 `document_text` 文本预览。
- Aster `ReadTool` 对 DOCX 走文档抽取，避免 `String::from_utf8_lossy` 读取 ZIP 乱码；PDF / Office 运行时工具读取继续按后续 Agent tool contract 扩展，不把文件预览能力误当成模型工具全文解析。

### P3：Electron 独立预览窗口迁移

- 新增 Electron Host current 命令 `open_file_preview_window`。
- 前端 `src/lib/api/fileSystem.ts` 只通过 `safeInvoke` 进入，不再动态导入 test-only `WebviewWindow`。
- 同步 IPC 白名单、host 测试、API 测试和契约检查。

### P4：全场景扩展

- 图片、音视频、URL、任务结果、知识库命中、Agent App shell entry、数据库记录详情全部补 projection。
- 对每类 source 明确 `contentKind / renderMode / capabilities`。
- 媒体类 preview artifact 已由 workbench renderer 消费 `contentKind / renderMode / previewUrl`；Codex 导入消息图片点击会生成 `source=session_file` 的 preview artifact，并通过 `previewOpenRequest.selectionKey` 精确打开右侧图片预览。
- PDF、Excel、PPT 等文档类 source 先由 App Server `readFilePreview` 尝试文本抽取；DOCX / XLSX / PPTX 与可解析 PDF 文本流成功时进入 `contentKind=document / renderMode=document_text`，抽取为空或不支持时进入 `contentKind=document / renderMode=system_open`；仍使用同一 preview artifact、同一 ArtifactToolbar、同一 `open_with_default_app` 桌面 current 命令。
- `ArtifactRenderer` 对 `renderMode=system_open/unsupported` 已新增 renderer-level fallback surface，展示文件名、来源路径、mime/error metadata；打开动作仍由外层 `ArtifactToolbar` 统一处理，避免第二套打开逻辑。
- URL、database_record 与 Agent App shell entry 不再伪装成普通文件或空文档；`source=url/database_record/app` 的 preview artifact 由 `PreviewSourceSummaryRenderer` 展示来源摘要，打开 URL 仍走 ArtifactToolbar 的 `open_external_url` current 通道，record / app 后续动作由对应业务工作台承接。
- 消息工具轨 WebSearch 搜索结果点击已接入同一 URL preview artifact 链路：`SearchResultPreviewList -> InlineToolProcessStep -> StreamingRenderer -> MessageList -> useWorkspaceConversationSceneRuntime -> AgentChatWorkspace` 透传 `onOpenUrlPreview`，由 Workspace 创建 `source=url` projection、写入 artifact store，并以 `selectionKey=artifact:<id>` 打开右侧来源摘要；组件独立复用时才 fallback 到系统浏览器。
- WebSearch 与 WebFetch 同组出现时，URL preview artifact 会复用已存在的 WebFetch 结构化正文作为 `source=url` 快照内容，并在 meta 标记 `urlSnapshotSource=web_fetch`；RSS/XML、timeout、HTTP 诊断等噪音不进入快照。该能力只复用已在对话中产生的工具结果，不新增 renderer 网络抓取器。
- GUI smoke 覆盖 Codex 导入对话打开文件、DOCX、HTML、图片和继续对话。

## 2026-06-17 实施记录

- Codex 导入用户消息附件已作为 `Message.images` 恢复，保留 `sourceUri / sourcePath / previewUrl / metadata / index`，不再只保留文本占位。
- 消息图片点击统一投影为 `source=session_file` 的 preview artifact；`contentKind=image`、`renderMode=media`、`previewUrl` 由 `ArtifactRenderer` 消费。
- 右侧 `CanvasWorkbenchLayout` 新增 `previewOpenRequest.selectionKey`，用于把 workbench 文档选择精确切到 `artifact:<id>`；这修复了只选中 artifact store 但 workbench 仍显示“审查/输出/日志”的问题。
- `CanvasWorkbenchPreviewModePanel` 对 `renderMode=media/system_open/unsupported` 的 preview artifact 直接委托 `ArtifactRenderer`，普通 Markdown/Code artifact 仍走原 workbench 文档预览模式。
- 通用工作台文件、占位任务文件、LayeredDesign 与懒加载 artifact 统一由 `openArtifactInWorkbench` 写入 artifact store，避免先 upsert projection 再打开导致同一预览被写入两次。
- 顶部标签口径收敛为“审查 / 真实文件 / 新建工具入口”：`Markdown / HTML / Code` 只作为预览模式控制，不作为顶层标签；真实文件名可作为当前文档 tab 展示。
- 已按 Context7 与本地 `/Users/coso/Documents/dev/js/ag-ui` 复核 artifacts / agent UI 参考：AG-UI 的核心可借鉴点是 message / tool / state / activity 事件分层和 snapshot-delta 可重建性；Lime 当前决策保持为“业务事实源不 artifact 化，打开链路 projection artifact 化”，不引入第二套 AG-UI runtime wire format。
- 导入点击闭环 fixture 已扩展真实文件预览证据：临时本地历史源会生成 Markdown、HTML、DOCX、XLSX、PPTX 与 PDF 兜底文件，导入后的工具轨 `read_file` 打开按钮统一带 `inline-tool-open-file` 定位并调用 Workspace 文件打开链路；GUI smoke 点击后断言 Markdown / DOCX / XLSX / PPTX 在 Artifact Workbench 可读、HTML 进入 iframe 预览、PDF 无文本时进入 `system_open` fallback，Office 文档不出现 `PK`、`word/document.xml`、`xl/worksheets/sheet1.xml`、`ppt/slides/slide1.xml`、`[Content_Types].xml` 等 ZIP/OpenXML 噪音。
- 导入过程组已补 reasoning 保真守卫：当本地历史同一回合同时包含 reasoning、命令、多个 `read_file` 文件工具、搜索和 patch 时，MessageList 仍把 reasoning 投影为 inline `thinking` part；StreamingRenderer 在同组导入工具轨下保留 reasoning 原文与“已完成思考”状态，避免文件预览工具轨把第一条思考刷掉。
- App Server `thread_read.tool_calls` 现在从 `tool.started` 保留 `arguments`，并在合并 `tool.result` 完成态时继续带回 `read_file.arguments.path`；导入工具轨因此可以从历史 `tool_response` 恢复文件打开入口。
- 通用文件 preview artifact 打开时会同步发送 `previewOpenRequest.selectionKey=artifact:<id>`，驱动 `CanvasWorkbenchLayout` 从上一次图片 / 审查 / 日志选择切到当前文件；`renderMode=media/system_open/unsupported` 的媒体预览仍由调用方的显式 selection request 处理，避免图片附件被普通文件选择逻辑抢焦点。
- Preview Artifact Contract 已补齐 PDF、Excel、PPT、音频、视频、URL 与 database_record 的 source-backed 投影守卫；二进制文档无文本抽取时明确走 `system_open`，避免右侧工作台显示“成功打开但正文为空”的假预览。
- `PreviewMediaRenderer` 与 `PreviewArtifactFallbackSurface` 从 `ArtifactRenderer` 拆出，`ArtifactRenderer` 回到分发职责；`system_open / unsupported` 不再进入空内容态或普通 `DocumentRenderer`。
- `PreviewSourceSummaryRenderer` 已接入 `source=url/database_record/app` 与 `contentKind=app_shell`，右侧工作台展示来源类型、source ref、记录 / 应用标识和导入摘要；`useWorkspaceArtifactPreviewActions` 对这些来源只发送 `selectionKey=artifact:<id>`，不再把 URL / record id 当文件路径读取。
- WebSearch / URL 来源点击不再默认旁路到外部浏览器：消息工具轨在有 Workspace 回调时会打开 `source=url` preview artifact，右侧工作台显示来源标题、URL 和摘要；外部浏览器打开仍集中在 `ArtifactToolbar`，避免卡片内再实现一套 URL 打开逻辑。
- WebSearch / WebFetch 混合过程组已补同源快照复用：`StreamingRenderer` 在同一 process run 内把 sibling tool calls 作为上下文传给搜索结果列表，`urlPreviewSnapshot` 只在 URL 匹配且 WebFetch 成功返回可读正文时附加 `snapshotContent / snapshotTitle / snapshotSource`；`AgentChatWorkspace` 打开 URL preview artifact 时优先使用快照正文，搜索摘要只作为 fallback。
- 文档 preview 抽取范围已从 DOCX 扩展到 XLSX、PPTX 与 best-effort PDF 文本流：`document-preview` 继续作为后端唯一文本抽取事实源，`file_browser_service.read_file_preview` 抽取成功时返回文本、前端自然投影为 `document_text`；无法抽取的文档仍进入统一 `system_open` 兜底。当前 PDF 不承诺 OCR、扫描件或复杂字体映射还原。
- 验证：
  - `npx vitest run "src/components/agent/chat/components/CanvasWorkbenchLayout.test.tsx" -t "previewOpenRequest 命中媒体 preview artifact"` 通过。
  - `npx vitest run "src/lib/artifact/previewArtifact.test.ts" "src/components/agent/chat/workspace/useWorkspaceArtifactPreviewActions.test.tsx" "src/components/agent/chat/workspace/browserAssistArtifact.unit.test.ts"` 通过。
  - `npx vitest run "src/components/agent/chat/components/CanvasWorkbenchLayout.test.tsx"` 通过。
  - `npx eslint --max-warnings 0 "src/components/agent/chat/AgentChatWorkspace.tsx" "src/components/agent/chat/components/CanvasWorkbenchLayout.tsx" "src/components/agent/chat/components/canvas-workbench/CanvasWorkbenchPreviewModePanel.tsx" "src/components/agent/chat/components/canvas-workbench/useCanvasWorkbenchDocumentState.ts" "src/components/agent/chat/components/CanvasWorkbenchLayout.test.tsx"` 通过。
  - `node scripts/electron/codex-import-click-through-fixture-smoke.mjs --app-url "http://127.0.0.1:1421/" --timeout-ms 120000` 通过，覆盖导入预览、确认导入、图片附件点击、继续对话和视觉审计。
  - `npm run smoke:codex-import-click-through-electron-fixture -- --app-url "http://127.0.0.1:1420/" --timeout-ms 180000` 通过，summary `ok=true`、`consoleErrors=[]`、Markdown / HTML / DOCX `openedAllImportedPreviewArtifacts=true`、三视口视觉审计通过。
  - `npx vitest run "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "scripts/electron/codex-import-click-through-fixture-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept` 通过，覆盖导入工具轨文件打开入口和 click-through fixture 的 Markdown / HTML / DOCX 预览守卫。
  - `npx vitest run "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/utils/agentThreadGrouping.test.ts" "src/components/agent/chat/components/MessageList.test.tsx" --silent=passed-only --disableConsoleIntercept` 通过，覆盖导入 reasoning 与多文件工具轨混合展示。
  - `npx vitest run "src/lib/artifact/previewArtifact.test.ts" "src/components/artifact/ArtifactRenderer.ui.test.tsx" "src/components/artifact/ArtifactToolbar.ui.test.tsx" "src/components/agent/chat/workspace/useWorkspaceArtifactPreviewActions.test.tsx" --silent=passed-only --disableConsoleIntercept` 通过，覆盖 URL / database_record / app_shell 来源摘要投影、渲染、工具栏外部打开和 selection key。
  - `npx vitest run "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/MessageList.test.tsx" "src/components/agent/chat/workspace/useWorkspaceConversationSceneRuntime.test.ts" --silent=passed-only --disableConsoleIntercept` 通过，覆盖 WebSearch 搜索结果点击优先进入 URL preview artifact 回调、消息层透传和 Workspace scene runtime 接线。
  - `npx vitest run "src/components/agent/chat/utils/urlPreviewSnapshot.unit.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" --silent=passed-only --disableConsoleIntercept` 通过，覆盖 WebFetch 结构化正文快照复用、URL 不匹配隔离、诊断噪音过滤，以及混合 WebSearch/WebFetch 过程组点击后进入 URL preview artifact 回调。
  - `npx vitest run "scripts/electron/codex-import-click-through-fixture-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept` 通过，覆盖 click-through fixture 生成 Markdown / HTML / DOCX / XLSX / PPTX / PDF 样本、工具轨打开入口和 Office ZIP/OpenXML 噪音守卫。

## 完成标准

当前阶段完成必须同时满足：

1. Codex 导入对话中的文件、HTML、DOCX、图片等对象不会丢消息、乱码或走空白预览。
2. Workspace 点击文件与点击正式 artifact 使用同一打开链路。
3. `ArtifactDocument v1` 仍只承接正式交付物，不被普通文件预览污染。
4. Electron 独立窗口能力由 Desktop Host current 命令承接。
5. 文档中不再把 `lime-rs/src/**`、旧 Tauri command、旧 `agent_runtime_*` 写成 current 实施落点。
6. Codex 导入相关 Preview Artifact 证据必须回挂 `internal/roadmap/codeximport/fidelity-acceptance-matrix.md`，避免文件预览、图片预览和正式 artifact 再次形成两套验收逻辑。
7. 定向前端、Electron、Rust 测试通过；GUI 主路径至少跑最小 smoke 或明确记录阻塞。
