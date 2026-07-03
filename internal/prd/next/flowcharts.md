# Lime Next 流程图

> 状态：north-star planning source
> 更新时间：2026-06-07

## 1. 用户路径：从任意端发起 Agent 任务

```mermaid
flowchart TD
    A["用户在 Claw / Plugin / content-studio / 移动 App / 微信小程序中发起任务"] --> B["Shell 收集业务上下文"]
    B --> C{"端侧运行形态"}
    C -- 本地桌面 --> D["app-server-client / Desktop Host Bridge"]
    C -- 移动 / 小程序 / Web --> E["Remote Runtime Gateway"]
    D --> F["创建或恢复 Agent Session"]
    E --> F
    F --> G["提交 turn / enqueue turn"]
    G --> G1["解析 PermissionProfile / SandboxProfile"]
    G1 --> G2["Sandbox Manager 创建执行边界"]
    G2 --> H["RuntimeCore 创建 turn / run facts"]
    H --> I["ExecutionBackend / ToolRuntime 在 sandbox 内执行"]
    I --> J{"需要用户 action?"}
    J -- 是 --> K["agentSession/event action.required"]
    K --> L["端侧展示确认 UI"]
    L --> M["agentSession/action/respond"]
    M --> I
    J -- 否 --> N["持续接收 runtime events"]
    N --> O["Headless projection 更新 ViewModel"]
    O --> P["桌面 / 移动 / 小程序 UI primitives 渲染"]
    P --> Q["Artifact / Evidence / ReadModel 回流"]
```

## 2. 部署形态选择流程

```mermaid
flowchart TD
    A["新端形态需要 Agent 能力"] --> B{"端侧是否能安全运行本地 sidecar?"}
    B -- 是 --> C["本地 App Server sidecar"]
    B -- 否 --> D["Remote Runtime Gateway"]
    C --> E["AppServerClient / JSON-RPC"]
    D --> F["HTTPS / SSE / WebSocket / Push"]
    E --> G["RuntimeCore facts"]
    F --> H["Auth / Tenant / SandboxProfile / Policy / Queue"]
    H --> G
    G --> I["PermissionProfile / SandboxManager"]
    I --> I1["ExecutionBackend"]
    I1 --> J["agentSession/event / read model"]
    J --> K["端无关 projection"]
    K --> L{"端侧 UI 技术栈"}
    L -- Desktop / Web --> M["React UI primitives"]
    L -- Mobile --> N["Native / Cross-platform components"]
    L -- 微信小程序 --> O["Mini Program components"]
```

## 3. 技术主链

```mermaid
flowchart TD
    A["Product Shell"] --> B["Shell Adapter"]
    B --> C{"Transport"}
    C -- Local --> D["app-server-client / Desktop Host Bridge"]
    C -- Remote --> E["Remote Runtime Gateway"]
    D --> F["App Server JSON-RPC"]
    E --> G["Auth / Tenant / Sandbox / Approval / Queue / Policy"]
    G --> F
    F --> H["Permission / Sandbox Control Plane"]
    H --> I["RuntimeCore"]
    I --> J["SandboxManager"]
    J --> K["ExecutionBackend / ToolRuntime"]
    K --> L["Tool / Skill / Workspace / Memory / Policy"]
    L --> M["RuntimeEvent"]
    M --> N["agentSession/event 语义"]
    N --> O["Headless Projection"]
    O --> P["UI / Native / Mini Program Primitives"]
    P --> Q["Shell-specific UX"]
```

## 4. Claw UI 规范化流程

```mermaid
flowchart TD
    A["发现 Claw UI 能力"] --> B{"是否依赖 Claw shell?"}
    B -- 是 --> C["保留在 Claw shell / adapter"]
    B -- 否 --> D{"是否只依赖 runtime facts?"}
    D -- 否 --> E["先抽 projection / view model"]
    D -- 是 --> F{"是否为纯展示?"}
    F -- 是 --> G["标记 UI primitive candidate"]
    F -- 否 --> H["拆出 state reducer / callback contract"]
    E --> I["补 unit test"]
    G --> I
    H --> I
    I --> J{"第二消费者出现?"}
    J -- 否 --> K["留在 repo 内部模块，守住边界"]
    J -- 是 --> L["抽入共享 package / public exports"]
```

## 5. 本地独立 App 接入流程

```mermaid
flowchart TD
    A["独立 App 需要 Agent 能力"] --> B["引入 app-server-client"]
    B --> C["打包 app-server sidecar / 配置 APP_SERVER_BIN dev override"]
    C --> D["Electron main / host adapter 启动 sidecar"]
    D --> E["initialize -> initialized"]
    E --> F["agentSession/start 绑定 businessObjectRef"]
    F --> G["agentSession/turn/start"]
    G --> H["接收 agentSession/event"]
    H --> I["调用共享 projection"]
    I --> J{"使用默认 UI primitives?"}
    J -- 是 --> K["渲染默认 AgentRuntime surface"]
    J -- 否 --> L["App 自己渲染 ViewModel"]
```

## 6. 移动 App / 微信小程序接入流程

