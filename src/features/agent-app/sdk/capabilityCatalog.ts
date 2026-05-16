import type { CapabilityImplementation } from "../types";

export type LimeCapabilityGroup =
  | "app_surface"
  | "data"
  | "agent_runtime"
  | "governance"
  | "integration"
  | "observability";

export type LimeCapabilityStage = "current" | "preview" | "planned";

export type LimeCapabilityOwner =
  | "desktop_host"
  | "agent_runtime"
  | "tool_runtime"
  | "knowledge_runtime"
  | "artifact_runtime"
  | "policy_runtime"
  | "cloud_overlay";

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

export const LIME_CAPABILITY_DEFINITIONS = [
  {
    name: "lime.ui",
    version: "0.3.0",
    group: "app_surface",
    stage: "current",
    owner: "desktop_host",
    methods: [
      "toast",
      "navigate",
      "openExternal",
      "download",
      "getSnapshot",
      "openAgentRun",
      "updateAgentRun",
      "closeAgentRun",
    ],
    summary: "Lime 桌面壳的提示、导航、下载、主题、快照和统一 Agent Run UI 能力。",
    appResponsibility: "决定业务页面如何展示和何时触发 Host action。",
    limeResponsibility: "校验入口、同步主题语言、执行受控导航和下载，并提供通用 AI 运行现场。",
    profile: { mock: "mock", adapter: "mock" },
  },
  {
    name: "lime.storage",
    version: "0.3.0",
    group: "data",
    stage: "current",
    owner: "desktop_host",
    methods: ["get", "set", "list", "delete"],
    summary: "App namespace 下的结构化业务状态和轻量数据存储。",
    appResponsibility: "定义业务对象、schema 和写回时机。",
    limeResponsibility: "隔离 namespace、持久化数据、附加 App provenance。",
    profile: { mock: "mock", adapter: "adapter" },
  },
  {
    name: "lime.files",
    version: "0.3.0",
    group: "data",
    stage: "current",
    owner: "desktop_host",
    methods: ["pick", "readRef", "parse"],
    summary: "用户授权文件、file ref 读取和基础解析入口。",
    appResponsibility: "声明需要的文件类型并把解析结果映射为业务草稿。",
    limeResponsibility: "处理文件权限、引用生命周期、解析器和安全边界。",
    profile: { mock: "mock", adapter: "mock" },
  },
  {
    name: "lime.agent",
    version: "0.3.0",
    group: "agent_runtime",
    stage: "current",
    owner: "agent_runtime",
    methods: [
      "startTask",
      "streamTask",
      "getTask",
      "cancelTask",
      "retryTask",
      "submitHostResponse",
      "listTasks",
    ],
    summary: "App-scoped Agent task、流式过程、追问、确认、取消和重试。",
    appResponsibility: "组装业务输入、期望产物、人工确认和写回目标。",
    limeResponsibility:
      "复用 AgentRuntime、Skills、Tools、Evidence、模型和队列。",
    profile: { mock: "mock", adapter: "adapter" },
  },
  {
    name: "lime.knowledge",
    version: "0.3.0",
    group: "data",
    stage: "current",
    owner: "knowledge_runtime",
    methods: ["search", "bindStatus", "bind", "export"],
    summary: "项目知识、App knowledge binding、检索和版本导出。",
    appResponsibility: "选择业务知识空间、解释检索结果并落到业务对象。",
    limeResponsibility: "维护知识索引、权限、版本和引用 provenance。",
    profile: { mock: "mock", adapter: "adapter" },
  },
  {
    name: "lime.tools",
    version: "0.3.0",
    group: "agent_runtime",
    stage: "current",
    owner: "tool_runtime",
    methods: ["invoke", "getProgress"],
    summary: "Tool Broker / ToolHub 的受控工具调用与长任务状态。",
    appResponsibility: "声明工具需求并消费结构化结果。",
    limeResponsibility: "执行工具权限、审计、进度、超时和结果归一化。",
    profile: { mock: "mock", adapter: "mock" },
  },
  {
    name: "lime.artifacts",
    version: "0.3.0",
    group: "data",
    stage: "current",
    owner: "artifact_runtime",
    methods: ["create", "open", "export", "list"],
    summary: "产物创建、打开、导出、列表和 provenance。",
    appResponsibility: "定义产物类型、标题、内容结构和业务状态联动。",
    limeResponsibility: "持久化产物、管理 viewer/export、记录来源。",
    profile: { mock: "mock", adapter: "adapter" },
  },
  {
    name: "lime.workflow",
    version: "0.3.0",
    group: "agent_runtime",
    stage: "current",
    owner: "agent_runtime",
    methods: ["start", "checkpoint", "awaitHuman"],
    summary: "App workflow、checkpoint、后台任务和人类确认。",
    appResponsibility: "定义业务步骤、状态机和人工介入点。",
    limeResponsibility: "托管运行状态、恢复、权限和 Host response。",
    profile: { mock: "mock", adapter: "mock" },
  },
  {
    name: "lime.policy",
    version: "0.3.0",
    group: "governance",
    stage: "current",
    owner: "policy_runtime",
    methods: ["check", "requestPermission"],
    summary: "权限、风险、成本、数据和企业策略检查。",
    appResponsibility: "说明为什么需要能力并响应被拒绝状态。",
    limeResponsibility: "统一执行策略、授权、审计和降级。",
    profile: {},
  },
  {
    name: "lime.secrets",
    version: "0.3.0",
    group: "governance",
    stage: "current",
    owner: "policy_runtime",
    methods: ["getRef", "requestBinding"],
    summary: "OAuth、API key、外部平台凭证和 secret ref。",
    appResponsibility: "声明凭证用途，只保存 ref，不读取明文。",
    limeResponsibility: "托管凭证、授权弹窗、轮换和最小权限访问。",
    profile: {},
  },
  {
    name: "lime.evidence",
    version: "0.3.0",
    group: "observability",
    stage: "current",
    owner: "artifact_runtime",
    methods: ["record", "linkArtifact", "list"],
    summary: "来源、引用、工具调用、评估和发布证据。",
    appResponsibility: "声明业务证据类型并把证据挂到产物/任务。",
    limeResponsibility: "保证 evidence 可追溯、可导出、可审计。",
    profile: { mock: "mock", adapter: "adapter" },
  },
  {
    name: "lime.events",
    version: "0.3.0",
    group: "app_surface",
    stage: "preview",
    owner: "desktop_host",
    methods: ["emit", "subscribe", "unsubscribe", "listSubscriptions"],
    summary: "App UI、worker、Host 和 runtime 间的事件通道。",
    appResponsibility: "消费业务事件并避免私有 postMessage 协议。",
    limeResponsibility: "路由事件、隔离 namespace、控制订阅生命周期。",
    profile: {},
  },
  {
    name: "lime.capabilities",
    version: "0.3.0",
    group: "governance",
    stage: "preview",
    owner: "desktop_host",
    methods: ["list", "get", "getProfile"],
    summary: "Host capability catalog、版本、可用性和 readiness 摘要。",
    appResponsibility: "按 profile 决定 UI 降级，不猜测底层实现。",
    limeResponsibility: "发布单一能力目录，阻止 App 自建能力表。",
    profile: {},
  },
  {
    name: "lime.models",
    version: "0.3.0",
    group: "agent_runtime",
    stage: "preview",
    owner: "agent_runtime",
    methods: ["list", "select", "getRouting", "estimateCost"],
    summary: "模型列表、模型路由、能力约束和预估成本。",
    appResponsibility: "表达任务偏好和质量/成本约束，不保存 provider 密钥。",
    limeResponsibility: "统一模型事实源、路由、Provider 能力和成本估算。",
    profile: { adapter: "adapter" },
  },
  {
    name: "lime.usage",
    version: "0.3.0",
    group: "observability",
    stage: "preview",
    owner: "agent_runtime",
    methods: ["getTokenUsage", "getCostSummary", "getBudget"],
    summary: "Token、费用、预算、任务和 App 级用量归因。",
    appResponsibility: "展示业务任务成本并响应预算拦截。",
    limeResponsibility: "从 runtime request telemetry 聚合真实用量。",
    profile: { adapter: "adapter" },
  },
  {
    name: "lime.memory",
    version: "0.3.0",
    group: "agent_runtime",
    stage: "preview",
    owner: "agent_runtime",
    methods: ["query", "write", "compact", "getStatus"],
    summary: "工作记忆、长期记忆、团队记忆和上下文压缩。",
    appResponsibility: "声明业务记忆意图和可写范围。",
    limeResponsibility: "复用 memory_runtime / unified_memory 主链并处理压缩。",
    profile: { adapter: "adapter" },
  },
  {
    name: "lime.skills",
    version: "0.3.0",
    group: "agent_runtime",
    stage: "preview",
    owner: "agent_runtime",
    methods: ["list", "resolve", "bind", "invoke", "getInvocation"],
    summary: "Skill 注册、发现、绑定、启用状态和调用过程。",
    appResponsibility: "声明必需 Skill 和业务场景，不复制 Skill runtime。",
    limeResponsibility:
      "管理 Skill catalog、workspace binding、runtime gate 和 evidence。",
    profile: { adapter: "adapter" },
  },
  {
    name: "lime.mcp",
    version: "0.3.0",
    group: "integration",
    stage: "preview",
    owner: "tool_runtime",
    methods: ["listServers", "listTools", "invoke"],
    summary: "MCP server、tool inventory 和受控调用。",
    appResponsibility: "声明需要的 MCP capability，不直接连接 server。",
    limeResponsibility: "复用 MCP bridge runtime、命名、权限和审计。",
    profile: { adapter: "adapter" },
  },
  {
    name: "lime.browser",
    version: "0.3.0",
    group: "integration",
    stage: "preview",
    owner: "tool_runtime",
    methods: ["open", "navigate", "extract", "screenshot", "close"],
    summary: "浏览器自动化、网页读取、截图和会话隔离。",
    appResponsibility: "表达业务采集目标和用户授权语义。",
    limeResponsibility: "托管浏览器 profile、权限、工具结果和回放证据。",
    profile: { adapter: "adapter" },
  },
  {
    name: "lime.search",
    version: "0.3.0",
    group: "integration",
    stage: "preview",
    owner: "tool_runtime",
    methods: ["query", "deepResearch", "getRun"],
    summary: "网页搜索、深度研究、来源和运行状态。",
    appResponsibility: "给出业务问题、筛选规则和结果消费方式。",
    limeResponsibility: "统一搜索 provider、来源去重、引用和成本。",
    profile: { adapter: "adapter" },
  },
  {
    name: "lime.documents",
    version: "0.3.0",
    group: "data",
    stage: "preview",
    owner: "tool_runtime",
    methods: ["parse", "export", "transform", "summarize"],
    summary: "PDF、Word、Markdown、PPT 等文档解析、转换和导出。",
    appResponsibility: "定义业务文档类型和结构化落点。",
    limeResponsibility: "执行解析器、格式转换、文件权限和 evidence。",
    profile: { adapter: "adapter" },
  },
  {
    name: "lime.media",
    version: "0.3.0",
    group: "integration",
    stage: "preview",
    owner: "tool_runtime",
    methods: ["generateImage", "editImage", "transcribe", "synthesizeVoice"],
    summary: "图片、音频、语音、视频素材的生成和处理。",
    appResponsibility: "给出业务 brief、尺寸、风格和交付约束。",
    limeResponsibility: "托管媒体 runtime、文件产物、安全策略和成本。",
    profile: { adapter: "adapter" },
  },
  {
    name: "lime.terminal",
    version: "0.3.0",
    group: "integration",
    stage: "preview",
    owner: "tool_runtime",
    methods: ["run", "getRun", "cancel"],
    summary: "命令执行、日志、取消、sandbox 和审批。",
    appResponsibility: "声明命令目的和输入，不能绕过审批。",
    limeResponsibility: "执行 sandbox、approval、日志和危险操作拦截。",
    profile: { adapter: "adapter" },
  },
  {
    name: "lime.tasks",
    version: "0.3.0",
    group: "observability",
    stage: "preview",
    owner: "agent_runtime",
    methods: ["list", "get", "cancel", "subscribe"],
    summary: "跨 App / runtime 的后台任务、队列、状态和订阅。",
    appResponsibility: "展示与本 App 相关的任务，不维护第二套队列。",
    limeResponsibility: "统一任务中心、状态恢复、事件订阅和审计。",
    profile: {},
  },
  {
    name: "lime.settings",
    version: "0.3.0",
    group: "governance",
    stage: "preview",
    owner: "desktop_host",
    methods: ["get", "set", "list"],
    summary: "App 可见设置、workspace overlay 和 tenant 默认值。",
    appResponsibility: "只读或请求修改自己的配置域。",
    limeResponsibility: "统一设置 schema、权限、overlay 和迁移。",
    profile: {},
  },
  {
    name: "lime.workspace",
    version: "0.3.0",
    group: "app_surface",
    stage: "preview",
    owner: "desktop_host",
    methods: ["getCurrent", "list", "open", "getPathRef"],
    summary: "当前 workspace、路径引用、打开入口和工作区上下文。",
    appResponsibility: "围绕当前 workspace 展示业务状态。",
    limeResponsibility: "管理 workspace 身份、路径封装和跨平台兼容。",
    profile: {},
  },
  {
    name: "lime.context",
    version: "0.3.0",
    group: "agent_runtime",
    stage: "preview",
    owner: "agent_runtime",
    methods: ["getSnapshot", "attach", "detach"],
    summary: "会话上下文、选中资源、当前任务和可附加上下文。",
    appResponsibility: "把业务选择显式提交给 runtime。",
    limeResponsibility: "维护 session/thread/turn 上下文和压缩边界。",
    profile: { adapter: "adapter" },
  },
  {
    name: "lime.connectors",
    version: "0.3.0",
    group: "integration",
    stage: "preview",
    owner: "cloud_overlay",
    methods: ["list", "requestAuth", "getStatus", "invoke"],
    summary: "外部系统连接器、授权状态和受控集成调用。",
    appResponsibility: "声明业务连接需求和用户动作。",
    limeResponsibility: "托管 OAuth、secret、tenant policy 和审计。",
    profile: { adapter: "adapter" },
  },
  {
    name: "lime.automation",
    version: "0.3.0",
    group: "agent_runtime",
    stage: "preview",
    owner: "agent_runtime",
    methods: ["startJob", "getJob", "cancelJob"],
    summary: "自动化 job、周期任务和服务型 Skill 编排。",
    appResponsibility: "定义业务触发、输入和终止条件。",
    limeResponsibility: "统一 job runtime、队列、权限、证据和恢复。",
    profile: {},
  },
  {
    name: "lime.review",
    version: "0.3.0",
    group: "governance",
    stage: "preview",
    owner: "policy_runtime",
    methods: ["requestDecision", "submitDecision", "listPending"],
    summary: "人工审核、风险确认、发布门禁和决策记录。",
    appResponsibility: "把审核嵌入业务 UI 并处理拒绝/重试。",
    limeResponsibility: "保留审核证据、权限、审计和发布门禁。",
    profile: {},
  },
] as const satisfies readonly LimeCapabilityDefinition[];

