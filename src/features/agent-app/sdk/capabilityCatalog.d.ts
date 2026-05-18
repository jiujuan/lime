import type { CapabilityImplementation } from "../types";
export type LimeCapabilityGroup = "app_surface" | "data" | "agent_runtime" | "governance" | "integration" | "observability";
export type LimeCapabilityStage = "current" | "preview" | "planned";
export type LimeCapabilityOwner = "desktop_host" | "agent_runtime" | "tool_runtime" | "knowledge_runtime" | "artifact_runtime" | "policy_runtime" | "cloud_overlay";
export interface LimeCapabilityDefinition {
    readonly name: string;
    readonly version: string;
    readonly group: LimeCapabilityGroup;
    readonly stage: LimeCapabilityStage;
    readonly owner: LimeCapabilityOwner;
    readonly methods: readonly string[];
    readonly summary: string;
    readonly appResponsibility: string;
    readonly limeResponsibility: string;
    readonly profile: {
        readonly mock?: CapabilityImplementation;
        readonly adapter?: CapabilityImplementation;
    };
}
export interface LimeCapabilityProfileEntry {
    readonly version: string;
    readonly enabled: boolean;
    readonly implementation: CapabilityImplementation;
}
export declare const LIME_CAPABILITY_DEFINITIONS: readonly [{
    readonly name: "lime.ui";
    readonly version: "0.3.0";
    readonly group: "app_surface";
    readonly stage: "current";
    readonly owner: "desktop_host";
    readonly methods: readonly ["toast", "navigate", "openExternal", "download", "selectDirectory", "getSnapshot", "openAgentRun", "updateAgentRun", "closeAgentRun"];
    readonly summary: "Lime 桌面壳的提示、导航、下载、主题、快照和统一 Agent Run UI 能力。";
    readonly appResponsibility: "决定业务页面如何展示和何时触发 Host action。";
    readonly limeResponsibility: "校验入口、同步主题语言、执行受控导航和下载，并提供通用 AI 运行现场。";
    readonly profile: {
        readonly mock: "mock";
        readonly adapter: "mock";
    };
}, {
    readonly name: "lime.storage";
    readonly version: "0.3.0";
    readonly group: "data";
    readonly stage: "current";
    readonly owner: "desktop_host";
    readonly methods: readonly ["get", "set", "list", "delete"];
    readonly summary: "App namespace 下的结构化业务状态和轻量数据存储。";
    readonly appResponsibility: "定义业务对象、schema 和写回时机。";
    readonly limeResponsibility: "隔离 namespace、持久化数据、附加 App provenance。";
    readonly profile: {
        readonly mock: "mock";
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.files";
    readonly version: "0.3.0";
    readonly group: "data";
    readonly stage: "current";
    readonly owner: "desktop_host";
    readonly methods: readonly ["pick", "readRef", "parse"];
    readonly summary: "用户授权文件、file ref 读取和基础解析入口。";
    readonly appResponsibility: "声明需要的文件类型并把解析结果映射为业务草稿。";
    readonly limeResponsibility: "处理文件权限、引用生命周期、解析器和安全边界。";
    readonly profile: {
        readonly mock: "mock";
        readonly adapter: "mock";
    };
}, {
    readonly name: "lime.agent";
    readonly version: "0.3.0";
    readonly group: "agent_runtime";
    readonly stage: "current";
    readonly owner: "agent_runtime";
    readonly methods: readonly ["startTask", "streamTask", "getTask", "cancelTask", "retryTask", "submitHostResponse", "listTasks"];
    readonly summary: "App-scoped Agent task、流式过程、追问、确认、取消和重试。";
    readonly appResponsibility: "组装业务输入、期望产物、人工确认和写回目标。";
    readonly limeResponsibility: "复用 AgentRuntime、Skills、Tools、Evidence、模型和队列。";
    readonly profile: {
        readonly mock: "mock";
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.knowledge";
    readonly version: "0.3.0";
    readonly group: "data";
    readonly stage: "current";
    readonly owner: "knowledge_runtime";
    readonly methods: readonly ["search", "bindStatus", "bind", "export"];
    readonly summary: "项目知识、App knowledge binding、检索和版本导出。";
    readonly appResponsibility: "选择业务知识空间、解释检索结果并落到业务对象。";
    readonly limeResponsibility: "维护知识索引、权限、版本和引用 provenance。";
    readonly profile: {
        readonly mock: "mock";
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.tools";
    readonly version: "0.3.0";
    readonly group: "agent_runtime";
    readonly stage: "current";
    readonly owner: "tool_runtime";
    readonly methods: readonly ["invoke", "getProgress"];
    readonly summary: "Tool Broker / ToolHub 的受控工具调用与长任务状态。";
    readonly appResponsibility: "声明工具需求并消费结构化结果。";
    readonly limeResponsibility: "执行工具权限、审计、进度、超时和结果归一化。";
    readonly profile: {
        readonly mock: "mock";
        readonly adapter: "mock";
    };
}, {
    readonly name: "lime.artifacts";
    readonly version: "0.3.0";
    readonly group: "data";
    readonly stage: "current";
    readonly owner: "artifact_runtime";
    readonly methods: readonly ["create", "open", "export", "list"];
    readonly summary: "产物创建、打开、导出、列表和 provenance。";
    readonly appResponsibility: "定义产物类型、标题、内容结构和业务状态联动。";
    readonly limeResponsibility: "持久化产物、管理 viewer/export、记录来源。";
    readonly profile: {
        readonly mock: "mock";
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.workflow";
    readonly version: "0.3.0";
    readonly group: "agent_runtime";
    readonly stage: "current";
    readonly owner: "agent_runtime";
    readonly methods: readonly ["start", "checkpoint", "awaitHuman"];
    readonly summary: "App workflow、checkpoint、后台任务和人类确认。";
    readonly appResponsibility: "定义业务步骤、状态机和人工介入点。";
    readonly limeResponsibility: "托管运行状态、恢复、权限和 Host response。";
    readonly profile: {
        readonly mock: "mock";
        readonly adapter: "mock";
    };
}, {
    readonly name: "lime.policy";
    readonly version: "0.3.0";
    readonly group: "governance";
    readonly stage: "current";
    readonly owner: "policy_runtime";
    readonly methods: readonly ["check", "requestPermission"];
    readonly summary: "权限、风险、成本、数据和企业策略检查。";
    readonly appResponsibility: "说明为什么需要能力并响应被拒绝状态。";
    readonly limeResponsibility: "统一执行策略、授权、审计和降级。";
    readonly profile: {};
}, {
    readonly name: "lime.secrets";
    readonly version: "0.3.0";
    readonly group: "governance";
    readonly stage: "current";
    readonly owner: "policy_runtime";
    readonly methods: readonly ["getRef", "requestBinding"];
    readonly summary: "OAuth、API key、外部平台凭证和 secret ref。";
    readonly appResponsibility: "声明凭证用途，只保存 ref，不读取明文。";
    readonly limeResponsibility: "托管凭证、授权弹窗、轮换和最小权限访问。";
    readonly profile: {};
}, {
    readonly name: "lime.evidence";
    readonly version: "0.3.0";
    readonly group: "observability";
    readonly stage: "current";
    readonly owner: "artifact_runtime";
    readonly methods: readonly ["record", "linkArtifact", "list"];
    readonly summary: "来源、引用、工具调用、评估和发布证据。";
    readonly appResponsibility: "声明业务证据类型并把证据挂到产物/任务。";
    readonly limeResponsibility: "保证 evidence 可追溯、可导出、可审计。";
    readonly profile: {
        readonly mock: "mock";
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.events";
    readonly version: "0.3.0";
    readonly group: "app_surface";
    readonly stage: "preview";
    readonly owner: "desktop_host";
    readonly methods: readonly ["emit", "subscribe", "unsubscribe", "listSubscriptions"];
    readonly summary: "App UI、worker、Host 和 runtime 间的事件通道。";
    readonly appResponsibility: "消费业务事件并避免私有 postMessage 协议。";
    readonly limeResponsibility: "路由事件、隔离 namespace、控制订阅生命周期。";
    readonly profile: {};
}, {
    readonly name: "lime.capabilities";
    readonly version: "0.3.0";
    readonly group: "governance";
    readonly stage: "preview";
    readonly owner: "desktop_host";
    readonly methods: readonly ["list", "get", "getProfile"];
    readonly summary: "Host capability catalog、版本、可用性和 readiness 摘要。";
    readonly appResponsibility: "按 profile 决定 UI 降级，不猜测底层实现。";
    readonly limeResponsibility: "发布单一能力目录，阻止 App 自建能力表。";
    readonly profile: {
        readonly mock: "native";
        readonly adapter: "native";
    };
}, {
    readonly name: "lime.models";
    readonly version: "0.3.0";
    readonly group: "agent_runtime";
    readonly stage: "preview";
    readonly owner: "agent_runtime";
    readonly methods: readonly ["list", "select", "getRouting", "estimateCost"];
    readonly summary: "模型列表、模型路由、能力约束和预估成本。";
    readonly appResponsibility: "表达任务偏好和质量/成本约束，不保存 provider 密钥。";
    readonly limeResponsibility: "统一模型事实源、路由、Provider 能力和成本估算。";
    readonly profile: {
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.usage";
    readonly version: "0.3.0";
    readonly group: "observability";
    readonly stage: "preview";
    readonly owner: "agent_runtime";
    readonly methods: readonly ["getTokenUsage", "getCostSummary", "getBudget"];
    readonly summary: "Token、费用、预算、任务和 App 级用量归因。";
    readonly appResponsibility: "展示业务任务成本并响应预算拦截。";
    readonly limeResponsibility: "从 runtime request telemetry 聚合真实用量。";
    readonly profile: {
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.memory";
    readonly version: "0.3.0";
    readonly group: "agent_runtime";
    readonly stage: "preview";
    readonly owner: "agent_runtime";
    readonly methods: readonly ["query", "write", "compact", "getStatus"];
    readonly summary: "工作记忆、长期记忆、团队记忆和上下文压缩。";
    readonly appResponsibility: "声明业务记忆意图和可写范围。";
    readonly limeResponsibility: "复用 memory_runtime / unified_memory 主链并处理压缩。";
    readonly profile: {
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.skills";
    readonly version: "0.3.0";
    readonly group: "agent_runtime";
    readonly stage: "preview";
    readonly owner: "agent_runtime";
    readonly methods: readonly ["list", "resolve", "bind", "invoke", "getInvocation"];
    readonly summary: "Skill 注册、发现、绑定、启用状态和调用过程。";
    readonly appResponsibility: "声明必需 Skill 和业务场景，不复制 Skill runtime。";
    readonly limeResponsibility: "管理 Skill catalog、workspace binding、runtime gate 和 evidence。";
    readonly profile: {
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.mcp";
    readonly version: "0.3.0";
    readonly group: "integration";
    readonly stage: "preview";
    readonly owner: "tool_runtime";
    readonly methods: readonly ["listServers", "listTools", "invoke"];
    readonly summary: "MCP server、tool inventory 和受控调用。";
    readonly appResponsibility: "声明需要的 MCP capability，不直接连接 server。";
    readonly limeResponsibility: "复用 MCP bridge runtime、命名、权限和审计。";
    readonly profile: {
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.browser";
    readonly version: "0.3.0";
    readonly group: "integration";
    readonly stage: "preview";
    readonly owner: "tool_runtime";
    readonly methods: readonly ["open", "navigate", "extract", "screenshot", "close"];
    readonly summary: "浏览器自动化、网页读取、截图和会话隔离。";
    readonly appResponsibility: "表达业务采集目标和用户授权语义。";
    readonly limeResponsibility: "托管浏览器 profile、权限、工具结果和回放证据。";
    readonly profile: {
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.search";
    readonly version: "0.3.0";
    readonly group: "integration";
    readonly stage: "preview";
    readonly owner: "tool_runtime";
    readonly methods: readonly ["query", "deepResearch", "getRun"];
    readonly summary: "网页搜索、深度研究、来源和运行状态。";
    readonly appResponsibility: "给出业务问题、筛选规则和结果消费方式。";
    readonly limeResponsibility: "统一搜索 provider、来源去重、引用和成本。";
    readonly profile: {
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.documents";
    readonly version: "0.3.0";
    readonly group: "data";
    readonly stage: "preview";
    readonly owner: "tool_runtime";
    readonly methods: readonly ["parse", "export", "transform", "summarize"];
    readonly summary: "PDF、Word、Markdown、PPT 等文档解析、转换和导出。";
    readonly appResponsibility: "定义业务文档类型和结构化落点。";
    readonly limeResponsibility: "执行解析器、格式转换、文件权限和 evidence。";
    readonly profile: {
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.media";
    readonly version: "0.3.0";
    readonly group: "integration";
    readonly stage: "preview";
    readonly owner: "tool_runtime";
    readonly methods: readonly ["generateImage", "editImage", "transcribe", "synthesizeVoice"];
    readonly summary: "图片、音频、语音、视频素材的生成和处理。";
    readonly appResponsibility: "给出业务 brief、尺寸、风格和交付约束。";
    readonly limeResponsibility: "托管媒体 runtime、文件产物、安全策略和成本。";
    readonly profile: {
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.terminal";
    readonly version: "0.3.0";
    readonly group: "integration";
    readonly stage: "preview";
    readonly owner: "tool_runtime";
    readonly methods: readonly ["run", "getRun", "cancel"];
    readonly summary: "命令执行、日志、取消、sandbox 和审批。";
    readonly appResponsibility: "声明命令目的和输入，不能绕过审批。";
    readonly limeResponsibility: "执行 sandbox、approval、日志和危险操作拦截。";
    readonly profile: {
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.tasks";
    readonly version: "0.3.0";
    readonly group: "observability";
    readonly stage: "preview";
    readonly owner: "agent_runtime";
    readonly methods: readonly ["list", "get", "cancel", "subscribe"];
    readonly summary: "跨 App / runtime 的后台任务、队列、状态和订阅。";
    readonly appResponsibility: "展示与本 App 相关的任务，不维护第二套队列。";
    readonly limeResponsibility: "统一任务中心、状态恢复、事件订阅和审计。";
    readonly profile: {};
}, {
    readonly name: "lime.settings";
    readonly version: "0.3.0";
    readonly group: "governance";
    readonly stage: "preview";
    readonly owner: "desktop_host";
    readonly methods: readonly ["get", "set", "list"];
    readonly summary: "App 可见设置、workspace overlay 和 tenant 默认值。";
    readonly appResponsibility: "只读或请求修改自己的配置域。";
    readonly limeResponsibility: "统一设置 schema、权限、overlay 和迁移。";
    readonly profile: {};
}, {
    readonly name: "lime.workspace";
    readonly version: "0.3.0";
    readonly group: "app_surface";
    readonly stage: "preview";
    readonly owner: "desktop_host";
    readonly methods: readonly ["getCurrent", "list", "open", "getPathRef"];
    readonly summary: "当前 workspace、路径引用、打开入口和工作区上下文。";
    readonly appResponsibility: "围绕当前 workspace 展示业务状态。";
    readonly limeResponsibility: "管理 workspace 身份、路径封装和跨平台兼容。";
    readonly profile: {};
}, {
    readonly name: "lime.context";
    readonly version: "0.3.0";
    readonly group: "agent_runtime";
    readonly stage: "preview";
    readonly owner: "agent_runtime";
    readonly methods: readonly ["getSnapshot", "attach", "detach"];
    readonly summary: "会话上下文、选中资源、当前任务和可附加上下文。";
    readonly appResponsibility: "把业务选择显式提交给 runtime。";
    readonly limeResponsibility: "维护 session/thread/turn 上下文和压缩边界。";
    readonly profile: {
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.connectors";
    readonly version: "0.3.0";
    readonly group: "integration";
    readonly stage: "preview";
    readonly owner: "cloud_overlay";
    readonly methods: readonly ["list", "requestAuth", "getStatus", "invoke"];
    readonly summary: "外部系统连接器、授权状态和受控集成调用。";
    readonly appResponsibility: "声明业务连接需求和用户动作。";
    readonly limeResponsibility: "托管 OAuth、secret、tenant policy 和审计。";
    readonly profile: {
        readonly adapter: "adapter";
    };
}, {
    readonly name: "lime.automation";
    readonly version: "0.3.0";
    readonly group: "agent_runtime";
    readonly stage: "preview";
    readonly owner: "agent_runtime";
    readonly methods: readonly ["startJob", "getJob", "cancelJob"];
    readonly summary: "自动化 job、周期任务和服务型 Skill 编排。";
    readonly appResponsibility: "定义业务触发、输入和终止条件。";
    readonly limeResponsibility: "统一 job runtime、队列、权限、证据和恢复。";
    readonly profile: {};
}, {
    readonly name: "lime.review";
    readonly version: "0.3.0";
    readonly group: "governance";
    readonly stage: "preview";
    readonly owner: "policy_runtime";
    readonly methods: readonly ["requestDecision", "submitDecision", "listPending"];
    readonly summary: "人工审核、风险确认、发布门禁和决策记录。";
    readonly appResponsibility: "把审核嵌入业务 UI 并处理拒绝/重试。";
    readonly limeResponsibility: "保留审核证据、权限、审计和发布门禁。";
    readonly profile: {};
}];
export type LimeCapabilityDefinitionRecord = (typeof LIME_CAPABILITY_DEFINITIONS)[number];
export type LimeCapabilityName = LimeCapabilityDefinitionRecord["name"];
export type LimeCapabilityMethodName<Name extends LimeCapabilityName> = Extract<LimeCapabilityDefinitionRecord, {
    name: Name;
}>["methods"][number];
export type LimeCapabilityAdapterKey<Name extends LimeCapabilityName = LimeCapabilityName> = Name extends `lime.${infer Key}` ? Key : never;
export declare const LIME_CAPABILITY_NAMES: readonly LimeCapabilityName[];
export declare const LIME_CAPABILITY_GROUPS: readonly LimeCapabilityGroup[];
export declare function getLimeCapabilityDefinition(name: LimeCapabilityName): LimeCapabilityDefinitionRecord;
export declare function getLimeCapabilityAdapterKey<Name extends LimeCapabilityName>(name: Name): LimeCapabilityAdapterKey<Name>;
export declare function buildLimeCapabilityProfileEntries(resolveImplementation?: (definition: LimeCapabilityDefinitionRecord) => CapabilityImplementation | undefined): Record<LimeCapabilityName, LimeCapabilityProfileEntry>;
export declare function buildLimeCapabilityProfileEntriesForMode(mode: "base" | "mock" | "adapter"): Record<LimeCapabilityName, LimeCapabilityProfileEntry>;
export declare function listEnabledLimeCapabilityNamesForMode(mode: "mock" | "adapter"): LimeCapabilityName[];
