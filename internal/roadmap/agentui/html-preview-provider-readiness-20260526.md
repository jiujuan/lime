# HTML 预览与 Provider 真实试跑收口记录

> 状态：进行中，尚未宣布完整完成
> 更新时间：2026-05-26 CST
> 范围：普通用户打开 HTML 文件的默认预览体验，以及 AI 服务商设置页与聊天页真实 Provider 调用一致性。

## 用户闭环

1. 普通用户打开 `.html / .htm` 文件时，默认看到网页预览，而不是源码。
2. 用户需要看代码时，可以在同一画布切换到源码。
3. 真实本地 HTML 文件在 Tauri 中应通过受控 asset protocol 预览，并可打开独立预览窗口。
4. 用户在 AI 服务商设置页点测试时，文本模型应做真实聊天试跑，不能只用极轻量探活显示“连接成功”。
5. 聊天页真实调用遇到 `402 Payment Required / Insufficient Balance / 余额不足` 时，应展示余额或额度不足的可操作提示。

## 当前实现证据

| 要求                        | 当前证据                                                                                                                                                                                                                                                      | 判定   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| HTML 类型可穷举             | `CanvasContentType` 包含 `html`；`CanvasPanel` 用 `assertNever` 穷举 `code / html / markdown / file / empty`                                                                                                                                                  | 已实现 |
| HTML 文件识别               | `workspaceFilePreview.ts` 将 `.html / .htm` 解析为 `contentType: "html"`、`language: "html"`                                                                                                                                                                  | 已实现 |
| 默认网页预览                | `CanvasPanel` 对 HTML 默认渲染 iframe；无真实路径用 `srcDoc`                                                                                                                                                                                                  | 已实现 |
| 源码切换                    | HTML 工具栏提供“预览 / 源码”切换，源码走 `CodePreview`                                                                                                                                                                                                        | 已实现 |
| Tauri 本地文件预览          | 有 `sourcePath` 或绝对 `baseFilePath` 时使用 `convertFileSrc` 生成 iframe `src`                                                                                                                                                                               | 已实现 |
| 浏览器 / DevBridge 回退预览 | `convertFileSrc` 不可用且返回原始绝对路径时，不再把 `/Users/...html` 当成 Vite 站内 iframe `src`；改用 `srcDoc` 展示真实 HTML 内容                                                                                                                            | 已实现 |
| 独立预览窗口                | `openHtmlPreviewWindow` 使用 Tauri `WebviewWindow` 创建 `html-preview-*`，失败回退系统默认应用                                                                                                                                                                | 已实现 |
| HTML artifact 流式阶段预览  | `resolveDefaultArtifactViewMode` 对 `html` 与 `code + language: html` 始终返回 `preview`，不再因 `writePhase: streaming` 默认源码                                                                                                                             | 已实现 |
| HTML artifact 工具栏切换    | `HtmlRenderer` 接入外部 `viewMode / previewSize` 受控状态；工作区已有外部工具栏时隐藏内部重复工具栏，源码切换会真实移除 iframe 并渲染源码                                                                                                                     | 已实现 |
| `.htm` 产物识别             | `buildArtifactFromWrite` 将 `.htm` 构建为 `html` artifact，并标记 `language: "html"`                                                                                                                                                                          | 已实现 |
| Tauri 权限与 CSP            | `tauri.conf*.json` 启用 `assetProtocol`，CSP 覆盖 `asset:` / `http://asset.localhost` / `frame-src`；capability 覆盖 `html-preview-*` 与 `core:webview:allow-create-webview-window`                                                                           | 已实现 |
| Provider 设置页不再误导     | 文本模型按钮显示“试跑当前模型”，并通过 `test_api_key_provider_chat` 做真实聊天试跑                                                                                                                                                                            | 已实现 |
| 402 额度错误友好化          | `agentRuntimeErrorPresentation` 将 `402 / Payment Required / Insufficient Balance / 余额不足 / 额度不足` 归一为额度不足提示；聊天时间线、折叠摘要、流式失败 assistant patch 与会话概览均在 presentation 层显示友好提示，不再向普通用户暴露 raw Provider error | 已实现 |
| 失败态不过度重复            | 失败详情只保留在时间线错误卡等主解释位置；assistant 正文若只是同一失败详情的重复文案会被隐藏，底部运行状态行只保留“失败 + 耗时”等短状态                                                                                                                       | 已实现 |
| 五语言文案                  | `settings.json` 与 `agent.json` 已覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`                                                                                                                                                                                | 已实现 |

## 外部依据

Context7 查询 Tauri v2 官方文档后确认：

- `convertFileSrc()` 用于把设备文件路径转换为 WebView 可加载 URL；需要在 `tauri.conf.json` 配置 `assetProtocol`、scope 与 CSP。
- 前端创建新 WebView window 需要 `core:webview:allow-create-webview-window` capability；动态窗口 label 需要 capability `windows` 覆盖。

当前实现与上述方向一致。

## 已执行验证

```bash
npm run bridge:health -- --timeout-ms 120000
```

结果：通过，`http://127.0.0.1:3030/health` 返回 `status=ok`。

