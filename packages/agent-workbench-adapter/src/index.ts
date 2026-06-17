import {
  buildAgentCapabilityPolicy,
  resolveAgentCapabilityIds,
  type AgentCapabilityPolicy,
  type AgentPermissionMode,
  type AgentSharedCapabilityId,
} from "@limecloud/agent-capability-catalog";

export type AgentWorkbenchSubmitMode = "start" | "send" | "queue" | "disabled";

export type AgentWorkbenchPurpose =
  | "image"
  | "video"
  | "article"
  | "green-screen"
  | "content-task"
  | "sop"
  | "skill"
  | string;

export type AgentWorkbenchPermissionPreset = "ask" | "auto" | "full" | "custom" | string;

export interface AgentWorkbenchIntentDefinition {
  intentId: string;
  taskKind: string;
  title?: string;
  purpose?: AgentWorkbenchPurpose;
  outputPurpose?: string;
  recommendedSkillSlugs?: readonly string[];
  requiredCapabilities?: readonly string[];
  capabilityHints?: readonly string[];
  allowlist?: readonly string[];
  metadata?: Record<string, unknown>;
}

export interface AgentWorkbenchIntentPolicy extends AgentCapabilityPolicy {
  intentId: string;
  taskKind: string;
}

export interface ResolveAgentWorkbenchIntentPolicyInput {
  intentId: string;
  definitions?: readonly AgentWorkbenchIntentDefinition[];
  selectedSkillSlugs?: readonly string[];
  permissionMode?: AgentPermissionMode;
  fallbackTaskKind?: string;
  fallbackCapabilityHints?: readonly string[];
}

export interface AgentWorkbenchSubmitState {
  view: "entry" | "thread" | string;
  hasActiveSession?: boolean;
  busy?: boolean;
  workspaceReady?: boolean;
  prompt?: string;
}

export interface AgentRuntimeFactLike {
  surface?: string;
  status?: string;
  eventClass?: string;
  source?: {
    eventClass?: string;
  };
}

export interface AgentRuntimeReadModelLike {
  sourceCount?: number;
  events?: readonly AgentRuntimeFactLike[];
  visibleEvents?: readonly AgentRuntimeFactLike[];
  pendingActions?: readonly unknown[];
  artifactRefs?: readonly string[];
  evidenceRefs?: readonly string[];
  taskRefs?: readonly string[];
}

export interface AgentRuntimeFactSummary {
  sourceCount: number;
  toolCount: number;
  pendingActionCount: number;
  artifactCount: number;
  evidenceCount: number;
  taskCount: number;
  hasRuntimeFacts: boolean;
}

export interface AgentWorkbenchSessionLike {
  title?: string;
  status?: string;
  inputSourceIds?: readonly unknown[];
  sourceSnapshots?: readonly unknown[];
}

export type AgentWorkbenchTaskCheckpointState = "done" | "active" | "idle" | "blocked";

export interface AgentWorkbenchTaskCheckpoint {
  id: "input" | "artifact" | "human-action" | "evidence" | string;
  title: string;
  state: AgentWorkbenchTaskCheckpointState;
  count: number;
}

export interface ProjectAgentWorkbenchTaskViewInput {
  session?: AgentWorkbenchSessionLike;
  readModel?: AgentRuntimeReadModelLike;
  runtimeSummary?: AgentRuntimeFactSummary;
  fallbackTitle?: string;
  statusLabel?: string;
  inputAttachmentCount?: number;
  artifactCount?: number;
  activeArtifact?: boolean;
}

export interface AgentWorkbenchTaskView {
  taskTitle: string;
  statusLabel: string;
  sourceCount: number;
  toolCount: number;
  pendingActionCount: number;
  artifactCount: number;
  evidenceCount: number;
  taskCount: number;
  hasRuntimeFacts: boolean;
  shouldShowRuntimePanel: boolean;
  checkpoints: AgentWorkbenchTaskCheckpoint[];
}

export interface ResolveAgentWorkbenchIntentInput extends ResolveAgentWorkbenchIntentPolicyInput {
  fallbackTitle?: string;
  fallbackPurpose?: AgentWorkbenchPurpose;
  fallbackOutputPurpose?: string;
}

export interface AgentWorkbenchIntentDescriptor {
  intentId: string;
  taskKind: string;
  title: string;
  purpose: AgentWorkbenchPurpose;
  outputPurpose: string;
  recommendedSkillSlugs: string[];
  policy: AgentWorkbenchIntentPolicy;
  metadata: Record<string, unknown>;
}

