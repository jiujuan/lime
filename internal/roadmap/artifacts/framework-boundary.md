# Artifact / Runtime / Preview 分层边界

> 状态：current
> 更新时间：2026-06-17

## 结论

Lime 的长期边界固定为：

- Lime 产品层：Preview Artifact Contract、ArtifactDocument、Workbench、renderer、export、source UX。
- App Server / RuntimeCore / Agent：thread、turn、item、event、tool、output schema、approval、evidence。
- services crates：文件、文档、任务、知识库等 domain 服务。
- Electron Desktop Host：窗口、系统 shell、预览独立窗口、sidecar、IPC。
- Blueprint：可选长周期规划模块，不是 artifact 或 preview 的根抽象。

## 不再使用的落点

- `lime-rs/src/**` 已删除，不得恢复为业务 owner。
- 旧 Tauri command wrapper 不得恢复为 preview 或 artifact 命令面。
- 旧 `agent_runtime_*` 只能作为 retired guard / 历史 evidence / test-only fixture。
- renderer 不能直接 import `WebviewWindow`。

## Codex 对照

Codex 值得参考的是：

- app-server thread/turn/item/run 语义。
- output schema 作为 runtime 能力。
- 工具事件、审批、文件读取和 session 状态的可恢复模型。
- Codex CLI 对 DOCX 等非纯文本文件不会直接把 ZIP 字节当 UTF-8 展示，而是通过适配层给模型可读内容或明确工具结果。

Codex 不应被照搬的是：

- 把 Lime 的正式文档协议改成 Codex 的任意 artifact 命名。
- 把文件预览交给聊天消息文本。
- 让 UI projection 变成业务事实源。

## AG-UI 对照

AG-UI 可作为交互协议参考，但不成为 Lime current wire format。

可吸收：

- lifecycle / message / tool / state / custom 分层。
- snapshot + delta 的可恢复状态思路。
- document/image/audio/video/binary input part 的 source 表达。
- custom/activity 只作为 UI 扩展，不抢 domain state。

不吸收：

- 不把 Lime artifact 存储改成 AG-UI event store。
- 不把 preview artifact 当作 run state。
- 不让前端组件变成 source of truth。

## 场景归属

| 场景            | Current owner                               | Preview Artifact 角色        |
| --------------- | ------------------------------------------- | ---------------------------- |
| Codex 导入消息  | App Server session/read model               | 保持消息结构，高保真展示     |
| Codex 导入文件  | file/session file domain                    | source-backed file preview   |
| DOCX            | `document-preview` + `file_browser_service` | document_text preview        |
| HTML            | file domain + Electron Host                 | canvas + external_window     |
| 图片            | task/media/file domain                      | media preview                |
| 正式报告        | ArtifactDocument domain                     | 非临时 artifact              |
| Plugin shell | App Server runtime + Electron Host          | app_shell preview entry      |
| 知识库命中      | knowledge domain                            | source-backed record preview |

## 设计约束

1. 单一打开链路：所有可打开对象先得到 artifact projection，再统一打开。
2. 单一业务事实源：projection 不写回 domain，除非用户显式保存。
3. 单一桌面壳链路：独立窗口只走 Electron Desktop Host current 命令。
4. 单一文档抽取链路：DOCX 等文档内容抽取只走 Rust services/current crate。
5. 单一正式产物链路：高价值交付物只走 `ArtifactDocument v1`。
