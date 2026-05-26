## Lime v1.52.0

### ✨ 新功能
- Managed Objective 自动化 smoke 扩展为独立入口，覆盖 owner session、continuation、completion audit 与 evidence pack 的端到端证据链
- Agent 运行时新增请求元数据、工具输入能力、文件 checkpoint、timeline artifact、可靠性状态与 diff review 展示
- ToolCallDisplay、DecisionPanel、HarnessStatusPanel 与 AgentRuntimeStrip 补齐运行时权限、命令执行摘要、证据状态和错误呈现
- HTML artifact renderer 支持 asset protocol 预览路径，Tauri CSP 同步放行 asset/font/media/frame 资源
- 本地记忆嵌入接入 ONNX embedding 特性，模型按需下载，不进入安装包
- API Key Provider 与模型配置面板补齐连接测试类型、模型注册与 OpenAI-compatible provider 兼容信息

### 🐛 修复
- 修正 automation due job 与 agent session 的 owner 绑定，避免续跑和证据导出丢失原始 session 关系
- 修正 Agent message projection、artifact preview、workspace send action 与 message scroll controller 的边界状态
- 修正 memory search / unified memory 命令输出、HTML 预览、文件系统 API mock 与媒体任务 mock 的一致性问题
- 修正 live provider smoke 与 Vitest 网络守卫的默认阻断策略，避免普通测试误触发外部网络或真实 Provider

### 🔧 优化与重构
- 拆分 DevBridge agent session dispatcher、automation executor 与 runtime request metadata 组包逻辑
- 收敛 Agent Chat 运行时状态、session finalize、artifact/message 工具函数和 workspace send helper 的测试边界
- 简化 Memory 页面与设置页记忆配置路径，减少旧展示面与 current memory runtime 的重复实现
- 统一 @代码 / mention 命令前缀匹配、runtime tool surface、agent command catalog 与 mock priority command 的事实源

### 🧪 测试与质量
- 新增 managed-objective-automation smoke 与 openai-compatible fixture server，默认走本地 fixture 而非真实 Provider
- 增强 agent-runtime-tool-surface page smoke，覆盖 runtime tool surface、workspace skill binding 与 GUI 页面可读性
- 新增 diff review、workspace file preview、harness state、runtime input capability、agent runtime error presentation 等前端回归
- 扩展 command contract、legacy surface catalog、i18n patch retirement gate、translation coverage 与 language boundary 报告测试
- Rust 侧补齐 request model resolution、runtime turn routing/prompt/projection、timeline service、automation owner session evidence 等定向测试

### 📚 文档
- 更新命令边界、质量工作流、Agent UI、i18n 与 managed objective 路线图记录
- 新增 HTML preview provider readiness 记录与 i18n patch retirement gate evidence
- 发布说明与版本事实源同步到 `1.52.0`

### 📦 其他
- 根应用、Tauri workspace、Tauri 配置、CLI npm package 与锁文件版本统一更新到 `1.52.0`

**完整变更**: `v1.51.0` -> `v1.52.0`