```bash
npx vitest run \
  "src/components/general-chat/canvas/CanvasPanel.test.tsx" \
  "src/lib/api/fileSystem.test.ts" \
  "src/components/agent/chat/workspace/workspaceFilePreview.test.ts" \
  "src/components/agent/chat/workspace/useWorkspaceArtifactPreviewActions.test.tsx"
```

结果：4 个文件、26 个用例通过。最新复跑时与 HTML artifact、Provider 试跑和 402 错误展示相关用例合并执行，12 个文件、98 个用例通过。覆盖 Tauri asset URL 预览、浏览器 / DevBridge 回退 `srcDoc` 预览、源码切换、真实路径保留、HTML artifact 默认预览、Provider 文本模型真实试跑入口和额度不足提示。

```bash
npx vitest run \
  "src/components/api-key-provider/ProviderSetting.ui.test.tsx" \
  "src/components/api-key-provider/ApiKeyProviderSection.ui.test.tsx" \
  "src/components/agent/chat/utils/agentRuntimeErrorPresentation.test.ts" \
  "src/components/agent/chat/hooks/agentStreamErrorController.test.ts"
```

结果：4 个文件、55 个用例通过。

```bash
npx vitest run \
  "src/components/agent/chat/utils/messageArtifacts.test.ts" \
  "src/components/artifact/renderers/HtmlRenderer.test.tsx" \
  "src/components/artifact/renderers/CodeRenderer.test.tsx" \
  "src/components/artifact/ArtifactToolbar.ui.test.tsx"
```

结果：4 个文件、17 个用例通过。覆盖 HTML / `.htm` artifact 默认预览、HTML 代码 artifact 默认预览、外部工具栏受控源码切换，以及 HTML / Code 渲染器基础行为。

```bash
npx eslint \
  "src/components/agent/chat/utils/messageArtifacts.ts" \
  "src/components/agent/chat/utils/messageArtifacts.test.ts" \
  "src/components/artifact/renderers/HtmlRenderer.tsx" \
  "src/components/artifact/renderers/HtmlRenderer.test.tsx" \
  --max-warnings 0
```

结果：通过。

```bash
npx vitest run \
  "src/components/agent/chat/components/AgentThreadTimeline.test.tsx" \
  "src/components/agent/chat/components/CanvasSessionOverviewPanel.test.tsx" \
  "src/components/agent/chat/utils/agentThreadGrouping.test.ts" \
  "src/components/agent/chat/hooks/agentStreamErrorController.test.ts" \
  "src/components/agent/chat/utils/agentRuntimeErrorPresentation.test.ts" \
  "src/components/agent/chat/components/MessageList.test.tsx"
```

结果：6 个文件、193 个用例通过。覆盖 Provider 402 在时间线错误卡、turn failed inline 状态、折叠摘要、会话概览、流式失败 assistant patch 与 MessageList 组合层中不再暴露 `Agent provider execution failed / Payment Required / Insufficient Balance` 原始错误。

```bash
npx vitest run \
  "src/components/agent/chat/components/MessageList.test.tsx" \
  "src/components/agent/chat/components/Inputbar/components/InputbarRuntimeStatusLine.test.tsx" \
  "src/components/agent/chat/components/AgentThreadTimeline.test.tsx" \
  "src/components/agent/chat/utils/agentThreadGrouping.test.ts" \
  "src/components/agent/chat/hooks/agentStreamErrorController.test.ts"
```

