## Lime v1.54.0

### 新功能
- Agent Chat 工作区升级为更清晰的任务工作台，强化会话总览、团队任务、交付物预览、文件管理和右侧对话的协同关系
- 项目选择器支持直接打开已有文件夹、选择项目根目录、定位本地路径，并可从当前项目进入内容视图
- Rust runtime 工具面新增 `view_image` 工作区受限工具，并增强 `Bash` / `Read` / `Write` / `Edit` / `Glob` / `Grep` / Web 工具别名归一化
- Aster 回复解析支持纯文本 `<tool_use>` 工具调用提取，提升模型输出非标准工具调用时的继续执行能力
- OpenAI compatible / Responses 格式增强顶层工具名、namespace、对象参数和流式 tool delta 解析，减少不同 Provider 工具调用格式差异带来的中断
- Agent runtime 预热按 workspace 隔离，并在发送前确保当前 workspace 的 runtime ready 与模型偏好已解析

### 修复
- 自动上下文压缩新增首字前超时保护，慢模型压缩超时会降级退出，避免阻塞后续 runtime turn
- 运行时错误卡片会折叠噪声较高的 JSON-RPC / troubleshooting 原始输出，并展示更可读的错误摘要
- 修正项目列表延迟加载、已有目录复用、项目路径冲突检测和默认 workspace ready 态的边界
- 修正图片输入策略、Browser Assist 证据索引和 workspace 查询 mock 的若干投影边界
- responsive chat 自动模型选择会识别最近的额度、鉴权或 Provider 不可用错误，并跳过不可用候选
- 修正 Bash / PowerShell 路径权限解析在纯变量赋值片段上可能 panic 的问题
- 修正 native tool panic 会中断工具流的问题，现在会收敛为单个工具错误结果
- 修正新会话或 runtime metadata 缺失时 provider / model 偏好可能没有随 turn 提交的问题
- 修正联网预检索把空结果误判为成功的问题，并让必须联网的新闻 / 时效性请求自动扩展带日期的搜索 query

### 优化与重构
- 团队工作台文案从内部运行时术语收敛到任务、负责人、交付物和处理状态，并把技术细节默认折叠
- Harness 状态面板、Team workbench、Canvas workbench、File Manager 与对话恢复场景进一步拆分展示逻辑
- Agent Chat、项目管理、设置页和错误提示补齐 current 五语言本地化资源
- 移除旧的 provider continuation 导出依赖，并清理旧首页截图资源
- 工作区工具权限支持显式只读本地路径，便于在保持 workspace 限制的同时读取用户授权的外部文件
- 工具过程摘要、工具展示信息和 Agent 文本归一化抽出独立 helper，降低 UI 组件重复逻辑
- 文件写入 / 编辑工具会产出结构化 `file_change` metadata，前端聚合展示文件改动摘要，避免多个文件工具调用刷屏
- Tauri patch 依赖更新到 `2.11.2` / `2.6.2`，同步 global shortcut patch 版本
- 默认发布构建不再内置本地 SenseVoice 的 `sherpa-onnx` native runtime；语音模型仍按需下载，后续本地 SenseVoice 运行库将通过显式组件或 feature 启用，避免安装包发布被可选运行库下载阻塞

### 测试与质量
- 新增纯文本工具调用解析、工具别名归一化、`view_image` 权限、自动压缩超时和图片策略的 Rust 回归
- 新增项目选择 / 创建、文件管理、团队工作台、画布布局、对话恢复、Crash Recovery 和错误展示的前端回归
- 新增 OpenAI / Responses 工具调用格式、responsive chat Provider 不可用、显式只读路径权限、runtime 预热和工具过程摘要回归
- 新增文件改动摘要、工具 panic 防护、shell 路径解析 panic 防护和模型偏好随 turn 提交的回归
- 新增联网预检索 required / allowed 模式边界、新闻类 query 扩展和空结果降级的 Rust 回归
- 更新 GUI smoke 的知识工作区检查，以覆盖新的工作区路径和 ready 状态
- 更新 Agent UI TTFT sample matrix，覆盖 runtime MCP prewarm 首字前预算路径
- 发布门禁将覆盖 `cargo fmt`、`cargo test`、`cargo clippy`、`npm run lint`、`npm test` 和 `npm run verify:gui-smoke`

### 文档
- 更新 Agent Chat 工作区与组件 README，记录当前工作台结构和组件边界
- 发布说明与版本事实源同步到 `1.54.0`

### 其他
- 根应用、Tauri workspace、Tauri 配置、CLI npm package 与锁文件版本统一更新到 `1.54.0`

**完整变更**: `v1.53.0` -> `v1.54.0`
