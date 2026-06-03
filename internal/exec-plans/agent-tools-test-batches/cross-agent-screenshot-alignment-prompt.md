# Cross Agent 截图对齐测试提示词

## 用途

把下面“可复制提示词”发给 Codex 或 Claude Code，用来让两个 Agent 对同一个 Lime Agent Chat 工具渲染场景做截图、DOM 顺序和字体排版对比。目标不是让两个 Agent 各自发明测试口径，而是让它们产出同格式证据，方便后续按差异修 Lime 实现。

本提示词可以配合任意批次文档使用。推荐每次只传一个批次 path，避免多个进程跨批次夹写。

## 可复制提示词

```md
你现在在 Lime 仓库工作：`/Users/coso/Documents/dev/ai/aiclientproxy/lime`。

请执行一次 Agent Chat 工具渲染截图对齐测试。测试批次文档是：

`<替换为 batch 文档路径，例如 internal/exec-plans/agent-tools-test-batches/batch-03-web-browser-tools.md>`

如果本轮消息附带参考截图，把截图作为视觉基准；如果没有截图，优先参考 `/Users/coso/Documents/dev/rust/codex` 的 current 行为，再参考 `/Users/coso/Documents/dev/js/claudecode`。Codex 和 Claude Code 口径冲突时，以 Codex 为准，因为它仍在持续更新维护。

核心约束：

- 始终先读批次文档和 Lime `AGENTS.md`。
- 先记录 `git status --short --untracked-files=all`，声明本轮认领写集；不要跨批次夹写。
- 不要 hard code session、path、provider、model、tool name 特例；只能参考架构和行为。
- 不要主动 git commit、branch、reset 或 revert 用户/其他进程改动。
- 使用 Playwright MCP 或等价浏览器自动化做 GUI 验证；不能只跑单测就收口。
- 同一个场景至少跑两遍：第一遍验证实时流式过程，第二遍刷新或重新打开历史会话验证 hydration。

本次截图对齐的固定 GUI 条件：

- Lime URL：`http://127.0.0.1:1420/`
- 健康检查：`npm run bridge:health -- --timeout-ms 120000`
- 桌面 viewport：`1440x1000`
- 移动/窄屏 viewport：`390x844`
- 每轮至少保存这些截图：
  - `01-before-send`
  - `02-streaming-tools-visible`
  - `03-final-answer`
  - `04-history-reload`
  - `05-hover-tool-or-source-row`

必须采样并记录这些 DOM / style 证据：

- 关键节点 DOM index：前置正文、工具过程摘要、来源引用或任务/文件卡、最终正文标题。
- 工具过程是否在最终正文之前，是否被 raw JSON/stdout/source 切碎。
- 工具过程展开后是否保留工具名、参数摘要、结果摘要、失败状态。
- 来源引用或工具详情的 `font-family`、`font-size`、`line-height`、`font-weight`、颜色、margin、gap。
- hover 前后：未悬停时多余操作按钮是否隐藏，悬停后是否显示且不挤压排版。
- 历史冷加载后：是否重复渲染 trailing timeline、artifact 或工具输出。
- 控制台 error / warning。

批次相关测试输入：

- 如果批次文档给了明确 GUI 场景，优先使用批次里的场景。
- 如果是 Web/Search 批次，使用这个固定用户输入：

  `请使用联网信息整理今天（2026-06-03）的国际新闻简报。你需要自行判断是否搜索，不要询问我是否搜索。最终用中文 Markdown 输出，包含 6 条重要新闻，每条都要有来源引用。`

- 如果是文件/命令/任务板等本地批次，只使用安全 fixture 和只读/可撤销操作，不要破坏用户真实项目。

执行顺序：

1. 读批次文档，列出本轮覆盖工具和认领写集。
2. 运行批次建议的最小单元测试或 Rust 定向测试。
3. 做第一遍 GUI 流式验证，保存截图和 DOM/style 证据。
4. 做第二遍历史恢复验证，保存截图和 DOM/style 证据。
5. 对照参考截图或 Codex current 行为，列出 Lime 的差异。
6. 如果发现实现问题，先说明最小修复方案；只有差异直接阻塞本批次交付时才改业务代码。
7. 修复后重复两遍 GUI 验证，证明实时流式和历史恢复都对齐。

收尾输出必须包含：

- 本轮批次 path。
- 实际覆盖工具。
- 跑过的命令。
- 两遍 GUI 验证截图路径。
- DOM index 表。
- computed style 表。
- 与参考行为的差异清单。
- 是否发现 hard code、错序、重复、字体/排版不一致、hover 状态不一致。
- 已修复项和剩余缺口。
- 本轮完成度百分比；如果是路线图主线，还要给整体目标完成度百分比。
```

## 证据表模板

```md
## 截图对齐结果

- Agent：Codex / Claude Code
- 批次 path：
- 参考来源：截图 / Codex repo / Claude Code repo
- Viewport：1440x1000 / 390x844

| 证据 | 路径或数值 |
| --- | --- |
| 01-before-send |  |
| 02-streaming-tools-visible |  |
| 03-final-answer |  |
| 04-history-reload |  |
| 05-hover-tool-or-source-row |  |

| 节点 | DOM index | 文本摘要 | 备注 |
| --- | ---: | --- | --- |
| 前置正文 |  |  |  |
| 工具过程摘要 |  |  |  |
| 来源/任务/文件卡 |  |  |  |
| 最终正文标题 |  |  |  |

| 节点 | font-family | font-size | line-height | font-weight | color | margin/gap |
| --- | --- | --- | --- | --- | --- | --- |
| 正文段落 |  |  |  |  |  |  |
| 工具摘要 |  |  |  |  |  |  |
| 来源标题 |  |  |  |  |  |  |
| 来源 host/url |  |  |  |  |  |  |

## 差异清单

- 错序：
- 重复：
- raw 输出污染：
- 来源引用：
- 字体/排版：
- hover 状态：
- 历史恢复：
- 控制台：

## 结论

- 是否达到本批次可交付：
- 已修复：
- 剩余缺口：
- 下一刀：
```
