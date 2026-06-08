## Lime v1.61.0

### 新功能
- App Server JSON-RPC 新增自动化任务 current 协议，覆盖调度器配置、状态读取、任务列表 / 详情 / 创建 / 更新 / 删除、立即运行、健康检查、运行历史、计划预览与计划校验。
- 模型 Provider 管理迁移到 App Server current 主链，覆盖 Provider 列表、目录、详情、新建、更新、删除、排序、配置导入导出、连接测试、聊天测试、模型拉取、API Key 管理、Key 轮转、使用 / 错误记录与 UI state 持久化。
- TypeScript 与 Rust App Server client 补齐自动化和模型 Provider 的类型化客户端方法，前端、Electron 与 Rust 侧共享同一组协议常量和 schema。
- Electron Desktop Host 新增 Electron runtime 封装，并继续把 host command 收敛到 App Server current 数据面。

### 修复
- 修复自动化设置和任务 API 缺少 App Server 必需返回值时可能被旧路径伪装成功的问题，现在会 fail closed，不再回退 legacy 命令。
- 修复 API Key Provider / 模型 Provider 读取、写入、测试、导入导出等路径对 legacy `safeInvoke` 的依赖，App Server 不可用时明确暴露错误。
- 修复未注册 desktop-host mock 命令可静默通过的风险，测试 mock 遇到未知命令会直接失败。
- 修复诊断类 API 与生产 API 混用的问题，新增 diagnostic facade，避免把诊断降级误认为真实业务链路。
- 修复自动化 `runNow` 在 App Server 执行器迁移未完成时回退旧 Tauri 执行器的风险，current 协议会拒绝旧执行器回流。

### 优化与重构
- 自动化、模型 Provider、文件浏览、会话文件、知识、记忆、MCP、语音、更新、工作区等前端 API 网关继续收敛到 App Server / Electron current 边界。
- 删除旧自动化 Rust command 与 DevBridge dispatcher，旧自动化命令族进入治理层 dead surface。
- 大幅收缩 `src/lib/desktop-host/*Mocks` 默认 mock 面，生产路径不再通过 default mock 伪造 App Server 能力。
- 移除旧 `webview-api` 暴露面中的过时类型和入口，减少浏览器运行时与桌面 current 主链的重叠。
- App Server 本地数据源吸收自动化、Provider 与文件浏览相关能力，降低 services crate 中旧兼容包装的职责。
- 命令边界文档和治理目录补充自动化 / Provider current 方法清单及旧命令禁回流规则。

### 测试与质量
- App Server client contract 扩展自动化与模型 Provider 覆盖，校验新协议、schema、TypeScript 客户端和 Rust 客户端保持同步。
- 命令契约守卫新增自动化 / Provider 旧命令禁回流检查，阻止 legacy Tauri command、DevBridge dispatcher、mock priority 与 runtime surface 重新接入。
- 新增自动化 API、API Key Provider、模型 Provider、执行运行、会话文件、提示路由、文档导出、图片搜索、视频生成、语音模型等定向回归。
- 新增 desktop-host mock 边界测试，确认未注册 mock fail closed，测试夹具必须显式注册命令。
- 扩展 Electron host command、IPC channel、update host、App Server host 与 current entrypoint 测试。
- Vitest smart runner 与测试文件过滤逻辑补充回归，提升局部测试选择和守卫稳定性。
- 根应用、Rust workspace、CLI npm package、Agent App runtime package、App Server client package 与锁文件版本统一更新到 `1.61.0`。

### 文档
- 更新 Desktop Host / App Server 命令边界，明确自动化、模型 Provider、文件浏览、mock、DevBridge 与 legacy surface 的 current / dead 分类。
- 更新 App Server 前端集成矩阵和实施计划，记录自动化与 Provider 迁移到 App Server current 主链的进度。
- 更新质量工作流与 Playwright / E2E 指南，继续强调 GUI 桌面产品必须通过真实 Electron Desktop Host + App Server 路径验证。
- 更新 Agent App、Agent UI、Managed Objective、Skill Forge 等路线图中与 current 命令边界相关的说明。

### 其他
- 继续减少旧 Tauri / legacy desktop facade / renderer mock 对生产路径的影响，让发版事实源、命令边界和 GUI 验证保持 current 单主链。

**完整变更**: `v1.60.0` -> `v1.61.0`
