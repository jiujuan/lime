# Lime Agent App 开放能力清单

更新时间：2026-05-16

## 概述

Lime 主 App 通过统一的 `lime.* capability surface` 向 Agent App 开放平台能力。本文档梳理所有开放能力，分门别类列出现状和用途。

## 能力分组

### 1. 应用表面 (app_surface)

| 能力 | 版本 | 阶段 | Owner | 方法 | 说明 |
|------|------|------|-------|------|------|
| `lime.ui` | 0.3.0 | current | desktop_host | toast, navigate, openExternal, download, getSnapshot | 桌面壳的提示、导航、下载、主题和快照能力 |
| `lime.events` | 0.3.0 | preview | desktop_host | emit, subscribe, unsubscribe, listSubscriptions | App UI、worker、Host 和 runtime 间的事件通道 |
| `lime.workspace` | 0.3.0 | preview | desktop_host | getCurrent, list, open, getPathRef | 当前 workspace、路径引用、打开入口和工作区上下文 |

### 2. 数据 (data)

| 能力 | 版本 | 阶段 | Owner | 方法 | 说明 |
|------|------|------|-------|------|------|
| `lime.storage` | 0.3.0 | current | desktop_host | get, set, list, delete | App namespace 下的结构化业务状态和轻量数据存储 |
| `lime.files` | 0.3.0 | current | desktop_host | pick, readRef, parse | 用户授权文件、file ref 读取和基础解析入口 |
| `lime.knowledge` | 0.3.0 | current | knowledge_runtime | search, bindStatus, bind, export | 项目知识、App knowledge binding、检索和版本导出 |
| `lime.artifacts` | 0.3.0 | current | artifact_runtime | create, open, export, list | 产物创建、打开、导出、列表和 provenance |
| `lime.documents` | 0.3.0 | preview | tool_runtime | parse, export, transform, summarize | PDF、Word、Markdown、PPT 等文档解析、转换和导出 |

### 3. Agent 运行时 (agent_runtime)

| 能力 | 版本 | 阶段 | Owner | 方法 | 说明 |
|------|------|------|-------|------|------|
| `lime.agent` | 0.3.0 | current | agent_runtime | startTask, streamTask, getTask, cancelTask, retryTask, submitHostResponse, listTasks | App-scoped Agent task、流式过程、追问、确认、取消和重试 |
| `lime.workflow` | 0.3.0 | current | agent_runtime | start, checkpoint, awaitHuman | App workflow、checkpoint、后台任务和人类确认 |
| `lime.models` | 0.3.0 | preview | agent_runtime | list, select, getRouting, estimateCost | 模型列表、模型路由、能力约束和预估成本 |
| `lime.memory` | 0.3.0 | preview | agent_runtime | query, write, compact, getStatus | 工作记忆、长期记忆、团队记忆和上下文压缩 |
| `lime.skills` | 0.3.0 | preview | agent_runtime | list, resolve, bind, invoke, getInvocation | Skill 注册、发现、绑定、启用状态和调用过程 |
| `lime.context` | 0.3.0 | preview | agent_runtime | getSnapshot, attach, detach | 会话上下文、选中资源、当前任务和可附加上下文 |
| `lime.automation` | 0.3.0 | preview | agent_runtime | startJob, getJob, cancelJob | 自动化 job、周期任务和服务型 Skill 编排 |

### 4. 治理 (governance)

| 能力 | 版本 | 阶段 | Owner | 方法 | 说明 |
|------|------|------|-------|------|------|
| `lime.policy` | 0.3.0 | current | policy_runtime | check, requestPermission | 权限、风险、成本、数据和企业策略检查 |
| `lime.secrets` | 0.3.0 | current | policy_runtime | getRef, requestBinding | OAuth、API key、外部平台凭证和 secret ref |
| `lime.capabilities` | 0.3.0 | preview | desktop_host | list, get, getProfile | Host capability catalog、版本、可用性和 readiness 摘要 |
| `lime.settings` | 0.3.0 | preview | desktop_host | get, set, list | App 可见设置、workspace overlay 和 tenant 默认值 |
| `lime.review` | 0.3.0 | preview | policy_runtime | requestDecision, submitDecision, listPending | 人工审核、风险确认、发布门禁和决策记录 |

### 5. 集成 (integration)

| 能力 | 版本 | 阶段 | Owner | 方法 | 说明 |
|------|------|------|-------|------|------|
| `lime.tools` | 0.3.0 | current | tool_runtime | invoke, getProgress | Tool Broker / ToolHub 的受控工具调用与长任务状态 |
| `lime.mcp` | 0.3.0 | preview | tool_runtime | listServers, listTools, invoke | MCP server、tool inventory 和受控调用 |
| `lime.browser` | 0.3.0 | preview | tool_runtime | open, navigate, extract, screenshot, close | 浏览器自动化、网页读取、截图和会话隔离 |
| `lime.search` | 0.3.0 | preview | tool_runtime | query, deepResearch, getRun | 网页搜索、深度研究、来源和运行状态 |
| `lime.media` | 0.3.0 | preview | tool_runtime | generateImage, editImage, transcribe, synthesizeVoice | 图片、音频、语音、视频素材的生成和处理 |
| `lime.terminal` | 0.3.0 | preview | tool_runtime | run, getRun, cancel | 命令执行、日志、取消、sandbox 和审批 |
| `lime.connectors` | 0.3.0 | preview | cloud_overlay | list, requestAuth, getStatus, invoke | 外部系统连接器、授权状态和受控集成调用 |

### 6. 可观测性 (observability)

| 能力 | 版本 | 阶段 | Owner | 方法 | 说明 |
|------|------|------|-------|------|------|
| `lime.evidence` | 0.3.0 | current | artifact_runtime | record, linkArtifact, list | 来源、引用、工具调用、评估和发布证据 |
| `lime.usage` | 0.3.0 | preview | agent_runtime | getTokenUsage, getCostSummary, getBudget | Token、费用、预算、任务和 App 级用量归因 |
| `lime.tasks` | 0.3.0 | preview | agent_runtime | list, get, cancel, subscribe | 跨 App / runtime 的后台任务、队列、状态和订阅 |

## 阶段说明

- **current**: 已实现，可用于生产
- **preview**: 部分实现，可用于测试和预览
- **planned**: 计划中，尚未实现

## Owner 说明

- **desktop_host**: Lime 桌面应用宿主
- **agent_runtime**: Agent 运行时
- **tool_runtime**: 工具运行时
- **knowledge_runtime**: 知识运行时
- **artifact_runtime**: 产物运行时
- **policy_runtime**: 策略运行时
- **cloud_overlay**: 云覆盖层

## 统计

- **总能力数**: 27
- **current 阶段**: 11
- **preview 阶段**: 16
- **planned 阶段**: 0

## 相关文档

- [P18.7 Full Lime Capability Surface](./p18-7-full-lime-capability-surface.md) - 全量能力分层和接线计划
- [Capability SDK](./capability-sdk.md) - 客户端 Capability SDK 方案
- [Agent App 路线图](./README.md) - Agent App 整体路线图
