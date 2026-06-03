## Lime v1.58.0

### 新功能
- 更新通知新增自动安装会话，前端可跟随检查、下载、安装、重启、失败和已是最新版等状态展示进度，并通过 `app-update://session` 事件获得实时更新
- 模型选择器支持读取 API / registry 暴露的 `reasoning_effort` 能力，在 Agent 输入框中展示并选择推理强度档位
- Agent 输入框新增 Plus 菜单，将附件、知识库、Plan、Objective、Subagent 和 Skill 入口收敛到统一交互，并在工作区输入框保留内联知识与技能入口
- Agent runtime 工具清单新增 MCP resource helper 可见性控制，只在运行时明确支持资源读取时展示相关辅助工具
- Task board 工具接受 `snake_case` 参数别名，并在任务缺失时返回结构化空结果，提升模型工具调用兼容性

### 修复
- 修正更新安装链路的会话状态、浏览器 mock、窗口关闭和手动下载兜底，避免自动更新失败时让用户停在不可解释状态
- 修正模型 registry 对不同 Provider 能力字段的解析，减少推理强度、任务族、模态和 runtime feature 信号遗漏
- 修正 Agent 消息、工具过程、搜索结果、站点媒体和 streaming renderer 的展示归一逻辑，降低内部协议残留或空内容进入用户可见消息的概率
- 修正 Workspace 发送、任务中心草稿、知识初始选择和 runtime compaction metadata 的状态拼装边界
- 修正项目资料 GUI smoke 在 Plus 菜单、浮层关闭、页面导航和长等待场景下的定位与诊断信息

### 优化与重构
- 将输入框高级选项重构为 Plus 菜单、状态 chip 和独立模型控制区，减少常驻控件噪音并保留可扫描的当前模式状态
- 继续把 Agent Chat、Inputbar、Workspace send actions、Tool display、Model selector 和 Settings 中的复杂逻辑下沉到 View Model / helper / projection
- 记忆设置页重构为 Memory、Soul、Advanced 三段式配置，并新增 Soul 模板、预览、导入和重置流程
- Provider 设置页按导航配置决定是否展示桌宠入口，减少与 OEM cloud 入口混用造成的无效入口
- 更新通知页补齐进度态、失败态、跳过 / 稍后提醒 / 关闭动作和 mock preview 的一致展示

### 测试与质量
- 新增 `smoke:agent-runtime-tool-execution`，覆盖 Agent runtime 工具执行链路的发布前 smoke
- 强化 `knowledge-gui-smoke` 的 Plus 菜单、项目资料浮层、导航超时、点击诊断和离线 fixture 覆盖
- 补充更新通知、自动安装会话、模型推理强度、输入框 Plus 菜单、工具展示、Task board、MCP resource helper、Provider 设置和 Soul 设置回归
- 完善 OpenAI-compatible fixture server、Vitest 分层 runner、i18n unused key 检查和测试分类覆盖
- 根应用、Tauri workspace、Tauri 配置、CLI npm package、Agent App runtime package 与锁文件版本统一更新到 `1.58.0`

### 文档
- 更新工程质量工作流和测试治理路线图，记录分层测试与发布 smoke 的新增入口
- 更新 Soul rollout plan，沉淀记忆 / Soul 设置页的交付阶段和验收边界

### 其他
- Tauri updater 配置补齐 Windows `installMode`，让安装行为与更新安装会话保持一致

**完整变更**: `v1.57.0` -> `v1.58.0`
