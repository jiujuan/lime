## Lime v1.53.0

### 新功能
- 编程工作台对齐 OpenVibeCoding 主路径，新增中央预览 / 文件 / 变更 / 输出 / 日志标签与右侧对话结构
- 编程模式默认优先展示 HTML 可视预览，多文件变更队列与输出面板从首屏诊断卡中拆出
- 失败输出新增“继续修复”入口，基于现有 Harness 输出、文件变更和 checkpoint 生成结构化修复请求并回到同一 `code_orchestrated` session
- i18n P4 readiness 新增发布文档、Chrome extension、app metadata、RTL 与全路线图聚合报告

### 修复
- 修正运行时队列在独立 session 间的 active turn 隔离，避免一个 session 的执行阻塞其它 session
- 修正 runtime turn 专用线程或 Tokio runtime 启动失败时的兜底与 gate 释放，降低队列卡死风险
- 修正空持久化线程与首屏 history page 的 queued turn 投影，让恢复态能继续暴露真实队列
- 修正 Agent Chat 会话恢复后未自动续跑 hydrated runtime queue 的问题

### 优化与重构
- 收敛 `CanvasWorkbenchLayout` 的 coding mode、utility tab、change view 与 i18n 文案边界
- 代码审阅摘要补齐失败输出短预览、当前审阅焦点、相关文件排序与输出 / 文件 pair 展示
- Harness 状态面板、任务中心 tab、workspace scene runtime 与 sidebar 进一步对齐编程工作台信息架构
- 删除旧的 RTL evidence 截图与过期 readiness 产物，改由新的 P4 / roadmap readiness evidence 记录当前状态

### 测试与质量
- 新增编程工作台布局、输出修复、变更队列、对话恢复和 runtime queue 的前端 / Rust 回归
- 新增 i18n docs locale manifest、app metadata locale manifest、P4 readiness 与 roadmap readiness 报告测试
- 质量任务规划器会在 i18n P4 / roadmap evidence 变化后推荐刷新对应 readiness 报告
- RTL smoke 证据扩展到 Workspace surface，并把 required surface coverage 纳入 readiness inventory

### 文档
- 新增 OpenVibeCoding 编程工作台对齐计划
- 更新 Agent UI roadmap、i18n P0-P4 执行进度、release docs workflow、app metadata workflow 与 RTL readiness 评估
- 发布说明与版本事实源同步到 `1.53.0`

### 其他
- 根应用、Tauri workspace、Tauri 配置、CLI npm package 与锁文件版本统一更新到 `1.53.0`

**完整变更**: `v1.52.0` -> `v1.53.0`
