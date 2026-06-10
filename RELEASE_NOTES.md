## Lime v1.65.0

### 新功能
- `lime media video generate` 接入 current media runtime，可直接创建并执行视频生成任务，按本地配置或环境变量解析服务端点与 API Key，并写回进度、错误和产物状态。
- `@limecloud/agent-runtime-projection` 新增 artifact、context、conversation、diagnostic、hydration、lifecycle、permission、plan approval、queue、thread item 与 tool event 等标准投影构建模块。
- Agent Chat 投影继续复用共享 projection 包，统一运行态、队列、权限、历史 hydrate、工具轨迹、线程条目与上下文事件的 read model 语义。

### 修复
- 修复视频生成 skill 的推荐命令，优先指向 `lime media video generate --prompt "..." --aspect-ratio 9:16` current 入口。
- 修复旧 `lime-rs/src/**` 仍可能被误判为 current Rust owner 的治理口径，明确恢复旧 Tauri wrapper、stub 或 legacy facade 都属于回流。
- 修复语音设置页对 ASR credential 与快捷键运行态的重复依赖，降低旧命令面影响，默认语音模型状态以 current voice model install state 为准。

### 优化与重构
- 物理删除旧 `lime-rs/src/**` 孤儿目录及旧 Tauri command / service / dev_bridge / runner 实现，Rust 后端事实源收敛到 `lime-rs/crates/**`。
- 将 agent tools catalog、execution 与 inventory 迁入 `lime-rs/crates/agent`，旧路径只保留为删除记录，不再作为运行时 owner。
- 将视频生成 CLI 逻辑拆到 `lime-rs/crates/lime-cli/src/video.rs`，并把视频任务执行能力沉入 `lime-rs/crates/media-runtime/src/video_worker.rs`。
- 收缩 Agent Chat 前端投影中的重复状态机，把可复用事件规范沉淀到 npm projection 包，减少 React 组件侧重复分支。
- 简化语音与热键设置边界：语音页聚焦模型、指令和偏好，快捷键页承接全局热键配置与校验。

### 测试与质量
- 新增 Agent Runtime projection 的 artifact、context、diagnostic、hydration、lifecycle、permission、routing 与 turn context 单测，并扩展主 projection 回归。
- 更新 App Server client contract、Harness contract、Rust current boundary、legacy tool permission guard 与 Electron current rules guard，防止旧路径重新成为事实源。
- 扩展输入框、Markdown、Agent Chat home surface、语音设置、热键设置、媒体任务、图库素材、session images 与视频诊断相关回归。
- 根应用、Rust workspace、CLI npm package、Agent App runtime package、App Server client package、Agent Runtime client 依赖与锁文件版本统一更新到 `1.65.0`。

### 文档
- 更新 AGENTS、工程质量、治理、命令边界与并行协作文档，记录 `lime-rs/src/**` 已于 2026-06-10 删除以及目录级 dead 判定口径。
- 更新 production command current migration、Tauri wrapper inventory / cleanup queue、tech debt tracker 与 App Server frontend integration matrix。
- 更新 Agent Runtime projection 与 Lime CLI npm package 文档，补充 current 投影模块与视频生成入口说明。

### 其他
- 本版继续以 App Server JSON-RPC、Electron Desktop Host、current clients、`lime-rs/crates/**` 与机器可读守卫作为发布事实源，阻断旧 Tauri wrapper 和 renderer mock 对 GUI 主路径的回流。

**完整变更**: `v1.64.0` -> `v1.65.0`
