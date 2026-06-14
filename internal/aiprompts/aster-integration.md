# Aster 框架集成

## 集成状态 ✅

Lime 已完整集成 aster-rust 框架。Provider 配置桥接已收敛到 API Key Provider。

## 当前事实源

- `Aster thread / turn / item runtime` 是运行态事实源。
- Aster shared runtime store 与全局 session store 必须在 Lime bootstrap 启动期显式初始化；启动恢复时由 runtime support 统一完成 legacy queue 迁移与 queued session 枚举。
- 运行时命令与 service 只允许读取已准备好的 shared store / shared queue service，不再在热路径偷偷 fallback 到默认路径。
- Lime 只负责事件映射、数据库投影和 UI 派生，不再伪造核心 runtime item。
- 会话删除统一收口到存储边界；命令层和 Dev Bridge 不应直接调用 `AgentDao::delete_session`。
- 需要恢复运行态时，优先从 Aster runtime 恢复，再映射到 Lime timeline。
- 旧 `lime-rs/src/commands/aster_agent_cmd/**` 只作为 git history / 执行计划中的 Aster legacy desktop facade 参考；新 runtime、host integration、跨 App 复用能力必须进入 App Server JSON-RPC、RuntimeCore、ExecutionBackend 或 services，不能恢复或继续在 `lime-rs/src/commands/**` 扩写。

**后端模块** (`lime-rs/src/agent/`):

- `aster_state.rs` - Agent 状态管理
- `aster_agent.rs` - Agent 包装器
- `event_converter.rs` - 事件转换器
- `credential_bridge.rs` - API Key Provider 桥接

**legacy desktop facade / cleanup reference**（已删除，只允许从 git history / 执行计划参考）:

- `aster_agent_init` - 初始化 Agent
- `aster_agent_configure_provider` - 手动配置 Provider
- `aster_agent_status` - 获取状态
- 旧 `agent_runtime_submit_turn` - retired 提交 facade 名称，只作 guard / 历史 evidence
- 旧 `agent_runtime_interrupt_turn` - retired 中断 facade 名称，只作 guard / 历史 evidence
- 旧 `agent_runtime_create/list/get/update/delete_session` - retired 会话 facade 名称，只作 guard / 历史 evidence
- 旧 `agent_runtime_respond_action` - retired 工具确认 / ask / elicitation facade 名称，只作 guard / 历史 evidence

这些命令名只允许作为 retired guard、历史 evidence、测试 fixture 或受控迁移面；文件所在的 `commands/**` 目录已删除，不是新实现落点。新增能力必须回到 App Server JSON-RPC / RuntimeCore / `lime-rs/crates/**`。

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      前端 (React)                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  useAsterAgentChat / agentRuntime.ts / configureAsterProvider ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   App Server JSON-RPC                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  agentSession/start / turn/start / read / action/respond     ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Agent 模块                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ aster_state │  │ credential  │  │ event_converter         │  │
│  │ (状态管理)  │  │ _bridge     │  │ (事件转换)              │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────────┘  │
│         │                │                                      │
│         ▼                ▼                                      │
│  ┌─────────────────────────────────────┐                        │
│  │     Lime Provider 配置              │                        │
│  │  - ApiKeyProviderService            │                        │
│  │  - ModelRegistryService             │                        │
│  └─────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Aster 框架                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Agent       │  │ Provider    │  │ Session                 │  │
│  │ (核心)      │  │ (多种)      │  │ (会话)                  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Provider 桥接

### 支持的凭证类型映射

| Lime 凭证类型            | Aster Provider |
| ------------------------ | -------------- |
| OpenAIKey                | openai         |
| ClaudeKey / AnthropicKey | anthropic      |
| GeminiApiKey             | google         |
| VertexKey                | gcpvertexai    |
| Codex API Key            | codex          |

Kiro / Gemini OAuth / Codex OAuth / Claude OAuth / Antigravity OAuth 均已退役，不再作为 Aster Provider 配置来源。

### 使用方式

> 治理约定：前端业务层不要直接 `invoke('aster_*')` 或旧 `agent_runtime_*`，统一通过 `src/lib/api/agentRuntime/*` 投影到 App Server current method。历史 `src/lib/api/agentCompat.ts` 已删除。
>
> 删除治理约定：会话删除 / 归档统一走 App Server session lifecycle current method，不要再暴露旧 Aster/Dev Bridge 删除边界。

```typescript
import { createAppServerClient } from "@/lib/api/appServer";

const appServer = createAppServerClient();
const { session } = await appServer.startSession({
  workspaceId: "workspace-id",
});

await appServer.startTurn({
  sessionId: session.sessionId,
  input: { text: "Hello" },
  runtimeOptions: {
    stream: true,
    eventName: "agent_stream",
    providerPreference: "openai",
    modelPreference: "gpt-4",
  },
});
```

## 相关文档

- [overview.md](overview.md) - 项目架构
- [providers.md](providers.md) - Provider 系统
- [credential-pool.md](credential-pool.md) - 凭证池退役说明