结果：5 个文件、192 个用例通过。覆盖失败态不再同时在 assistant 正文和底部状态行重复展示同一条长错误详情，底部状态行只保留短失败状态。

```bash
npx eslint \
  "src/components/agent/chat/components/AgentThreadTimeline.tsx" \
  "src/components/agent/chat/components/AgentThreadTimeline.test.tsx" \
  "src/components/agent/chat/components/CanvasSessionOverviewPanel.tsx" \
  "src/components/agent/chat/components/CanvasSessionOverviewPanel.test.tsx" \
  "src/components/agent/chat/utils/agentThreadGrouping.ts" \
  "src/components/agent/chat/utils/agentThreadGrouping.test.ts" \
  "src/components/agent/chat/hooks/agentStreamErrorController.test.ts"
```

结果：通过。

```bash
git diff --check
```

结果：通过。

```bash
npm run test:contracts
```

结果：通过。`check:agent-runtime-clients`、命令契约、Harness 契约、modality runtime contracts 与 cleanup report contract 均通过，说明本轮 HTML / Provider 改动没有引入命令、bridge 或 mock 契约漂移。

Playwright 真实 GUI 验证：

- 打开 `http://127.0.0.1:1420/`，首页加载完成，初始 console error 为 `0`。
- 在当前默认项目根目录创建 `html-preview-smoke-20260526.html` 作为真实文件冒烟样本。
- 从输入框打开左侧文件管理器，点击该 HTML 文件的“预览”：
  - 画布默认显示 HTML 预览，存在 `canvas-html-preview-mode` 与 `canvas-html-source-mode`。
  - iframe 存在，且在浏览器 / DevBridge 模式下使用 `srcDoc`，不再把 `/Users/...html` 当成 Vite 站内 `src`。
  - 点击“源码”后 iframe 数量变为 `0`，页面出现 `<!doctype html>` 与样本源码文本。
  - 再点击“预览”后 iframe 恢复，`srcDoc` 中包含 `HTML 预览已打开`。
  - 复测未再出现 HTML iframe 加载 CORS 错误；仅出现一次 DevBridge SSE `ERR_INCOMPLETE_CHUNKED_ENCODING` 事件流噪音，与 HTML 预览加载无关。
- 在运行中的 Vite/Tauri 页面动态挂载 `ArtifactRenderer`，使用 `type: "html"`、`status: "streaming"`、`writePhase: "streaming"` 做浏览器级验证：
  - `viewMode: "preview"` 时 DOM 中存在 `iframe`。
  - 切到 `viewMode: "source"` 后 DOM 中不再存在 `iframe`，并能看到 HTML 源码文本。
  - 刷新并恢复 DevBridge 后，console error 为 `0`。
- 进入 `设置 -> AI 服务商 -> Mimo`，页面显示 `mimo-v2.5-pro` 与“试跑当前模型”。
- 未点击真实 Mimo 试跑按钮，原因是该动作会调用真实 Provider 并可能消耗用户余额。仓库 live Provider 门禁也要求显式 `--allow-live-provider` 或 `LIME_ALLOW_LIVE_PROVIDER_SMOKE=1 / LIME_REAL_API_TEST=1` 才允许真实 Provider smoke。

GUI smoke：

- `npm run verify:gui-smoke -- --reuse-running --timeout-ms 300000`：workspace ready、browser runtime、site adapters 通过；Skill Forge 前端定向测试通过；第一个 Rust 定向测试 `register_capability_draft_persists_readonly_http_preflight_provenance` 通过；随后在第二个 Rust 定向测试阶段触发 `smoke:agent-service-skill-entry 超时（>330000ms）`，脚本已清理子进程和 smoke Chrome profiles。
- 为拆解上述超时，已单跑 Rust 定向测试：
  - `services::runtime_skill_binding_service::tests::`：7 个用例通过。
  - `services::capability_draft_service::tests::execute_capability_draft_controlled_get_returns_evidence_without_persisting_inputs`：通过。
  - `commands::aster_agent_cmd::workspace_skill_binding_prompt::tests::should_project_workspace_skill_runtime_enable_as_callable_scope`：通过。
  - `lime-agent tools::skill_tool_gate::tests::`：编译 `aster-core` 阶段失败于 `No space left on device (os error 28)`；当前磁盘可用约 `797MiB`，`lime-rs/target` 约 `116G`。
