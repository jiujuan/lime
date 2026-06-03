# Batch 01: 文件与搜索工具测试计划

## 独立背景

本批次用于测试文件和本地搜索工具进入 Agent Chat 后的时间序、摘要、历史恢复和文件变更卡。它不依赖其他批次结果，可以单独复制本文件 path 给一个进程执行。

最近已修复的问题是：流式正文 overlay / completion reconcile 曾把最终正文插到工具过程前，导致“工具过程”和“最终正文”错序。该修复以 `web_search` 为代表，但文件与搜索工具同样会产生 `tool_use`、`file_changes_batch`、artifact、timeline item，必须单独覆盖。

## 参考与交接约束

- 外部参考优先级：先看 `/Users/coso/Documents/dev/rust/codex`，再看 `/Users/coso/Documents/dev/js/claudecode`。
- 不确定文件修改卡、引用、undo、tool timeline 或历史恢复口径时，以 Codex current 行为为准；Codex 与 Claude Code 冲突时默认取 Codex。
- 只参考架构和行为，禁止把具体 session、path、provider、model、tool name 特例硬编码进 Lime。
- 其他进程只拿本文件 path 时，也必须先记录 `git status --short`、认领写集和不会修改的范围。

## 覆盖工具

native 注册事实源：`src-tauri/crates/aster-rust/crates/aster/src/tools/mod.rs`

- `Read`
- `Write`
- `Edit`
- `NotebookEdit`
- `view_image`
- `Glob`
- `Grep`

兼容 alias 需要纳入测试输入：

- `read_file`
- `write_file`
- `create_file`
- `edit_file`
- `FileReadTool`
- `FileWriteTool`
- `FileEditTool`
- `GlobTool`
- `GrepTool`

## 认领边界

建议认领：

- `src/components/agent/chat/components/StreamingRenderer.test.tsx`
- `src/components/agent/chat/components/MessageList.test.tsx`
- `src/components/agent/chat/components/messageListItemProjection.unit.test.ts`
- `src/components/agent/chat/components/messageListInlineProcess.test.ts`
- 如必须修复：`src/components/agent/chat/components/messageListItemProjection.ts`、`src/components/agent/chat/components/messageListInlineProcess.ts`、`src/components/agent/chat/hooks/agentStreamCompletionController.ts`

不要修改：

- web / browser 工具分类
- Agent / Team / Task 工具逻辑
- unrelated i18n 和设置页

## 必测场景

1. `Read -> text`：
   - `contentParts = [text("我先读取文件"), tool_use(Read), text("结论")]`
   - DOM 顺序必须是前置说明、读取过程、结论。

2. `Glob/Grep -> text`：
   - 连续 `Glob + Grep` 应折叠为探索过程摘要。
   - 展开后保留 pattern / path / result hint。
   - 不把 grep 输出的大段 raw result 直接塞进最终正文。

3. `Write/Edit -> file_changes_batch -> text`：
   - 文件修改进入 `FileChangesSummaryCard`。
   - 不重复显示普通 artifact 卡。
   - 不重复显示 trailing `file_artifact` timeline。
   - “撤销”按钮在有 session checkpoint 时可用，无 checkpoint 时清楚禁用。

4. `NotebookEdit`：
   - 按 edit 类工具展示，不应被归到普通 generic。
   - 修改结果如果带文件路径，应参与文件变更摘要或至少保留路径。

5. `view_image`：
   - 作为 vision/read 类过程显示。
   - 图片路径不应被误判为文本正文。
   - 失败时展示错误摘要，不吞掉后续正文。

6. 历史恢复：
   - 冷加载历史会话时，`tool_call(Read/Grep/Edit)` 不应统一落到正文后面。
   - `agent_message` 最终正文仍只取最终回答，不把过程说明拼进 `rendererRawContent`。

## 建议测试入口

```bash
npm test -- "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/MessageList.test.tsx"
npm test -- "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/messageListInlineProcess.test.ts"
npm test -- "src/components/agent/chat/utils/fileChangesUndo.unit.test.ts" "src/components/agent/chat/components/FileChangesSummaryCard.test.tsx"
```

Rust 定向可选：

```bash
cargo test --manifest-path "src-tauri/Cargo.toml" diff_summary -- --nocapture
cargo test --manifest-path "src-tauri/Cargo.toml" restore_file_checkpoint_should -- --nocapture
```

## GUI 验证

优先使用已有 `Code runtime fixture` 历史会话：

1. 打开 `http://127.0.0.1:1420/`
2. 点击最近对话中的 `Code runtime fixture ...`
3. 验证文件改动卡存在且可展开。
4. 验证页面中没有重复的普通 artifact 卡。
5. 如果做撤销验证，先确认 fixture 文件可恢复，不要在用户真实项目上随意撤销。
6. 检查控制台 error / warning。

## 交付记录模板

```md
## Batch 01 结果

- 进程/认领人：
- 当前 git 状态：
- 覆盖工具：
- 新增/修改测试：
- GUI 证据：
- 控制台状态：
- 发现问题：
- 是否需要业务修复：
- 下一刀：
```