export interface AgentWorkbenchSkillLike {
  slug: string;
  source?: string;
  valid?: boolean;
  metadata?: {
    name?: string;
  };
}

export interface AgentWorkbenchSkillRef {
  slug: string;
  source?: string;
}

export interface ResolveAgentWorkbenchSkillsInput<Skill extends AgentWorkbenchSkillLike> {
  skills: readonly Skill[];
  enabledSkillKeys?: ReadonlySet<string> | readonly string[];
  selectedSkillKeys?: readonly string[];
  intent?: AgentWorkbenchIntentDescriptor | AgentWorkbenchIntentDefinition;
  maxVisible?: number;
  maxRunSkills?: number;
}

export interface AgentWorkbenchSkillSelection<Skill extends AgentWorkbenchSkillLike> {
  visibleSkills: Skill[];
  selectedSkills: Skill[];
  recommendedSkills: Skill[];
  runSkills: Skill[];
  selectedSkillKeys: string[];
  runSkillRefs: AgentWorkbenchSkillRef[];
}

export interface AgentTurnStartPayloadInput {
  agentAppId: string;
  workspacePath: string;
  prompt: string;
  capabilityId?: string;
  workflowId?: string;
  modelId?: string;
  modelPreference?: string;
  providerPreference?: string;
  permissionMode?: AgentPermissionMode;
  selectedSkillSlugs?: readonly string[];
  requiredCapabilities?: readonly string[];
  capabilityHints?: readonly string[];
  tools?: readonly string[];
  metadata?: Record<string, unknown>;
  businessObjectRef?: unknown;
  input?: Record<string, unknown>;
  allowlist?: readonly string[];
}

export interface AgentTurnStartPayload {
  agentAppId: string;
  taskId?: string;
  prompt: string;
  input?: Record<string, unknown>;
  runtimeOptions: {
    capabilityId: string;
    workflowId?: string;
    modelId?: string;
    modelPreference?: string;
    permissionMode: AgentPermissionMode;
    providerPreference?: string;
    requiredCapabilities: AgentSharedCapabilityId[];
    capabilityHints: AgentSharedCapabilityId[];
  };
  modelPolicy: {
    preferredModelId?: string;
    capability: "agent";
  };
  toolPolicy: AgentCapabilityPolicy;
  metadata: Record<string, unknown>;
  businessObjectRef?: unknown;
}

export interface AgentWorkbenchSessionStartInput {
  intentId: string;
  prompt: string;
  selectedSkillSlugs?: readonly string[];
  permissionPreset?: AgentWorkbenchPermissionPreset;
  definitions?: readonly AgentWorkbenchIntentDefinition[];
  fallbackTaskKind?: string;
  fallbackTitle?: string;
  fallbackPurpose?: AgentWorkbenchPurpose;
  fallbackOutputPurpose?: string;
  fallbackCapabilityHints?: readonly string[];
  allowlist?: readonly string[];
}

export interface AgentWorkbenchSessionStartRequest {
  title: string;
  purpose: AgentWorkbenchPurpose;
  userIntent: string;
  selectedSkillSlugs: string[];
  requiredCapabilities: AgentSharedCapabilityId[];
  capabilityHints: AgentSharedCapabilityId[];
  agentTaskKind: string;
  agentIntentId: string;
  permissionMode: AgentPermissionMode;
  metadata: Record<string, unknown>;
}