```mermaid
flowchart TD
    A["移动 App / 微信小程序需要 Agent 能力"] --> B["端侧登录 / OpenID 绑定"]
    B --> C["调用 Remote Runtime Gateway"]
    C --> D["Auth / Tenant / App policy 校验"]
    D --> D1["选择 SandboxProfile / PermissionProfile"]
    D1 --> E["capability/list 返回端侧可见能力"]
    E --> F["用户触发预定义 capability 或继续 session"]
    F --> G["agentSession/start 或 turn/start 语义"]
    G --> H["Server Mode Queue / RuntimeCore"]
    H --> H1["Sandbox Manager 创建 worker 执行边界"]
    H1 --> I["ExecutionBackend 执行"]
    I --> J["事件持久化 / Sandbox audit"]
    J --> K{"端侧订阅方式"}
    K -- App 在线 --> L["SSE / WebSocket"]
    K -- App 离线 --> M["Push / Polling"]
    K -- 小程序 --> N["HTTPS polling / template message"]
    L --> O["端侧 projection"]
    M --> O
    N --> O
    O --> P["审批 / 摘要 / artifact preview"]
```

## 7. 服务端长任务流程

```mermaid
flowchart TD
    A["远程入口提交长任务"] --> B["Remote Runtime Gateway"]
    B --> C["认证 / 租户 / 配额 / capability policy"]
    C --> C0["解析 tenant / app / user scoped SandboxProfile"]
    C0 --> C1["Secret Manager / KMS 解析 secret ref"]
    C0 --> C2["Postgres 写入 session / turn"]
    C0 --> D["Queue / Workflow engine 入队"]
    D --> E["Worker carrier 调度<br/>container / namespace / VM / K8s"]
    E --> E1["Sandbox Manager 创建 sandbox attempt"]
    E1 --> F["RuntimeCore 创建 facts"]
    F --> G["ExecutionBackend / ToolRuntime 在 sandbox 内执行"]
    G --> H["Tool / Artifact / Evidence / Sandbox audit"]
    H --> H1["S3 / OSS 写 artifact object"]
    H --> H2["Redis 更新短期状态 / backpressure"]
    H --> I["Postgres / Event Store 持久化事件"]
    I --> I1["OpenTelemetry / Audit log"]
    I --> J["多端订阅 / 推送 / 查询"]
    J --> K["移动 App / 小程序 / Claw / Web Console 更新 projection"]
```

## 7.1 基础设施 Adapter 选择流程

```mermaid
flowchart TD
    A["RuntimeCore 需要基础设施能力"] --> B{"运行环境"}
    B -- Client sidecar --> C["Client Infrastructure Adapters"]
    B -- Server Mode --> D["Server Infrastructure Adapters"]
    A --> P{"是否涉及工具执行 / 文件 / 网络?"}
    P -- 是 --> Q["先走 PermissionProfile / SandboxManager"]
    P -- 否 --> B
    Q --> B
    C --> C1["Cache: memory / local cache"]
    C --> C2["Files: local FS / App data"]
    C --> C3["DB: SQLite / local store"]
    C --> C4["Secret: OS Keychain"]
    C --> C5["Logs: stderr / local logs"]
    D --> D1["Cache: Redis"]
    D --> D2["Files/Object: S3 / OSS / workspace volume"]
    D --> D3["DB: Postgres / managed DB"]
    D --> D4["Queue: workflow engine / cron"]
    D --> D5["Worker carrier: container / namespace / VM / K8s"]
    D --> D6["Secret: Secret Manager / KMS"]
    D --> D7["Observability: OpenTelemetry / audit"]
    D --> D8["Sandbox: tenant-scoped worker backend"]
```

## 8. Runtime 能力新增流程

```mermaid
flowchart TD
    A["新增 Agent 能力"] --> B{"是否已有 App Server current method?"}
    B -- 是 --> C["扩展 RuntimeCore / service"]
    B -- 否 --> D["设计 protocol / capability"]
    D --> E["同步 Rust protocol / TS client / schema fixture"]
    E --> C
    C --> F["ExecutionBackend adapter"]
    F --> F1{"是否执行工具 / shell / 网络 / 文件?"}
    F1 -- 是 --> F2["补 PermissionProfile / SandboxManager / Approval / Audit"]
    F1 -- 否 --> G["agentSession/event / read model 输出"]
    F2 --> G
    G --> H["projection 支持"]
    H --> I["UI primitive / shell adapter 消费"]
    I --> J["contract + GUI / remote gateway 验证"]
```

## 9. 治理收口流程

```mermaid
flowchart TD
    A["发现旧入口 / 旧 UI / 旧命令"] --> B{"是否仍服务 current 主链?"}
    B -- 是 --> C["标记 compat，限制为委托"]
    B -- 否 --> D{"是否有用户路径依赖?"}
    D -- 是 --> E["标记 deprecated，写退出条件"]
    D -- 否 --> F["标记 dead，准备删除"]
    C --> G["补 guard 防止新增业务逻辑"]
    E --> G
    F --> H["删除或加入删除计划"]
    G --> I["npm run test:contracts / governance report"]
```

## 10. 禁止路径

```mermaid
flowchart TD
    A["新 App / 新 Agent UI / 新远程入口"] --> B{"需要 runtime 能力"}
    B --> C["App Server current 主链"]
    B --> I["Remote Runtime Gateway current target"]
    B -.禁止.-> D["复制 Claw 整页"]
    B -.禁止.-> E["自建 AgentRuntime"]
    B -.禁止.-> F["UI state 伪造完成"]
    B -.禁止.-> G["生产 mock fallback"]
    B -.禁止.-> H["直接调用 legacy agent_runtime_*"]
    B -.禁止.-> M["绕过 Sandbox Manager 执行工具"]
    B -.禁止.-> N["把 Docker / Kubernetes 当作 permission model"]
    I -.禁止.-> J["移动端 / 小程序直连本地 sidecar"]
    I -.禁止.-> K["端侧持有 provider secret"]
    I -.禁止.-> L["服务端重造第二套 runtime facts"]
```