- 再次尝试单跑 `lime-agent tools::skill_tool_gate::tests::`：仍在构建 `libaster-*.rlib` 时失败于 `No space left on device (os error 28)`；失败后磁盘可用约 `809MiB`。
- 早前同命令曾失败于本机 `~/.cargo` registry 中 `base64-0.22.1` 缺文件；本次复跑已越过该错误，剩余问题是 Rust smoke 阶段总耗时超过脚本上限。
- 使用临时 `CARGO_HOME` 与独立 target 重跑：workspace ready、browser runtime、site adapters、Skill Forge 前端定向测试通过；Rust 冷编译超过 10 分钟超时，脚本已清理子进程。
- 2026-05-26 复跑 `npm run verify:gui-smoke -- --reuse-running --timeout-ms 300000`：
  - 磁盘可用空间已恢复到约 `35GiB` 起步，结束后约 `47GiB`。
  - workspace ready、browser runtime、site adapters 通过。
  - `smoke:agent-service-skill-entry` 通过；其中 Skill Forge 前端 38 个用例通过，Rust 定向测试 `register_capability_draft_persists_readonly_http_preflight_provenance`、`services::runtime_skill_binding_service::tests::`、`execute_capability_draft_controlled_get_returns_evidence_without_persisting_inputs`、`should_project_workspace_skill_runtime_enable_as_callable_scope`、`lime-agent tools::skill_tool_gate::tests::` 均通过。
  - `smoke:agent-runtime-tool-surface` 通过。
  - `smoke:agent-runtime-tool-surface-page` 失败于等待 `Runtime 能力摘要出现` 超时；诊断显示页面停留在首页 / 新对话输入区，未出现 `处理工作台`、`Runtime 能力摘要`、code runtime strip、Harness sections 等页面级断言目标。该失败与 HTML 预览和 Provider 402 文案修复不在同一代码路径，但仍阻塞全量 GUI smoke green。

Typecheck：

- `npm run typecheck` 多次长时间无输出且不收敛，已终止并确认无本轮残留。

## 当前未完成门槛

| 缺口                 | 原因                                                                                                                                                         | 下一步                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 真实 Mimo 试跑证据   | 点击会消耗真实 Provider 余额，且当前用户截图已显示余额不足；仓库 live Provider smoke 默认禁止真实外部 Provider 调用                                          | 只有在用户明确允许消耗额度时执行；否则以 mock / 单测覆盖链路                                                                                                                                                                                                                                                                                                                                                   |
| 全量 GUI smoke green | 当前 Rust / Skill Forge 磁盘阻塞已解除；剩余阻塞是 `smoke:agent-runtime-tool-surface-page` 页面级等待 `Runtime 能力摘要` 超时，页面停留在首页 / 新对话输入区 | 定向排查 `scripts/agent-runtime/tool-surface-page-smoke.mjs` 的页面导航 / fixture submit / Harness 打开链路，再复跑 `npm run smoke:agent-runtime-tool-surface-page -- --app-url http://127.0.0.1:1420/ --health-url http://127.0.0.1:3030/health --invoke-url http://127.0.0.1:3030/invoke --timeout-ms 300000 --interval-ms 1000`，最后复跑 `npm run verify:gui-smoke -- --reuse-running --timeout-ms 300000` |
| 全量 typecheck green | 当前本机全量 `tsc --noEmit` 不收敛                                                                                                                           | 后续需要单独治理 typecheck 性能 / 环境                                                                                                                                                                                                                                                                                                                                                                         |

## 结论

本轮已经把两个用户痛点推进到可验证实现：HTML 默认预览不再只看源码，Provider 设置页不再用轻量探活冒充真实聊天可用。当前不能宣布“完整整体目标 100% 完成”，因为真实 HTML GUI 点击证据、真实 Mimo 试跑授权、全量 GUI smoke 与全量 typecheck 仍缺最终 green 证据。