export const DEFAULT_AGENT_WORKBENCH_INTENTS: readonly AgentWorkbenchIntentDefinition[] = [
  {
    intentId: "guide",
    taskKind: "agent.guided-help",
    title: "内容协作",
    purpose: "content-task",
    outputPurpose: "内容协作",
    capabilityHints: ["summary"],
  },
  {
    intentId: "research",
    taskKind: "content.research",
    title: "资料研究协作",
    purpose: "content-task",
    outputPurpose: "资料研究",
    requiredCapabilities: ["research"],
    capabilityHints: ["summary", "pdf"],
  },
  {
    intentId: "breakdown",
    taskKind: "content.material-breakdown",
    title: "素材拆解协作",
    purpose: "content-task",
    outputPurpose: "拆解报告 / Prompt",
    requiredCapabilities: ["summary"],
    capabilityHints: ["research", "pdf"],
  },
  {
    intentId: "scenePrompt",
    taskKind: "content.image-prompt",
    title: "图片 Prompt 协作",
    purpose: "image",
    outputPurpose: "图片 Prompt",
    capabilityHints: ["image", "summary"],
  },
  {
    intentId: "imageGenerate",
    taskKind: "content.image-generate",
    title: "图片 Prompt 协作",
    purpose: "image",
    outputPurpose: "图片 Prompt",
    requiredCapabilities: ["image"],
    capabilityHints: ["cover"],
  },
  {
    intentId: "videoPrompt",
    taskKind: "content.video-prompt",
    title: "图生视频 Prompt 协作",
    purpose: "video",
    outputPurpose: "视频 Prompt",
    capabilityHints: ["video", "summary"],
  },
  {
    intentId: "videoGenerate",
    taskKind: "content.video-generate",
    title: "视频生成协作",
    purpose: "video",
    outputPurpose: "视频生成任务",
    requiredCapabilities: ["video"],
  },
  {
    intentId: "article",
    taskKind: "content.copy-generate",
    title: "文章生成协作",
    purpose: "article",
    outputPurpose: "文章草稿",
    recommendedSkillSlugs: ["copywriting-master", "article-typesetting-master"],
    capabilityHints: ["research", "summary", "pdf"],
  },
  {
    intentId: "articleTitle",
    taskKind: "content.title-generate",
    title: "标题矩阵协作",
    purpose: "article",
    outputPurpose: "标题矩阵",
    recommendedSkillSlugs: ["copywriting-master", "moments-copywriter"],
    capabilityHints: ["summary", "research"],
  },
  {
    intentId: "articleScript",
    taskKind: "content.script-generate",
    title: "脚本生成协作",
    purpose: "article",
    outputPurpose: "脚本草稿",
    recommendedSkillSlugs: ["copywriting-master", "moments-copywriter", "ip-knowledge-base-builder"],
    capabilityHints: ["summary", "video"],
  },
  {
    intentId: "greenScreen",
    taskKind: "content.green-screen-copy",
    title: "绿幕文案图协作",
    purpose: "green-screen",
    outputPurpose: "绿幕文案图",
    capabilityHints: ["image", "summary"],
  },
  {
    intentId: "assets",
    taskKind: "content.asset-ingest",
    title: "素材入库说明协作",
    purpose: "content-task",
    outputPurpose: "素材入库说明",
    capabilityHints: ["summary", "pdf", "image"],
  },
];

function uniqueStrings(values: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean)));
}

function definitionForIntent(
  intentId: string,
  definitions: readonly AgentWorkbenchIntentDefinition[],
): AgentWorkbenchIntentDefinition | undefined {
  return definitions.find((definition) => definition.intentId === intentId);
}

export function agentWorkbenchSkillKey(skill: AgentWorkbenchSkillLike | AgentWorkbenchSkillRef): string {
  return `${skill.source ?? ""}:${skill.slug}`;
}

export function agentWorkbenchSkillMatchesSlug(skill: AgentWorkbenchSkillLike, slug: string): boolean {
  return skill.slug === slug || skill.metadata?.name === slug;
}

function enabledSkillKeySet(values: ReadonlySet<string> | readonly string[] | undefined): ReadonlySet<string> | undefined {
  if (!values) return undefined;
  return values instanceof Set ? values : new Set(values);
}

function recommendedSkillSlugs(intent?: AgentWorkbenchIntentDescriptor | AgentWorkbenchIntentDefinition): readonly string[] {
  return intent && "policy" in intent
    ? intent.recommendedSkillSlugs
    : intent?.recommendedSkillSlugs ?? [];
}

export function resolveAgentWorkbenchIntentDescriptor(
  input: ResolveAgentWorkbenchIntentInput,
): AgentWorkbenchIntentDescriptor {
  const definitions = input.definitions ?? DEFAULT_AGENT_WORKBENCH_INTENTS;
  const definition = definitionForIntent(input.intentId, definitions);
  const policy = resolveWorkbenchIntentCapabilityPolicy(input);
  const title = definition?.title ?? input.fallbackTitle ?? "Agent 协作";
  const purpose = definition?.purpose ?? input.fallbackPurpose ?? "content-task";
  const outputPurpose = definition?.outputPurpose ?? input.fallbackOutputPurpose ?? title;
  const metadata = {
    intentId: policy.intentId,
    taskKind: policy.taskKind,
    title,
    purpose,
    outputPurpose,
    recommendedSkillSlugs: [...(definition?.recommendedSkillSlugs ?? [])],
    ...(definition?.metadata ?? {}),
  };
  return {
    intentId: policy.intentId,
    taskKind: policy.taskKind,
    title,
    purpose,
    outputPurpose,
    recommendedSkillSlugs: uniqueStrings(definition?.recommendedSkillSlugs),
    policy: {
      ...policy,
      metadata: {
        ...policy.metadata,
        ...metadata,
      },
    },
    metadata,
  };
}