export type LimeCapabilityDefinitionRecord =
  (typeof LIME_CAPABILITY_DEFINITIONS)[number];
export type LimeCapabilityName = LimeCapabilityDefinitionRecord["name"];
export type LimeCapabilityMethodName<Name extends LimeCapabilityName> = Extract<
  LimeCapabilityDefinitionRecord,
  { name: Name }
>["methods"][number];
export type LimeCapabilityAdapterKey<
  Name extends LimeCapabilityName = LimeCapabilityName,
> = Name extends `lime.${infer Key}` ? Key : never;

export const LIME_CAPABILITY_NAMES = LIME_CAPABILITY_DEFINITIONS.map(
  (definition) => definition.name,
) as readonly LimeCapabilityName[];

export const LIME_CAPABILITY_GROUPS = Array.from(
  new Set(LIME_CAPABILITY_DEFINITIONS.map((definition) => definition.group)),
) as readonly LimeCapabilityGroup[];

export function getLimeCapabilityDefinition(
  name: LimeCapabilityName,
): LimeCapabilityDefinitionRecord {
  const definition = LIME_CAPABILITY_DEFINITIONS.find(
    (item) => item.name === name,
  );
  if (!definition) {
    throw new Error(`Unknown Lime capability: ${name}`);
  }
  return definition;
}

