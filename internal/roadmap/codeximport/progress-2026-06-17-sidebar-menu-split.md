---
title: Codex Import Progress - Sidebar Menu Split And File Preview Closure
status: done
updated: 2026-06-17
owner: app-sidebar
---

# Codex Import Progress - Sidebar Menu Split And File Preview Closure

## 背景

本轮在并行开发状态下继续推进本地历史对话导入主线。前半段避让 `read_file` 文件打开按钮实现；隔壁进程补齐按钮后，本轮接管完整点击闭环中暴露出的 Workbench 预览竞态与 smoke helper current DOM 对齐问题。

## 本轮目标

降低侧栏导入入口所在组件的体量和耦合度，并关闭完整导入点击闭环中的文件预览阻塞：导入工具轨里的 Markdown / HTML / DOCX 文件必须能通过 current Canvas Workbench 打开并展示正确预览，同时不改变导入确认弹窗和 App Server 协议。

## 改动范围

- 新增 `src/components/app-sidebar/AppSidebarConversationMenus.tsx`
  - 承接普通会话菜单与项目菜单的 portal 渲染、菜单样式和菜单 action dispatch。
- 更新 `src/components/app-sidebar/AppSidebarConversationShelf.tsx`
  - 移除内联菜单渲染和样式。
  - 继续只负责会话分组、普通对话区、项目对话组接线和菜单状态。
  - 文件从 858 行降到 652 行，低于 800 行拆分预警线。
- 更新 `src/components/agent/chat/components/CanvasWorkbenchLayout.tsx`
  - `previewOpenRequest.selectionKey` 早于 artifact 入库时，不再提前标记 handled。
  - 等待 `documentContext.selectionKey` 真正命中后再按当前文件的 `previewModeState.defaultMode` 切换 Markdown / HTML / Code tab，修复 HTML 文件打开后仍停留在上一份 Markdown tab 的竞态。
- 更新 `src/components/agent/chat/components/CanvasWorkbenchLayout.test.tsx`
  - 新增 request 早于 artifact 入库的 HTML 预览回归，确保最终进入 `canvas-workbench-html-preview`。
- 更新 `scripts/electron/lib/local-history-import-click-through-gui.mjs`
  - smoke helper 从旧 `artifact-workbench-shell` 判定对齐到 current `canvas-workbench-shell / canvas-workbench-layout / canvas-workbench-preview-mode-panel`。
  - 修复 environment popover 检查中 `SOURCE_THREAD_ID` 被错误闭包到 browser-side `evaluate` 的 fixture bug。

## 避让范围

本轮仍未触碰以下正在并行修复或高冲突区域：

- `src/components/agent/chat/components/InlineToolProcessStep.tsx`
- `src/components/agent/chat/utils/toolDisplayInfo.ts`
- `src/components/agent/chat/hooks/usePathReferences*`
- 后端 `read_file` arguments / timeline 投影链路

## 验证

- `npx eslint "src/components/app-sidebar/AppSidebarConversationShelf.tsx" "src/components/app-sidebar/AppSidebarConversationMenus.tsx"` 通过。
- `npx prettier --check "src/components/app-sidebar/AppSidebarConversationShelf.tsx" "src/components/app-sidebar/AppSidebarConversationMenus.tsx"` 通过。
- `npx vitest run "src/components/AppSidebar.conversations.test.tsx" "src/components/app-sidebar/sidebarConversationGroups.test.ts" --silent=passed-only --disableConsoleIntercept` 通过，43 个测试。
- `git diff --check -- "src/components/app-sidebar/AppSidebarConversationShelf.tsx" "src/components/app-sidebar/AppSidebarConversationMenus.tsx"` 通过。
- `npm run smoke:codex-import-continuation-electron-fixture -- --app-url "http://127.0.0.1:1420/" --timeout-ms 180000` 通过。
  - summary: `.lime/qc/gui-evidence/codex-import-continuation-fixture/codex-import-continuation-fixture-summary.json`
  - `ok=true`
  - `electronPreloadBridge=true`
  - `missingRequiredMethods=[]`
  - `backendMetadataImported=true`
  - `backendCwd=/workspace/imported-codex`
- `npx vitest run "src/components/agent/chat/components/CanvasWorkbenchLayout.test.tsx" "scripts/electron/codex-import-click-through-fixture-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept` 通过，14 个测试。
- `npx eslint "src/components/agent/chat/components/CanvasWorkbenchLayout.tsx" "src/components/agent/chat/components/CanvasWorkbenchLayout.test.tsx" "scripts/electron/lib/local-history-import-click-through-gui.mjs"` 通过。
- `npx prettier --check "src/components/agent/chat/components/CanvasWorkbenchLayout.tsx" "src/components/agent/chat/components/CanvasWorkbenchLayout.test.tsx" "scripts/electron/lib/local-history-import-click-through-gui.mjs"` 通过。
- `npm run smoke:codex-import-click-through-electron-fixture -- --app-url "http://127.0.0.1:1420/" --timeout-ms 180000` 通过。
  - summary: `.lime/qc/gui-evidence/codex-import-click-through-fixture/codex-import-click-through-fixture-summary.json`
  - `ok=true`
  - `electronPreloadBridge=true`
  - `missingRequiredMethods=[]`
  - `importedFilePreviewArtifactsSummary.openedAllImportedPreviewArtifacts=true`
  - Markdown: `markdownPreviewVisible=true`
  - HTML: `htmlPreviewVisible=true`
  - DOCX: `markdownPreviewVisible=true` 且没有 ZIP/OpenXML 噪音
  - `environmentPopoverSummary.hidesImportedRunControlCard=true`
  - 三视口视觉审计均通过，输入框可用，消息列表可见，导入 banner / run control 不出现在主线。
- `npm run smoke:local-history-import-real-sample-visual-audit -- --app-url "http://127.0.0.1:1420/" --timeout-ms 240000` 通过。
  - summary: `.lime/qc/gui-evidence/local-history-import-real-sample-visual-audit/local-history-import-real-sample-visual-audit-summary.json`
  - `ok=true`
  - `consoleErrors=[]`
  - `lineCount=14290`
  - `messageCount=1756`
  - `willImportTimelineItems=12739`
  - `attachmentMessages=14`
  - 九张多视口 / 滚动截图均通过，`leakedTokens=[]`。

## 剩余缺口

- 本轮已关闭完整点击闭环的 `read_file` 文件预览阻塞。
- 真实 content-studio 长样本视觉审计已复跑通过；剩余主线风险转向更宽的模型 / 多模态能力对齐、后续 Claude Code importer，以及全量 `verify:local` 在当前大工作树上的可跑性。