export function resolveAgentWorkbenchSkills<Skill extends AgentWorkbenchSkillLike>(
  input: ResolveAgentWorkbenchSkillsInput<Skill>,
): AgentWorkbenchSkillSelection<Skill> {
  const enabledKeys = enabledSkillKeySet(input.enabledSkillKeys);
  const selectedKeys = new Set(input.selectedSkillKeys ?? []);
  const recommendedSlugs = recommendedSkillSlugs(input.intent);
  const visibleSkills = [...input.skills]
    .filter((skill) => skill.valid !== false)
    .sort((a, b) => {
      const aRecommended = recommendedSlugs.some((slug) => agentWorkbenchSkillMatchesSlug(a, slug));
      const bRecommended = recommendedSlugs.some((slug) => agentWorkbenchSkillMatchesSlug(b, slug));
      const aEnabled = enabledKeys ? enabledKeys.has(agentWorkbenchSkillKey(a)) : true;
      const bEnabled = enabledKeys ? enabledKeys.has(agentWorkbenchSkillKey(b)) : true;
      return Number(!aRecommended) - Number(!bRecommended)
        || Number(!aEnabled) - Number(!bEnabled)
        || a.slug.localeCompare(b.slug);
    })
    .slice(0, input.maxVisible ?? 18);
  const selectedSkills = visibleSkills.filter((skill) => selectedKeys.has(agentWorkbenchSkillKey(skill)));
  const defaultSelectedSkills = visibleSkills
    .filter((skill) => enabledKeys ? enabledKeys.has(agentWorkbenchSkillKey(skill)) : true)
    .slice(0, input.maxRunSkills ?? 6);
  const effectiveSelectedSkills = selectedSkills.length ? selectedSkills : defaultSelectedSkills;
  const recommendedSkills = visibleSkills.filter((skill) =>
    recommendedSlugs.some((slug) => agentWorkbenchSkillMatchesSlug(skill, slug)),
  );
  const byKey = new Map<string, Skill>();
  [...recommendedSkills, ...effectiveSelectedSkills].forEach((skill) => byKey.set(agentWorkbenchSkillKey(skill), skill));
  const runSkills = [...byKey.values()].slice(0, input.maxRunSkills ?? 6);
  return {
    visibleSkills,
    selectedSkills: effectiveSelectedSkills,
    recommendedSkills,
    runSkills,
    selectedSkillKeys: effectiveSelectedSkills.map(agentWorkbenchSkillKey),
    runSkillRefs: runSkills.map((skill) => ({ slug: skill.slug, source: skill.source })),
  };
}

export function resolveWorkbenchIntentCapabilityPolicy(
  input: ResolveAgentWorkbenchIntentPolicyInput,
): AgentWorkbenchIntentPolicy {
  const definition = definitionForIntent(input.intentId, input.definitions ?? DEFAULT_AGENT_WORKBENCH_INTENTS);
  const taskKind = definition?.taskKind ?? input.fallbackTaskKind ?? "agent.workbench";
  const requiredCapabilities = resolveAgentCapabilityIds(definition?.requiredCapabilities);
  const capabilityHints = resolveAgentCapabilityIds([
    ...(definition?.capabilityHints ?? []),
    ...(input.fallbackCapabilityHints ?? []),
  ]);
  return {
    intentId: input.intentId,
    taskKind,
    ...buildAgentCapabilityPolicy({
      selectedSkillSlugs: input.selectedSkillSlugs,
      permissionMode: input.permissionMode,
      requiredCapabilities,
      capabilityHints,
      allowlist: definition?.allowlist,
      metadata: {
        taskKind,
        intentId: input.intentId,
        ...(definition?.metadata ?? {}),
      },
    }),
  };
}