export function getLimeCapabilityAdapterKey<Name extends LimeCapabilityName>(
  name: Name,
): LimeCapabilityAdapterKey<Name> {
  return name.slice("lime.".length) as LimeCapabilityAdapterKey<Name>;
}

export function buildLimeCapabilityProfileEntries(
  resolveImplementation?: (
    definition: LimeCapabilityDefinitionRecord,
  ) => CapabilityImplementation | undefined,
): Record<LimeCapabilityName, LimeCapabilityProfileEntry> {
  return Object.fromEntries(
    LIME_CAPABILITY_DEFINITIONS.map((definition) => {
      const implementation = resolveImplementation?.(definition) ?? "none";
      return [
        definition.name,
        {
          version: definition.version,
          enabled: implementation !== "none",
          implementation,
        },
      ];
    }),
  ) as Record<LimeCapabilityName, LimeCapabilityProfileEntry>;
}

export function buildLimeCapabilityProfileEntriesForMode(
  mode: "base" | "mock" | "adapter",
): Record<LimeCapabilityName, LimeCapabilityProfileEntry> {
  if (mode === "base") {
    return buildLimeCapabilityProfileEntries();
  }
  return buildLimeCapabilityProfileEntries((definition) => {
    const profile: LimeCapabilityDefinition["profile"] = definition.profile;
    return profile[mode] ?? "none";
  });
}

export function listEnabledLimeCapabilityNamesForMode(
  mode: "mock" | "adapter",
): LimeCapabilityName[] {
  return LIME_CAPABILITY_DEFINITIONS.filter((definition) => {
    const profile: LimeCapabilityDefinition["profile"] = definition.profile;
    return profile[mode] !== undefined;
  }).map((definition) => definition.name);
}