export function resolveAgentWorkbenchPermissionMode(
  preset: AgentWorkbenchPermissionPreset | undefined,
): AgentPermissionMode {
  if (preset === "auto") return "safe";
  if (preset === "full") return "allow-all";
  if (preset === "ask" || preset === "custom") return "ask";
  return preset?.trim() || "ask";
}

export function resolveWorkbenchSubmitMode(state: AgentWorkbenchSubmitState): AgentWorkbenchSubmitMode {
  if (!state.workspaceReady || !state.prompt?.trim()) return "disabled";
  if (state.view === "thread" && state.hasActiveSession) return state.busy ? "queue" : "send";
  if (state.view === "thread" && !state.hasActiveSession) return "disabled";
  return state.busy ? "disabled" : "start";
}

export function summarizeAgentRuntimeFacts(readModel: AgentRuntimeReadModelLike, extra?: {
  artifactCount?: number;
}): AgentRuntimeFactSummary {
  const events = readModel.events ?? [];
  const toolCount = events.filter((event) => {
    const eventClass = event.eventClass ?? event.source?.eventClass ?? "";
    return event.surface === "tool" || eventClass.startsWith("tool.");
  }).length;
  const sourceCount = readModel.sourceCount ?? 0;
  const pendingActionCount = readModel.pendingActions?.length ?? 0;
  const artifactCount = (readModel.artifactRefs?.length ?? 0) + (extra?.artifactCount ?? 0);
  const evidenceCount = readModel.evidenceRefs?.length ?? 0;
  const taskCount = readModel.taskRefs?.length ?? 0;
  return {
    sourceCount,
    toolCount,
    pendingActionCount,
    artifactCount,
    evidenceCount,
    taskCount,
    hasRuntimeFacts: Boolean(
      sourceCount ||
      toolCount ||
      pendingActionCount ||
      artifactCount ||
      evidenceCount ||
      taskCount ||
      events.length
    ),
  };
}

export function agentWorkbenchSessionStatusLabel(status?: string): string {
  if (status === "waiting-user") return "待补充";
  if (status === "draft-created") return "已出草稿";
  if (status === "blocked") return "待配置";
  if (status === "closed") return "已关闭";
  if (status === "active") return "协作中";
  return status?.trim() || "待启动";
}

function sessionSourceCount(session?: AgentWorkbenchSessionLike): number {
  return session?.sourceSnapshots?.length ?? session?.inputSourceIds?.length ?? 0;
}

export function hasAgentWorkbenchRuntimeFacts(
  readModel: AgentRuntimeReadModelLike,
  summary: AgentRuntimeFactSummary = summarizeAgentRuntimeFacts(readModel),
): boolean {
  if (summary.sourceCount || summary.toolCount || summary.pendingActionCount || summary.artifactCount) {
    return true;
  }

  const events = readModel.visibleEvents ?? readModel.events ?? [];
  return events.some((event) => {
    const eventClass = event.eventClass ?? event.source?.eventClass ?? "";
    return event.surface === "tool" ||
      event.surface === "human-action" ||
      event.status === "failed" ||
      event.status === "blocked" ||
      eventClass.startsWith("tool.") ||
      eventClass.startsWith("action.");
  });
}

export function projectAgentWorkbenchTaskView(
  input: ProjectAgentWorkbenchTaskViewInput,
): AgentWorkbenchTaskView {
  const readModel = input.readModel ?? {};
  const runtimeSummary = input.runtimeSummary ?? summarizeAgentRuntimeFacts(readModel, {
    artifactCount: input.artifactCount,
  });
  const sourceCount = runtimeSummary.sourceCount + sessionSourceCount(input.session) + (input.inputAttachmentCount ?? 0);
  const artifactCount = runtimeSummary.artifactCount + (input.activeArtifact && runtimeSummary.artifactCount === 0 ? 1 : 0);
  const pendingActionCount = runtimeSummary.pendingActionCount;
  const evidenceCount = runtimeSummary.evidenceCount;
  const hasRuntimeFacts = Boolean(
    runtimeSummary.hasRuntimeFacts ||
    sourceCount ||
    artifactCount ||
    pendingActionCount ||
    evidenceCount,
  );

  return {
    taskTitle: input.session?.title?.trim() || input.fallbackTitle?.trim() || "Agent 协作",
    statusLabel: input.statusLabel ?? agentWorkbenchSessionStatusLabel(input.session?.status),
    sourceCount,
    toolCount: runtimeSummary.toolCount,
    pendingActionCount,
    artifactCount,
    evidenceCount,
    taskCount: runtimeSummary.taskCount,
    hasRuntimeFacts,
    shouldShowRuntimePanel: hasRuntimeFacts,
    checkpoints: [
      {
        id: "input",
        title: "读取需求与输入源",
        state: sourceCount > 0 || input.session ? "done" : "idle",
        count: sourceCount,
      },
      {
        id: "artifact",
        title: "生成可审核草稿",
        state: artifactCount > 0 || input.activeArtifact ? "done" : input.session?.status === "active" ? "active" : "idle",
        count: artifactCount,
      },
      {
        id: "human-action",
        title: "等待人工确认",
        state: pendingActionCount > 0 ? "active" : input.session?.status === "blocked" ? "blocked" : "idle",
        count: pendingActionCount,
      },
      {
        id: "evidence",
        title: "沉淀证据与交付记录",
        state: evidenceCount > 0 ? "done" : artifactCount > 0 ? "active" : "idle",
        count: evidenceCount,
      },
    ],
  };
}

export function buildAgentTurnStartPayload(input: AgentTurnStartPayloadInput): AgentTurnStartPayload {
  const toolPolicy = buildAgentCapabilityPolicy({
    selectedSkillSlugs: input.selectedSkillSlugs,
    permissionMode: input.permissionMode,
    requiredCapabilities: input.requiredCapabilities,
    capabilityHints: input.capabilityHints,
    tools: input.tools,
    allowlist: input.allowlist,
    metadata: input.metadata,
  });
  const metadata = {
    workspacePath: input.workspacePath,
    selectedSkillSlugs: toolPolicy.selectedSkillSlugs,
    requiredCapabilities: toolPolicy.requiredCapabilities,
    capabilityHints: toolPolicy.capabilityHints,
    toolHints: toolPolicy.toolHints,
    capabilityContracts: toolPolicy.metadata.capabilityContracts,
    ...(input.metadata ?? {}),
  };
  return {
    agentAppId: input.agentAppId,
    taskId: input.workflowId,
    prompt: input.prompt,
    input: input.input,
    runtimeOptions: {
      capabilityId: input.capabilityId ?? "content.draft.generate",
      workflowId: input.workflowId,
      modelId: input.modelId,
      modelPreference: input.modelPreference ?? input.modelId,
      permissionMode: input.permissionMode ?? "ask",
      providerPreference: input.providerPreference,
      requiredCapabilities: toolPolicy.requiredCapabilities,
      capabilityHints: toolPolicy.capabilityHints,
    },
    modelPolicy: {
      preferredModelId: input.modelId,
      capability: "agent",
    },
    toolPolicy,
    metadata,
    businessObjectRef: input.businessObjectRef,
  };
}

export function buildAgentWorkbenchSessionStartRequest(
  input: AgentWorkbenchSessionStartInput,
): AgentWorkbenchSessionStartRequest {
  const descriptor = resolveAgentWorkbenchIntentDescriptor({
    intentId: input.intentId,
    definitions: input.definitions,
    selectedSkillSlugs: input.selectedSkillSlugs,
    permissionMode: resolveAgentWorkbenchPermissionMode(input.permissionPreset),
    fallbackTaskKind: input.fallbackTaskKind,
    fallbackTitle: input.fallbackTitle,
    fallbackPurpose: input.fallbackPurpose,
    fallbackOutputPurpose: input.fallbackOutputPurpose,
    fallbackCapabilityHints: input.fallbackCapabilityHints,
  });
  const policy = input.allowlist
    ? buildAgentCapabilityPolicy({
      requiredCapabilities: descriptor.policy.requiredCapabilities,
      capabilityHints: descriptor.policy.capabilityHints,
      selectedSkillSlugs: input.selectedSkillSlugs,
      permissionMode: descriptor.policy.permissionMode,
      allowlist: input.allowlist,
    })
    : descriptor.policy;
  return {
    title: descriptor.title,
    purpose: descriptor.purpose,
    userIntent: input.prompt.trim(),
    selectedSkillSlugs: uniqueStrings(input.selectedSkillSlugs),
    requiredCapabilities: policy.requiredCapabilities,
    capabilityHints: policy.capabilityHints,
    agentTaskKind: descriptor.taskKind,
    agentIntentId: descriptor.intentId,
    permissionMode: policy.permissionMode,
    metadata: descriptor.metadata,
  };
}
