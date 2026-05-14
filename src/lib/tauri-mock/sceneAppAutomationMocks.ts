import type { AutomationJobRecord } from "../api/automation";
import type { AgentRun } from "../api/executionRun";
import type {
  SceneAppCatalog,
  SceneAppContextOverlay,
  SceneAppDescriptor,
  SceneAppPlanResult,
  SceneAppProjectPackPlan,
  SceneAppRuntimeAdapterPlan,
  SceneAppScorecard,
} from "../api/sceneapp";
import {
  configureBrowserMocks,
  launchMockBrowserSession,
} from "./browserMocks";

type MockPersistedSceneAppContext = {
  sceneappId: string;
  workspaceId?: string | null;
  projectId?: string | null;
  referenceItems: SceneAppContextOverlay["snapshot"]["referenceItems"];
  tasteProfile?: SceneAppContextOverlay["snapshot"]["tasteProfile"];
};

type MockReferenceMemoryFixture = {
  label: string;
  summary: string;
  contentType: string;
  uri?: string | null;
};

const mockSceneAppContextStore = new Map<
  string,
  MockPersistedSceneAppContext
>();

const MOCK_SCENEAPP_REFERENCE_MEMORY_FIXTURES: Record<
  string,
  MockReferenceMemoryFixture
> = {
  "memory-1": {
    label: "夏日短视频语气",
    summary: "轻盈、结论前置、快节奏。",
    contentType: "style_memory",
  },
  "memory-2": {
    label: "爆款封面参考",
    summary: "高对比标题、近景主体、首屏即给结论。",
    contentType: "reference_memory",
  },
  "memory-3": {
    label: "避免拖沓开场",
    summary: "前三秒不要铺垫过长，直接进入核心卖点。",
    contentType: "preference_memory",
  },
};

const now = () => new Date().toISOString();

const mockAutomationJobs: AutomationJobRecord[] = [
  {
    id: "automation-job-daily-brief",
    name: "每日线索巡检",
    description: "在品牌工作区中汇总前一日线索、风险和待处理事项",
    enabled: true,
    workspace_id: "workspace-default",
    execution_mode: "intelligent",
    schedule: { kind: "every", every_secs: 1800 },
    payload: {
      kind: "agent_turn",
      prompt:
        "汇总最近 24 小时的重要线索、待回复事项和高风险异常，输出一个给运营负责人的简报。",
      system_prompt: "优先给出结论和下一步动作。",
      web_search: false,
    },
    delivery: {
      mode: "none",
      channel: null,
      target: null,
      best_effort: true,
      output_schema: "text",
      output_format: "text",
    },
    timeout_secs: 300,
    max_retries: 3,
    next_run_at: now(),
    last_status: "success",
    last_error: null,
    last_run_at: now(),
    last_finished_at: now(),
    running_started_at: null,
    consecutive_failures: 0,
    last_retry_count: 0,
    auto_disabled_until: null,
    last_delivery: null,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "automation-job-browser-check",
    name: "店铺后台浏览器巡检",
    description: "按固定资料和环境预设启动浏览器会话，供后续任务接管或人工排查",
    enabled: true,
    workspace_id: "workspace-default",
    execution_mode: "intelligent",
    schedule: { kind: "every", every_secs: 900 },
    payload: {
      kind: "browser_session",
      profile_id: "browser-profile-general",
      profile_key: "general_browser_assist",
      url: "https://www.google.com/",
      environment_preset_id: "browser-environment-us-desktop",
      target_id: null,
      open_window: false,
      stream_mode: "events",
    },
    delivery: {
      mode: "none",
      channel: null,
      target: null,
      best_effort: true,
      output_schema: "text",
      output_format: "text",
    },
    timeout_secs: 180,
    max_retries: 2,
    next_run_at: now(),
    last_status: null,
    last_error: null,
    last_run_at: null,
    last_finished_at: null,
    running_started_at: null,
    consecutive_failures: 0,
    last_retry_count: 0,
    auto_disabled_until: null,
    last_delivery: {
      success: false,
      message: "写入本地文件失败: permission denied",
      channel: "local_file",
      target: "/tmp/lime/browser-output.json",
      output_kind: "json",
      output_schema: "json",
      output_format: "json",
      output_preview: '{\n  "session_id": "browser-session-1"\n}',
      attempted_at: now(),
    },
    created_at: now(),
    updated_at: now(),
  },
];

const mockAutomationRuns: AgentRun[] = [
  {
    id: "automation-run-1",
    source: "automation",
    source_ref: "automation-job-daily-brief",
    session_id: "session-automation-1",
    status: "success",
    started_at: now(),
    finished_at: now(),
    duration_ms: 1820,
    error_code: null,
    error_message: null,
    metadata: JSON.stringify({
      job_name: "每日线索巡检",
      workspace_id: "workspace-default",
    }),
    created_at: now(),
    updated_at: now(),
  },
];

const mockSceneAppCatalog: SceneAppCatalog = {
  version: "2026-04-15",
  generatedAt: "2026-04-15T00:00:00.000Z",
  items: [
    {
      id: "story-video-suite",
      title: "短视频编排",
      summary: "把文本、线框图、配乐、剧本和短视频草稿收口成一条多模态结果链。",
      category: "Scene Apps",
      sceneappType: "hybrid",
      patternPrimary: "pipeline",
      patternStack: ["pipeline", "inversion", "generator", "reviewer"],
      capabilityRefs: [
        "agent_turn",
        "native_skill",
        "workspace_storage",
        "artifact_viewer",
      ],
      infraProfile: [
        "composition_blueprint",
        "project_pack",
        "workspace_storage",
        "agent_turn",
        "timeline",
      ],
      deliveryContract: "project_pack",
      artifactKind: "artifact_bundle",
      outputHint: "短视频项目包",
      deliveryProfile: {
        artifactProfileRef: "story-video-artifacts",
        viewerKind: "artifact_bundle",
        requiredParts: [
          "brief",
          "storyboard",
          "script",
          "music_refs",
          "video_draft",
          "review_note",
        ],
        primaryPart: "brief",
      },
      compositionProfile: {
        blueprintRef: "story-video-blueprint",
        stepCount: 6,
        steps: [
          {
            id: "brief",
            order: 1,
            bindingProfileRef: "story-video-native-binding",
            bindingFamily: "native_skill",
          },
          {
            id: "storyboard",
            order: 2,
            bindingProfileRef: "story-video-native-binding",
            bindingFamily: "native_skill",
          },
          {
            id: "script",
            order: 3,
            bindingProfileRef: "story-video-native-binding",
            bindingFamily: "native_skill",
          },
          {
            id: "music_refs",
            order: 4,
            bindingProfileRef: "story-video-cloud-binding",
            bindingFamily: "agent_turn",
          },
          {
            id: "video_draft",
            order: 5,
            bindingProfileRef: "story-video-cloud-binding",
            bindingFamily: "agent_turn",
          },
          {
            id: "review_note",
            order: 6,
            bindingProfileRef: "story-video-native-binding",
            bindingFamily: "native_skill",
          },
        ],
      },
      scorecardProfile: {
        profileRef: "story-video-scorecard",
        metricKeys: [
          "complete_pack_rate",
          "review_pass_rate",
          "publish_conversion_rate",
        ],
        failureSignals: [
          "pack_incomplete",
          "review_blocked",
          "publish_stalled",
        ],
      },
      entryBindings: [
        {
          kind: "service_skill",
          bindingFamily: "agent_turn",
          serviceSkillId: "sceneapp-service-story-video",
          skillKey: "story-video-suite",
          aliases: ["story-video", "mv-pipeline"],
        },
        {
          kind: "scene",
          bindingFamily: "agent_turn",
          sceneKey: "story-video-suite",
          commandPrefix: "/story-video-suite",
          aliases: ["story-video-scene"],
        },
      ],
      launchRequirements: [
        {
          kind: "user_input",
          message: "需要主题、风格或脚本线索作为场景输入。",
        },
        {
          kind: "project",
          message: "需要项目目录承接线框图、脚本和媒体结果。",
        },
      ],
      linkedServiceSkillId: "sceneapp-service-story-video",
      linkedSceneKey: "story-video-suite",
      aliases: ["story-video", "mv-pipeline", "short-video-suite"],
      sourcePackageId: "lime-core-sceneapps",
      sourcePackageVersion: "2026-04-15",
    },
    {
      id: "x-article-export",
      title: "网页导出",
      summary:
        "在真实浏览器上下文中抓取网页正文、图片与元信息，并沉淀为项目内 Markdown 资料包。",
      category: "Scene Apps",
      sceneappType: "browser_grounded",
      patternPrimary: "pipeline",
      patternStack: ["pipeline", "tool_wrapper", "generator", "inversion"],
      capabilityRefs: [
        "browser_assist",
        "workspace_storage",
        "artifact_viewer",
      ],
      infraProfile: [
        "browser_connector",
        "site_adapter",
        "workspace_storage",
        "artifact_bundle",
      ],
      deliveryContract: "project_pack",
      artifactKind: "document",
      outputHint: "网页资料包",
      deliveryProfile: {
        artifactProfileRef: "article-export-artifacts",
        viewerKind: "document",
        requiredParts: ["index.md", "meta.json"],
        primaryPart: "index.md",
      },
      scorecardProfile: {
        profileRef: "article-export-scorecard",
        metricKeys: ["success_rate", "reuse_rate"],
        failureSignals: ["pack_incomplete"],
      },
      entryBindings: [
        {
          kind: "service_skill",
          bindingFamily: "browser_assist",
          serviceSkillId: "sceneapp-service-article-export",
          skillKey: "x-article-export",
          aliases: ["article-export"],
        },
      ],
      launchRequirements: [
        {
          kind: "browser_session",
          message: "需要真实网页上下文或浏览器附着会话。",
        },
        {
          kind: "project",
          message: "需要项目目录来保存 Markdown 与图片资源。",
        },
      ],
      linkedServiceSkillId: "sceneapp-service-article-export",
      linkedSceneKey: "x-article-export",
      aliases: ["article-export", "web-article-export"],
      sourcePackageId: "lime-core-sceneapps",
      sourcePackageVersion: "2026-04-15",
    },
    {
      id: "daily-trend-briefing",
      title: "每日趋势摘要",
      summary:
        "把研究主题转成可持续运行的本地 durable 场景，并定时回流结果和失败原因。",
      category: "Scene Apps",
      sceneappType: "local_durable",
      patternPrimary: "pipeline",
      patternStack: ["pipeline", "reviewer"],
      capabilityRefs: ["automation_job", "workspace_storage", "timeline"],
      infraProfile: ["automation_schedule", "db_store", "json_snapshot"],
      deliveryContract: "table_report",
      artifactKind: "table_report",
      outputHint: "趋势摘要",
      deliveryProfile: {
        artifactProfileRef: "daily-trend-artifacts",
        viewerKind: "table_report",
        requiredParts: ["brief", "review_note"],
        primaryPart: "brief",
      },
      scorecardProfile: {
        profileRef: "daily-trend-scorecard",
        metricKeys: ["success_rate", "reuse_rate"],
        failureSignals: ["automation_timeout"],
      },
      entryBindings: [
        {
          kind: "service_skill",
          bindingFamily: "automation_job",
          serviceSkillId: "sceneapp-service-daily-trend",
          skillKey: "daily-trend-briefing",
          aliases: ["trend-briefing", "growth-monitor"],
        },
      ],
      launchRequirements: [
        {
          kind: "project",
          message: "需要工作区或项目目录保存运行历史与结果快照。",
        },
        {
          kind: "automation",
          message: "需要可用的自动化调度能力。",
        },
      ],
      linkedServiceSkillId: "sceneapp-service-daily-trend",
      linkedSceneKey: "daily-trend-briefing",
      aliases: ["trend-briefing", "growth-monitor"],
      sourcePackageId: "lime-core-sceneapps",
      sourcePackageVersion: "2026-04-15",
    },
  ],
};

function findMockSceneAppDescriptor(id?: string): SceneAppDescriptor | null {
  if (!id) {
    return null;
  }
  const normalized = id.trim();
  return (
    mockSceneAppCatalog.items.find(
      (item) =>
        item.id === normalized ||
        item.linkedSceneKey === normalized ||
        item.linkedServiceSkillId === normalized ||
        item.aliases?.includes(normalized),
    ) ?? null
  );
}

function extractMockSceneAppUrlCandidate(text?: string): string | undefined {
  if (typeof text !== "string") {
    return undefined;
  }

  return text
    .split(/\s+/)
    .find(
      (segment) =>
        segment.startsWith("http://") || segment.startsWith("https://"),
    )
    ?.replace(/["')\]},.>，。）]+$/g, "");
}

function normalizeMockSceneAppOptionalId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

function resolveMockSceneAppWorkspaceId(intent: Record<string, unknown>) {
  return (
    normalizeMockSceneAppOptionalId(intent.workspaceId) ??
    normalizeMockSceneAppOptionalId(intent.workspace_id)
  );
}

function resolveMockSceneAppProjectId(intent: Record<string, unknown>) {
  return (
    normalizeMockSceneAppOptionalId(intent.projectId) ??
    normalizeMockSceneAppOptionalId(intent.project_id)
  );
}

function resolveMockSceneAppUserInput(intent: Record<string, unknown>) {
  if (typeof intent.userInput === "string" && intent.userInput.trim()) {
    return intent.userInput.trim();
  }
  if (typeof intent.user_input === "string" && intent.user_input.trim()) {
    return intent.user_input.trim();
  }
  return "";
}

function resolveMockSceneAppSlots(intent: Record<string, unknown>) {
  return intent.slots && typeof intent.slots === "object"
    ? (intent.slots as Record<string, unknown>)
    : {};
}

function resolveMockSceneAppRuntimeContext(intent: Record<string, unknown>) {
  if (intent.runtimeContext && typeof intent.runtimeContext === "object") {
    return intent.runtimeContext as Record<string, unknown>;
  }
  if (intent.runtime_context && typeof intent.runtime_context === "object") {
    return intent.runtime_context as Record<string, unknown>;
  }
  return {};
}

function resolveMockSceneAppReferenceMemoryIds(
  intent: Record<string, unknown>,
) {
  const result: string[] = [];
  for (const candidate of [
    intent.referenceMemoryIds,
    intent.reference_memory_ids,
  ]) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    for (const value of candidate) {
      if (typeof value !== "string") {
        continue;
      }
      const normalized = value.trim();
      if (!normalized || result.includes(normalized)) {
        continue;
      }
      result.push(normalized);
    }
  }
  return result;
}

function resolveMockSceneAppContextStoreKey(
  sceneappId: string,
  intent: Record<string, unknown>,
): string | null {
  const projectId = resolveMockSceneAppProjectId(intent);
  const workspaceId = resolveMockSceneAppWorkspaceId(intent);
  const scopeId = projectId ?? workspaceId;
  if (!scopeId) {
    return null;
  }
  return `${sceneappId.trim()}::${scopeId}`;
}

function pushUniqueMock(values: string[], value?: string | null) {
  if (typeof value !== "string") {
    return;
  }
  const normalized = value.trim();
  if (!normalized || values.includes(normalized)) {
    return;
  }
  values.push(normalized);
}

function truncateMockSceneAppSummary(value: string, maxChars: number) {
  const trimmed = value.trim();
  const chars = Array.from(trimmed);
  if (chars.length <= maxChars) {
    return trimmed;
  }
  return `${chars.slice(0, maxChars).join("")}…`;
}

function stableMockSceneAppReferenceItemId(
  prefix: string,
  key: string,
  value: string,
) {
  let hash = 2166136261;
  for (const ch of `${prefix}:${key}:${value.trim()}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${key}-${(hash >>> 0).toString(16)}`;
}

function buildMockSceneAppExplicitReferenceItems(
  intent: Record<string, unknown>,
) {
  return resolveMockSceneAppReferenceMemoryIds(intent).flatMap((memoryId) => {
    const fixture = MOCK_SCENEAPP_REFERENCE_MEMORY_FIXTURES[memoryId];
    if (!fixture) {
      return [];
    }
    return [
      {
        id: `memory:${memoryId}`,
        label: fixture.label,
        sourceKind: "reference_library" as const,
        contentType: fixture.contentType,
        uri: fixture.uri ?? null,
        summary: fixture.summary,
        selected: true,
      },
    ];
  });
}

function buildMockSceneAppInputReferenceItems(intent: Record<string, unknown>) {
  const items = [] as NonNullable<
    SceneAppContextOverlay["snapshot"]["referenceItems"]
  >;
  const userInput = resolveMockSceneAppUserInput(intent);
  if (userInput) {
    const userInputUrl = extractMockSceneAppUrlCandidate(userInput);
    items.push({
      id: stableMockSceneAppReferenceItemId("user-input", "input", userInput),
      label: "用户输入",
      sourceKind: "user_input",
      contentType: userInputUrl ? "url" : "text",
      uri: userInputUrl ?? null,
      summary: truncateMockSceneAppSummary(userInput, 80),
      selected: true,
    });
  }

  const slots = resolveMockSceneAppSlots(intent);
  for (const [key, rawValue] of Object.entries(slots)) {
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      continue;
    }
    const slotUrl = extractMockSceneAppUrlCandidate(rawValue);
    items.push({
      id: stableMockSceneAppReferenceItemId("slot", key, rawValue.trim()),
      label: key,
      sourceKind: "slot",
      contentType: slotUrl ? "url" : "slot",
      uri: slotUrl ?? null,
      summary: truncateMockSceneAppSummary(rawValue, 80),
      selected: true,
    });
  }

  return items;
}

function mergeMockSceneAppReferenceItems(
  explicitItems: NonNullable<
    SceneAppContextOverlay["snapshot"]["referenceItems"]
  >,
  inputItems: NonNullable<SceneAppContextOverlay["snapshot"]["referenceItems"]>,
  persistedContext?: MockPersistedSceneAppContext | null,
) {
  const seen = new Set<string>();
  const merged = [] as NonNullable<
    SceneAppContextOverlay["snapshot"]["referenceItems"]
  >;

  for (const item of explicitItems) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    merged.push(item);
  }

  for (const item of inputItems) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    merged.push(item);
  }

  for (const item of persistedContext?.referenceItems ?? []) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    merged.push({
      ...item,
      sourceKind: "reference_library",
    });
  }

  return merged;
}

function buildMockSceneAppTasteProfile(
  descriptor: SceneAppDescriptor,
  intent: Record<string, unknown>,
  referenceItems: NonNullable<
    SceneAppContextOverlay["snapshot"]["referenceItems"]
  >,
  persistedContext?: MockPersistedSceneAppContext | null,
) {
  const userInput = resolveMockSceneAppUserInput(intent);
  const persistedTasteProfile = persistedContext?.tasteProfile ?? null;
  if (!referenceItems.length && !userInput) {
    return persistedTasteProfile;
  }

  const keywords: string[] = [];
  for (const keyword of persistedTasteProfile?.keywords ?? []) {
    pushUniqueMock(keywords, keyword);
  }
  for (const item of referenceItems) {
    if (
      item.sourceKind === "reference_library" ||
      item.sourceKind === "project"
    ) {
      pushUniqueMock(keywords, item.label);
    }
  }
  for (const alias of (descriptor.aliases ?? []).slice(0, 2)) {
    pushUniqueMock(keywords, alias);
  }
  const slots = resolveMockSceneAppSlots(intent);
  for (const [key, rawValue] of Object.entries(slots)) {
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      continue;
    }
    const normalizedKey = key.trim().toLowerCase();
    if (
      ![
        "style",
        "tone",
        "mood",
        "platform",
        "target_language",
        "duration",
      ].includes(normalizedKey)
    ) {
      continue;
    }
    pushUniqueMock(
      keywords,
      `${key}:${truncateMockSceneAppSummary(rawValue, 24)}`,
    );
  }
  if (descriptor.patternPrimary === "reviewer") {
    pushUniqueMock(keywords, "review-first");
  }
  pushUniqueMock(keywords, descriptor.outputHint);

  const avoidKeywords: string[] = [];
  for (const keyword of persistedTasteProfile?.avoidKeywords ?? []) {
    pushUniqueMock(avoidKeywords, keyword);
  }
  if (referenceItems.length > 0) {
    pushUniqueMock(avoidKeywords, "偏离参考素材");
  }

  return {
    profileId: `taste-${descriptor.id}`,
    summary:
      persistedTasteProfile && referenceItems.length > 0
        ? `当前 TasteProfile 已在项目沉淀基础上，结合 ${referenceItems.length} 条参考输入更新启发式摘要。`
        : persistedTasteProfile
          ? "当前 TasteProfile 已从项目上下文恢复。"
          : referenceItems.length === 0
            ? "当前 TasteProfile 先基于用户输入与场景画像生成启发式摘要。"
            : `当前 TasteProfile 先基于 ${referenceItems.length} 条参考输入与场景画像生成启发式摘要。`,
    keywords,
    avoidKeywords,
    derivedFromReferenceIds: referenceItems.map((item) => item.id),
    confidence:
      persistedTasteProfile && referenceItems.length > 0
        ? 0.72
        : persistedTasteProfile
          ? 0.64
          : referenceItems.length === 0
            ? 0.38
            : 0.56,
  };
}

function buildMockSceneAppContextOverlay(
  descriptor: SceneAppDescriptor,
  intent: Record<string, unknown>,
  explicitReferenceItems: NonNullable<
    SceneAppContextOverlay["snapshot"]["referenceItems"]
  >,
  persistedContext?: MockPersistedSceneAppContext | null,
): SceneAppContextOverlay {
  const inputReferenceItems = buildMockSceneAppInputReferenceItems(intent);
  const referenceItems = mergeMockSceneAppReferenceItems(
    explicitReferenceItems,
    inputReferenceItems,
    persistedContext,
  );
  const runtimeContext = resolveMockSceneAppRuntimeContext(intent);
  const memoryRefs: string[] = [];
  const toolRefs = [...descriptor.capabilityRefs];
  const skillRefs: string[] = [
    descriptor.id,
    descriptor.linkedServiceSkillId,
    descriptor.linkedSceneKey,
    descriptor.compositionProfile?.blueprintRef,
  ].filter(
    (value): value is string => typeof value === "string" && Boolean(value),
  );

  pushUniqueMock(
    memoryRefs,
    resolveMockSceneAppWorkspaceId(intent)
      ? `workspace:${resolveMockSceneAppWorkspaceId(intent)}`
      : null,
  );
  pushUniqueMock(
    memoryRefs,
    resolveMockSceneAppProjectId(intent)
      ? `project:${resolveMockSceneAppProjectId(intent)}`
      : null,
  );
  const userInput = resolveMockSceneAppUserInput(intent);
  if (userInput) {
    pushUniqueMock(memoryRefs, "memory_profile:user_input");
  }
  if (runtimeContext.browserSessionAttached === true) {
    pushUniqueMock(toolRefs, "browser_session");
  }
  if (runtimeContext.automationEnabled === true) {
    pushUniqueMock(toolRefs, "automation");
  }

  const activeLayers = ["skill", "tool"];
  if (memoryRefs.length > 0) {
    activeLayers.push("memory");
  }
  if (referenceItems.length > 0) {
    activeLayers.push("reference");
  }

  const tasteProfile = buildMockSceneAppTasteProfile(
    descriptor,
    intent,
    referenceItems,
    persistedContext,
  );
  if (tasteProfile) {
    activeLayers.push("taste");
  }

  const restoredReferenceCount = persistedContext?.referenceItems.length ?? 0;
  const notes: string[] = [];
  if (memoryRefs.length > 0) {
    notes.push(`已装配 ${memoryRefs.length} 条 memory 引用。`);
  }
  if (restoredReferenceCount > 0) {
    notes.push(`已从项目上下文恢复 ${restoredReferenceCount} 条历史参考。`);
  }
  if (
    explicitReferenceItems.length === 0 &&
    inputReferenceItems.length === 0 &&
    referenceItems.length === 0
  ) {
    notes.push("当前尚未选中显式参考素材，将主要依赖用户输入与场景画像。");
  } else if (
    explicitReferenceItems.length > 0 &&
    inputReferenceItems.length > 0
  ) {
    notes.push(
      `本次显式带入 ${explicitReferenceItems.length} 条灵感对象，并新增 ${inputReferenceItems.length} 条输入参考，当前 planning 共带上 ${referenceItems.length} 条参考。`,
    );
  } else if (explicitReferenceItems.length > 0) {
    notes.push(
      `本次显式带入 ${explicitReferenceItems.length} 条灵感对象，当前 planning 共带上 ${referenceItems.length} 条参考。`,
    );
  } else if (inputReferenceItems.length > 0) {
    notes.push(
      `本次新增 ${inputReferenceItems.length} 条参考输入，当前 planning 共带上 ${referenceItems.length} 条参考。`,
    );
  } else if (referenceItems.length > 0) {
    notes.push(
      `当前 planning 直接复用了 ${referenceItems.length} 条项目级参考。`,
    );
  }
  if (persistedContext?.tasteProfile) {
    notes.push("当前已复用项目级 TasteProfile，并按最新输入继续更新。");
  } else if (tasteProfile) {
    notes.push(
      "当前 TasteProfile 为启发式摘要，可继续通过场景基线与运行反馈沉淀。",
    );
  }

  return {
    compilerPlan: {
      activeLayers,
      memoryRefs,
      toolRefs,
      referenceCount: referenceItems.length,
      notes,
    },
    snapshot: {
      workspaceId: resolveMockSceneAppWorkspaceId(intent),
      projectId: resolveMockSceneAppProjectId(intent),
      skillRefs,
      memoryRefs,
      toolRefs,
      referenceItems,
      tasteProfile,
    },
  };
}

function buildMockSceneAppAdapterPlan(
  descriptor: SceneAppDescriptor,
  intent: Record<string, unknown>,
): SceneAppRuntimeAdapterPlan {
  const workspaceId = resolveMockSceneAppWorkspaceId(intent);
  const projectId = resolveMockSceneAppProjectId(intent);
  const userInput = resolveMockSceneAppUserInput(intent);
  const slots = resolveMockSceneAppSlots(intent);
  const runtimeContext = resolveMockSceneAppRuntimeContext(intent);
  const referenceMemoryIds = resolveMockSceneAppReferenceMemoryIds(intent);
  const adapterKind = normalizeMockSceneAppAdapterKind(
    descriptor.entryBindings[0]?.bindingFamily ?? "agent_turn",
  );
  const shouldOpenServiceSceneSession =
    adapterKind === "agent_turn" &&
    (descriptor.sceneappType === "local_instant" ||
      descriptor.sceneappType === "hybrid") &&
    Boolean(descriptor.linkedServiceSkillId || descriptor.linkedSceneKey) &&
    descriptor.entryBindings.some(
      (binding) => binding.kind === "service_skill" || binding.kind === "scene",
    );
  const baseRequestMetadata = {
    harness: {
      sceneapp_id: descriptor.id,
      sceneapp_type: descriptor.sceneappType,
      pattern_primary: descriptor.patternPrimary,
      pattern_stack: descriptor.patternStack,
      infra_profile: descriptor.infraProfile,
      entry_source:
        typeof intent.entrySource === "string" ? intent.entrySource : null,
      workspace_id: workspaceId,
      project_id: projectId,
      sceneapp_launch: {
        sceneapp_id: descriptor.id,
        sceneapp_type: descriptor.sceneappType,
        pattern_primary: descriptor.patternPrimary,
        pattern_stack: descriptor.patternStack,
        infra_profile: descriptor.infraProfile,
        delivery_contract: descriptor.deliveryContract,
        linked_service_skill_id: descriptor.linkedServiceSkillId ?? null,
        linked_scene_key: descriptor.linkedSceneKey ?? null,
        entry_source:
          typeof intent.entrySource === "string" ? intent.entrySource : null,
        workspace_id: workspaceId,
        project_id: projectId,
        reference_memory_ids: referenceMemoryIds,
      },
    },
    sceneapp: {
      id: descriptor.id,
      title: descriptor.title,
      sceneapp_type: descriptor.sceneappType,
      pattern_primary: descriptor.patternPrimary,
      pattern_stack: descriptor.patternStack,
      infra_profile: descriptor.infraProfile,
      delivery_contract: descriptor.deliveryContract,
      source_package_id: descriptor.sourcePackageId,
      source_package_version: descriptor.sourcePackageVersion,
    },
    ...(descriptor.linkedServiceSkillId || descriptor.linkedSceneKey
      ? {
          service_skill: {
            id: descriptor.linkedServiceSkillId ?? null,
            scene_key: descriptor.linkedSceneKey ?? null,
          },
        }
      : {}),
    ...(Object.keys(slots).length > 0
      ? {
          sceneapp_slots: slots,
        }
      : {}),
    ...(referenceMemoryIds.length > 0
      ? {
          sceneapp_reference_memory_ids: referenceMemoryIds,
        }
      : {}),
  };

  if (adapterKind === "browser_assist") {
    const adapterName =
      descriptor.id === "x-article-export"
        ? "x/article-export"
        : (descriptor.linkedSceneKey ?? descriptor.id);
    const args: Record<string, unknown> = {};
    const url =
      (typeof slots.article_url === "string" && slots.article_url) ||
      (typeof slots.url === "string" && slots.url) ||
      extractMockSceneAppUrlCandidate(userInput);
    if (url) {
      args.url = url;
    }
    if (typeof slots.target_language === "string") {
      args.target_language = slots.target_language;
    }
    if (Object.keys(args).length === 0 && userInput) {
      args.prompt = userInput;
    }

    return {
      adapterKind,
      runtimeAction: "launch_browser_assist",
      targetRef: adapterName,
      targetLabel: descriptor.title,
      linkedServiceSkillId: descriptor.linkedServiceSkillId,
      linkedSceneKey: descriptor.linkedSceneKey,
      preferredProfileKey: "general_browser_assist",
      requestMetadata: {
        ...baseRequestMetadata,
        harness: {
          ...baseRequestMetadata.harness,
          browser_requirement: "required",
          browser_requirement_reason:
            "当前做法依赖真实浏览器上下文与登录态，不应回退到纯 WebSearch。",
          browser_assist: {
            enabled: true,
            profile_key: "general_browser_assist",
            preferred_backend: "lime_extension_bridge",
            auto_launch: false,
            stream_mode: "both",
          },
          service_skill_launch: {
            kind: "site_adapter",
            skill_id: descriptor.linkedServiceSkillId ?? null,
            skill_title: descriptor.title,
            adapter_name: adapterName,
            args,
            save_mode: "project_resource",
            project_id: projectId,
          },
        },
      },
      launchPayload: {
        sceneapp_id: descriptor.id,
        service_skill_id: descriptor.linkedServiceSkillId ?? null,
        adapter_name: adapterName,
        profile_key: "general_browser_assist",
        args,
        project_id: projectId,
        workspace_id: workspaceId,
        reference_memory_ids: referenceMemoryIds,
        save_mode: "project_resource",
      },
      notes: [
        "当前做法规划先映射到 browser_assist 主链，再由后续 runtime adapter 负责真实执行。",
        ...(url
          ? []
          : [
              "当前 planner 还无法仅凭 descriptor 判断 article_url 是否齐备；执行前应继续通过 scene gate 补齐目标链接。",
            ]),
      ],
    };
  }

  if (adapterKind === "automation_job") {
    return {
      adapterKind,
      runtimeAction: "create_automation_job",
      targetRef: descriptor.linkedServiceSkillId ?? descriptor.id,
      targetLabel: descriptor.title,
      linkedServiceSkillId: descriptor.linkedServiceSkillId,
      linkedSceneKey: descriptor.linkedSceneKey,
      requestMetadata: {
        ...baseRequestMetadata,
        harness: {
          ...baseRequestMetadata.harness,
          sceneapp_runtime_action: "create_automation_job",
        },
      },
      launchPayload: {
        sceneapp_id: descriptor.id,
        name: `${descriptor.title} 自动化`,
        enabled: true,
        execution_mode: "intelligent",
        schedule: {
          kind: "every",
          every_secs: 3600,
        },
        delivery: {
          mode: "none",
          channel: null,
          target: null,
          best_effort: false,
          output_schema: null,
          output_format: null,
        },
        launch_intent: {
          sceneapp_id: descriptor.id,
          entry_source:
            typeof intent.entrySource === "string" ? intent.entrySource : null,
          workspace_id: workspaceId,
          project_id: projectId,
          user_input: userInput || null,
          reference_memory_ids: referenceMemoryIds,
          slots,
          runtime_context:
            Object.keys(runtimeContext).length > 0 ? runtimeContext : null,
        },
      },
      notes: [
        "当前做法规划先映射到 automation_job 主链，再由后续 runtime adapter 负责真实执行。",
        "当前 planner 只生成 durable automation draft；具体 schedule、delivery 与 run-now 策略可继续由 UI 调整。",
      ],
    };
  }

  if (shouldOpenServiceSceneSession) {
    return {
      adapterKind,
      runtimeAction: "open_service_scene_session",
      targetRef:
        descriptor.linkedServiceSkillId ??
        descriptor.linkedSceneKey ??
        descriptor.id,
      targetLabel: descriptor.title,
      linkedServiceSkillId: descriptor.linkedServiceSkillId,
      linkedSceneKey: descriptor.linkedSceneKey,
      requestMetadata: {
        ...baseRequestMetadata,
        harness: {
          ...baseRequestMetadata.harness,
          service_scene_launch: {
            kind: "local_service_skill",
            service_scene_run: {
              sceneapp_id: descriptor.id,
              scene_key: descriptor.linkedSceneKey ?? null,
              linked_skill_id: descriptor.linkedServiceSkillId ?? null,
              skill_id: descriptor.linkedServiceSkillId ?? null,
              skill_title: descriptor.title,
              skill_summary: descriptor.summary,
              execution_kind: "local_service_skill",
              execution_location: "client_default",
              entry_source:
                typeof intent.entrySource === "string"
                  ? intent.entrySource
                  : "sceneapp_plan",
              workspace_id: workspaceId,
              project_id: projectId,
              user_input: userInput || null,
              reference_memory_ids: referenceMemoryIds,
              slots,
            },
          },
        },
      },
      launchPayload: {
        sceneapp_id: descriptor.id,
        scene_key: descriptor.linkedSceneKey ?? null,
        service_skill_id: descriptor.linkedServiceSkillId ?? null,
        workspace_id: workspaceId,
        project_id: projectId,
        entry_source:
          typeof intent.entrySource === "string"
            ? intent.entrySource
            : "sceneapp_plan",
        user_input: userInput || null,
        reference_memory_ids: referenceMemoryIds,
        slots,
      },
      notes: [
        "当前做法规划会收敛到 Agent 工作区主链，并由客户端继续执行。",
        ...(descriptor.sceneappType === "hybrid"
          ? [
              "当前做法属于 hybrid，但首发执行会先进入 Agent 工作区入口；后续本地编排步骤由 composition blueprint 接续。",
            ]
          : []),
      ],
    };
  }

  if (adapterKind === "native_skill") {
    return {
      adapterKind,
      runtimeAction: "launch_native_skill",
      targetRef:
        descriptor.linkedServiceSkillId ??
        descriptor.linkedSceneKey ??
        descriptor.id,
      targetLabel: descriptor.title,
      linkedServiceSkillId: descriptor.linkedServiceSkillId,
      linkedSceneKey: descriptor.linkedSceneKey,
      requestMetadata: {
        ...baseRequestMetadata,
        harness: {
          ...baseRequestMetadata.harness,
          sceneapp_runtime_action: "launch_native_skill",
          sceneapp_native_skill_launch: {
            skill_id: descriptor.linkedServiceSkillId ?? null,
            skill_key: descriptor.linkedSceneKey ?? null,
            project_id: projectId,
            workspace_id: workspaceId,
            user_input: userInput || null,
            reference_memory_ids: referenceMemoryIds,
            slots,
          },
        },
      },
      launchPayload: {
        sceneapp_id: descriptor.id,
        service_skill_id: descriptor.linkedServiceSkillId ?? null,
        skill_key: descriptor.linkedSceneKey ?? null,
        workspace_id: workspaceId,
        project_id: projectId,
        user_input: userInput || null,
        reference_memory_ids: referenceMemoryIds,
        slots,
      },
      notes: [
        "当前做法规划先映射到 native_skill 主链，再由后续 runtime adapter 负责真实执行。",
        "native_skill 目前仍建议由统一 SceneApp UI 继续补参后，再把 draft 投递给本地 skill 执行入口。",
      ],
    };
  }

  return {
    adapterKind,
    runtimeAction: "submit_agent_turn",
    targetRef: descriptor.id,
    targetLabel: descriptor.title,
    linkedServiceSkillId: descriptor.linkedServiceSkillId,
    linkedSceneKey: descriptor.linkedSceneKey,
    requestMetadata: {
      ...baseRequestMetadata,
      harness: {
        ...baseRequestMetadata.harness,
        sceneapp_runtime_action: "submit_agent_turn",
      },
    },
    launchPayload: {
      sceneapp_id: descriptor.id,
      message: userInput,
      workspace_id: workspaceId,
      project_id: projectId,
      reference_memory_ids: referenceMemoryIds,
      slots,
    },
    notes: [
      "当前做法规划先映射到 agent_turn 主链，再由后续 runtime adapter 负责真实执行。",
      "agent_turn 类型 SceneApp 当前仍建议走统一聊天 turn，并把 sceneapp_launch metadata 合并进 request_metadata。",
    ],
  };
}

function stampMockSceneAppBaselineReferenceItems(
  values: NonNullable<SceneAppContextOverlay["snapshot"]["referenceItems"]>,
) {
  const savedAt = new Date().toISOString();
  return values.map((item) =>
    item.selected
      ? {
          ...item,
          usageCount: (item.usageCount ?? 0) + 1,
          lastUsedAt: savedAt,
        }
      : item,
  );
}

function buildMockSceneAppPlanResult(
  descriptor: SceneAppDescriptor | null,
  args?: Record<string, unknown>,
  options?: {
    persistContext?: boolean;
  },
): SceneAppPlanResult {
  const resolvedDescriptor = descriptor ?? mockSceneAppCatalog.items[0]!;
  const intent =
    (args?.intent as Record<string, unknown> | undefined) ?? args ?? {};
  const referenceMemoryIds = resolveMockSceneAppReferenceMemoryIds(intent);
  const explicitReferenceItems =
    buildMockSceneAppExplicitReferenceItems(intent);
  const persistedContextKey = resolveMockSceneAppContextStoreKey(
    resolvedDescriptor.id,
    intent,
  );
  const persistedContext = persistedContextKey
    ? (mockSceneAppContextStore.get(persistedContextKey) ?? null)
    : null;
  const runtimeContext = resolveMockSceneAppRuntimeContext(intent);
  const unmetRequirements = resolvedDescriptor.launchRequirements.filter(
    (requirement) => {
      if (requirement.kind === "user_input") {
        return resolveMockSceneAppUserInput(intent).length === 0;
      }
      if (requirement.kind === "project") {
        return !resolveMockSceneAppProjectId(intent);
      }
      if (requirement.kind === "browser_session") {
        return runtimeContext.browserSessionAttached !== true;
      }
      if (requirement.kind === "automation") {
        return runtimeContext.automationEnabled !== true;
      }
      return false;
    },
  );
  const contextOverlay = buildMockSceneAppContextOverlay(
    resolvedDescriptor,
    intent,
    explicitReferenceItems,
    persistedContext,
  );
  const shouldPersistContext = options?.persistContext === true;
  const savedContextOverlay = shouldPersistContext
    ? {
        ...contextOverlay,
        compilerPlan: {
          ...contextOverlay.compilerPlan,
          notes: [
            ...contextOverlay.compilerPlan.notes,
            "当前场景基线已写入项目级 Context Snapshot，后续 planning 会优先复用。",
          ],
        },
        snapshot: {
          ...contextOverlay.snapshot,
          referenceItems: stampMockSceneAppBaselineReferenceItems(
            contextOverlay.snapshot.referenceItems,
          ),
        },
      }
    : contextOverlay;

  if (shouldPersistContext) {
    if (!persistedContextKey) {
      throw new Error("当前还没有绑定项目工作区，无法写入场景基线。");
    }
    mockSceneAppContextStore.set(persistedContextKey, {
      sceneappId: resolvedDescriptor.id,
      workspaceId: savedContextOverlay.snapshot.workspaceId ?? null,
      projectId: savedContextOverlay.snapshot.projectId ?? null,
      referenceItems: savedContextOverlay.snapshot.referenceItems,
      tasteProfile: savedContextOverlay.snapshot.tasteProfile ?? null,
    });
  }

  const warnings =
    unmetRequirements.length > 0 ? ["当前做法仍有未满足的启动前置条件。"] : [];
  if (shouldPersistContext && !persistedContextKey) {
    warnings.push("当前未解析到项目目录，暂未写入项目级 Context Snapshot。");
  }
  const missingReferenceCount =
    referenceMemoryIds.length - explicitReferenceItems.length;
  if (missingReferenceCount > 0) {
    warnings.push(
      `已选中的 ${missingReferenceCount} 条灵感条目未找到，planning 仅继续使用当前可解析的参考。`,
    );
  }

  return {
    descriptor: resolvedDescriptor,
    readiness: {
      ready: unmetRequirements.length === 0,
      unmetRequirements,
    },
    contextOverlay: savedContextOverlay,
    projectPackPlan: buildMockSceneAppProjectPackPlan(
      resolvedDescriptor,
      intent,
      savedContextOverlay,
    ),
    plan: {
      sceneappId: resolvedDescriptor.id,
      executorKind:
        resolvedDescriptor.entryBindings[0]?.bindingFamily ?? "agent_turn",
      bindingFamily:
        resolvedDescriptor.entryBindings[0]?.bindingFamily ?? "agent_turn",
      stepPlan: resolvedDescriptor.patternStack.map((pattern, index) => ({
        id: `step-${index + 1}`,
        title: `执行 ${pattern} 阶段`,
        bindingFamily:
          resolvedDescriptor.entryBindings[0]?.bindingFamily ?? "agent_turn",
      })),
      adapterPlan: buildMockSceneAppAdapterPlan(resolvedDescriptor, intent),
      storageStrategy: resolvedDescriptor.infraProfile.includes("db_store")
        ? "db_plus_snapshot"
        : "workspace_bundle",
      artifactContract: resolvedDescriptor.deliveryContract,
      governanceHooks: ["evidence_pack", "scorecard"],
      warnings,
    },
  };
}

function normalizeMockSceneAppAdapterKind(
  adapterKind: SceneAppRuntimeAdapterPlan["adapterKind"],
): SceneAppRuntimeAdapterPlan["adapterKind"] {
  return adapterKind;
}

function buildMockSceneAppProjectPackPlan(
  descriptor: SceneAppDescriptor,
  intent: Record<string, unknown>,
  contextOverlay: SceneAppContextOverlay,
): SceneAppProjectPackPlan {
  const requiredParts = Array.from(
    new Set(
      (descriptor.deliveryProfile?.requiredParts.length
        ? descriptor.deliveryProfile.requiredParts
        : (descriptor.compositionProfile?.steps.map((step) => step.id) ?? [])
      )
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  );
  const projectId = resolveMockSceneAppProjectId(intent);

  return {
    packKind: descriptor.deliveryContract,
    primaryPart:
      descriptor.deliveryProfile?.primaryPart ?? requiredParts[0] ?? undefined,
    requiredParts,
    viewerKind: descriptor.deliveryProfile?.viewerKind,
    completionStrategy:
      requiredParts.length > 0
        ? "required_parts_complete"
        : descriptor.infraProfile.includes("workspace_storage")
          ? "workspace_artifact_writeback"
          : "artifact_writeback",
    notes: [
      descriptor.deliveryContract === "project_pack"
        ? "当前做法以结果包作为默认交付单位。"
        : "当前做法会沿现有结果交付主链回写。",
      requiredParts.length > 0
        ? `完整度将按 ${requiredParts.length} 个必含部件判断。`
        : "当前场景暂按结果文件回流判断交付。",
      projectId
        ? `结果会优先回写到项目 ${projectId}，便于继续编辑与复盘。`
        : "当前还没有绑定项目，结果包只能先按运行时结果临时回流。",
      contextOverlay.compilerPlan.referenceCount > 0 ||
      contextOverlay.snapshot.tasteProfile
        ? "结果包会连同参考与风格快照一起进入后续结果跟进。"
        : "结果包会继续进入 evidence 与 scorecard 主链。",
    ],
  };
}

function buildMockSceneAppScorecard(sceneappId: string): SceneAppScorecard {
  if (sceneappId === "story-video-suite") {
    return {
      sceneappId,
      updatedAt: "2026-04-15T00:00:00.000Z",
      summary:
        "这条多模态项目包样板已具备继续优化价值，重点是提升整包完整度与发布转化。",
      metrics: [
        {
          key: "complete_pack_rate",
          label: "整包交付率",
          value: 78,
          status: "watch",
        },
        {
          key: "review_pass_rate",
          label: "复核通过率",
          value: 84,
          status: "good",
        },
      ],
      recommendedAction: "optimize",
      observedFailureSignals: ["review_blocked", "pack_incomplete"],
      topFailureSignal: "review_blocked",
    };
  }

  return {
    sceneappId,
    updatedAt: "2026-04-15T00:00:00.000Z",
    summary: "该 SceneApp 已具备最近结果入口，下一步重点是继续优化交付稳定性。",
    metrics: [
      {
        key: "delivery_readiness",
        label: "交付就绪度",
        value: 0.78,
        status: "watch",
      },
      {
        key: "reuse_potential",
        label: "结果复用潜力",
        value: 0.84,
        status: "good",
      },
    ],
    recommendedAction: "keep",
    observedFailureSignals: [],
    topFailureSignal: null,
  };
}

function extractMockSceneAppIdFromAutomationJob(
  job?: Partial<AutomationJobRecord> | null,
): string | null {
  const payload =
    (job?.payload as Record<string, unknown> | undefined) ?? undefined;
  const requestMetadata =
    (payload?.request_metadata as Record<string, unknown> | undefined) ??
    (payload?.requestMetadata as Record<string, unknown> | undefined);
  const sceneapp =
    (requestMetadata?.sceneapp as Record<string, unknown> | undefined) ??
    (requestMetadata?.sceneApp as Record<string, unknown> | undefined);
  return typeof sceneapp?.id === "string" ? sceneapp.id : null;
}

function buildMockSceneAppRunSummaries(sceneappId?: string) {
  const seededRuns = [
    {
      runId: "sceneapp-run-story-video-seed",
      sceneappId: "story-video-suite",
      status: "success",
      source: "catalog_seed",
      sourceRef: null,
      startedAt: "2026-04-15T00:00:00.000Z",
      finishedAt: "2026-04-15T00:08:00.000Z",
      artifactCount: 3,
      deliveryArtifactRefs: [
        {
          relativePath: "exports/story-video-suite/latest/brief.md",
          absolutePath: "/workspace/exports/story-video-suite/latest/brief.md",
          partKey: "brief",
          projectId: "project-1",
          workspaceId: "workspace-1",
          source: "runtime_evidence",
        },
        {
          relativePath: "exports/story-video-suite/latest/video_draft.mp4",
          absolutePath:
            "/workspace/exports/story-video-suite/latest/video_draft.mp4",
          partKey: "video_draft",
          projectId: "project-1",
          workspaceId: "workspace-1",
          source: "runtime_evidence",
        },
      ],
      governanceArtifactRefs: [
        {
          kind: "evidence_summary",
          label: "证据摘要",
          relativePath:
            ".lime/harness/sessions/session-story-video-1/evidence/summary.md",
          absolutePath:
            "/workspace/.lime/harness/sessions/session-story-video-1/evidence/summary.md",
          projectId: "project-1",
          workspaceId: "workspace-1",
          source: "session_governance",
        },
        {
          kind: "review_decision_markdown",
          label: "人工复核记录",
          relativePath:
            ".lime/harness/sessions/session-story-video-1/review/review-decision.md",
          absolutePath:
            "/workspace/.lime/harness/sessions/session-story-video-1/review/review-decision.md",
          projectId: "project-1",
          workspaceId: "workspace-1",
          source: "session_governance",
        },
        {
          kind: "review_decision_json",
          label: "复核 JSON",
          relativePath:
            ".lime/harness/sessions/session-story-video-1/review/review-decision.json",
          absolutePath:
            "/workspace/.lime/harness/sessions/session-story-video-1/review/review-decision.json",
          projectId: "project-1",
          workspaceId: "workspace-1",
          source: "session_governance",
        },
      ],
      deliveryRequiredParts: [
        "brief",
        "storyboard",
        "script",
        "music_refs",
        "video_draft",
        "review_note",
      ],
      deliveryCompletedParts: ["brief", "storyboard", "script"],
      deliveryMissingParts: ["music_refs", "video_draft", "review_note"],
      deliveryCompletionRate: 50,
      deliveryPartCoverageKnown: true,
      failureSignal: "review_blocked",
    },
    {
      runId: "sceneapp-run-article-export-seed",
      sceneappId: "x-article-export",
      status: "queued",
      source: "catalog_seed",
      sourceRef: null,
      startedAt: "2026-04-15T00:12:00.000Z",
      finishedAt: null,
      artifactCount: 0,
      deliveryArtifactRefs: [],
      deliveryRequiredParts: ["index.md", "meta.json"],
      deliveryCompletedParts: [],
      deliveryMissingParts: [],
      deliveryCompletionRate: null,
      deliveryPartCoverageKnown: false,
      failureSignal: null,
    },
  ];

  const automationRuns = mockAutomationRuns
    .map((run) => {
      const job = mockAutomationJobs.find((item) => item.id === run.source_ref);
      const resolvedSceneAppId = extractMockSceneAppIdFromAutomationJob(job);
      if (!resolvedSceneAppId) {
        return null;
      }
      return {
        runId: run.id,
        sceneappId: resolvedSceneAppId,
        status: run.status,
        source: run.source,
        sourceRef: run.source_ref ?? null,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        artifactCount: 0,
        deliveryRequiredParts: [],
        deliveryCompletedParts: [],
        deliveryMissingParts: [],
        deliveryCompletionRate: null,
        deliveryPartCoverageKnown: false,
        failureSignal: null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const automationJobOnlyRuns = mockAutomationJobs
    .filter((job) => {
      const resolvedSceneAppId = extractMockSceneAppIdFromAutomationJob(job);
      if (!resolvedSceneAppId) {
        return false;
      }
      const hasRealRun = mockAutomationRuns.some(
        (run) => run.source_ref === job.id,
      );
      return !hasRealRun;
    })
    .map((job) => ({
      runId: `automation-job:${job.id}`,
      sceneappId: extractMockSceneAppIdFromAutomationJob(job)!,
      status: job.last_status ?? "queued",
      source: "automation",
      sourceRef: job.id,
      startedAt: job.last_run_at ?? job.created_at,
      finishedAt: job.last_finished_at ?? null,
      artifactCount: 0,
      deliveryRequiredParts: [],
      deliveryCompletedParts: [],
      deliveryMissingParts: [],
      deliveryCompletionRate: null,
      deliveryPartCoverageKnown: false,
      failureSignal: null,
    }));

  const merged = [...automationRuns, ...automationJobOnlyRuns, ...seededRuns];
  return sceneappId
    ? merged.filter((run) => run.sceneappId === sceneappId)
    : merged;
}

function createMockSceneAppAutomationJob(args?: Record<string, unknown>) {
  const intent =
    (args?.intent as Record<string, unknown> | undefined) ?? args ?? {};
  const launchIntent =
    (intent.launchIntent as Record<string, unknown> | undefined) ??
    (intent.launch_intent as Record<string, unknown> | undefined) ??
    {};
  const descriptor = findMockSceneAppDescriptor(
    (launchIntent.sceneappId as string | undefined) ??
      (launchIntent.sceneapp_id as string | undefined),
  );

  if (!descriptor) {
    throw new Error("未找到 SceneApp，无法创建自动化任务");
  }
  if (descriptor.sceneappType === "browser_grounded") {
    throw new Error(
      "当前做法依赖浏览器上下文，暂不支持直接转为 automation job",
    );
  }

  const workspaceId =
    typeof launchIntent.workspaceId === "string"
      ? launchIntent.workspaceId
      : typeof launchIntent.workspace_id === "string"
        ? launchIntent.workspace_id
        : "workspace-default";
  const projectId =
    typeof launchIntent.projectId === "string"
      ? launchIntent.projectId
      : typeof launchIntent.project_id === "string"
        ? launchIntent.project_id
        : null;
  const userInput =
    typeof launchIntent.userInput === "string"
      ? launchIntent.userInput
      : typeof launchIntent.user_input === "string"
        ? launchIntent.user_input
        : "";
  const schedule = (intent.schedule as Record<string, unknown> | undefined) ?? {
    kind: "every",
    every_secs: 3600,
  };

  const requestMetadata = {
    sceneapp: {
      id: descriptor.id,
      title: descriptor.title,
      sceneapp_type: descriptor.sceneappType,
      pattern_primary: descriptor.patternPrimary,
      pattern_stack: descriptor.patternStack,
      infra_profile: descriptor.infraProfile,
    },
    service_skill: {
      id: descriptor.linkedServiceSkillId,
      scene_key: descriptor.linkedSceneKey,
    },
    harness: {
      sceneapp_id: descriptor.id,
      workspace_id: workspaceId,
      project_id: projectId,
      entry_source:
        (launchIntent.entrySource as string | undefined) ??
        (launchIntent.entry_source as string | undefined) ??
        null,
    },
    sceneapp_slots:
      (launchIntent.slots as Record<string, unknown> | undefined) ?? {},
  };

  const jobId = `sceneapp-automation-${Date.now()}`;
  const createdJob: AutomationJobRecord = {
    id: jobId,
    name:
      (typeof intent.name === "string" && intent.name.trim()) ||
      `${descriptor.title} 自动化`,
    description:
      (typeof intent.description === "string" && intent.description.trim()
        ? intent.description
        : `由 SceneApp ${descriptor.title} 派生的自动化任务。`) ?? null,
    enabled: intent.enabled !== false,
    workspace_id: workspaceId,
    execution_mode:
      (intent.executionMode as
        | AutomationJobRecord["execution_mode"]
        | undefined) ??
      (intent.execution_mode as
        | AutomationJobRecord["execution_mode"]
        | undefined) ??
      "intelligent",
    schedule: schedule as AutomationJobRecord["schedule"],
    payload: {
      kind: "agent_turn",
      prompt: userInput
        ? `SceneApp: ${descriptor.title}\n用户目标：${userInput}`
        : `SceneApp: ${descriptor.title}`,
      system_prompt: "你正在执行 SceneApp 自动化任务。",
      web_search: false,
      request_metadata: requestMetadata,
    },
    delivery: (intent.delivery as
      | AutomationJobRecord["delivery"]
      | undefined) ?? {
      mode: "none",
      channel: null,
      target: null,
      best_effort: true,
      output_schema: "text",
      output_format: "text",
    },
    timeout_secs:
      (intent.timeoutSecs as number | undefined) ??
      (intent.timeout_secs as number | undefined) ??
      null,
    max_retries:
      (intent.maxRetries as number | undefined) ??
      (intent.max_retries as number | undefined) ??
      3,
    next_run_at: now(),
    last_status: null,
    last_error: null,
    last_run_at: null,
    last_finished_at: null,
    running_started_at: null,
    consecutive_failures: 0,
    last_retry_count: 0,
    auto_disabled_until: null,
    last_delivery: null,
    created_at: now(),
    updated_at: now(),
  };
  mockAutomationJobs.unshift(createdJob);

  let runNowResult:
    | {
        job_count: number;
        success_count: number;
        failed_count: number;
        timeout_count: number;
      }
    | undefined;
  if (intent.runNow === true || intent.run_now === true) {
    const runId = `sceneapp-run-${Date.now()}`;
    mockAutomationRuns.unshift({
      id: runId,
      source: "automation",
      source_ref: createdJob.id,
      session_id: `session-${Date.now()}`,
      status: "success",
      started_at: now(),
      finished_at: now(),
      duration_ms: 1200,
      error_code: null,
      error_message: null,
      metadata: JSON.stringify({
        job_id: createdJob.id,
        job_name: createdJob.name,
        workspace_id: createdJob.workspace_id,
        sceneapp: {
          id: descriptor.id,
          title: descriptor.title,
        },
        harness: {
          sceneapp_id: descriptor.id,
        },
      }),
      created_at: now(),
      updated_at: now(),
    });
    runNowResult = {
      job_count: 1,
      success_count: 1,
      failed_count: 0,
      timeout_count: 0,
    };
  }

  return {
    sceneappId: descriptor.id,
    jobId: createdJob.id,
    jobName: createdJob.name,
    enabled: createdJob.enabled,
    workspaceId: createdJob.workspace_id,
    nextRunAt: createdJob.next_run_at,
    runNowResult,
  };
}

function buildMockAutomationBrowserMetadata(
  job: any,
  session: any,
  status: string,
  durationMs?: number | null,
) {
  return JSON.stringify({
    job_id: job.id,
    job_name: job.name,
    workspace_id: job.workspace_id,
    schedule:
      job.schedule?.kind === "every"
        ? `every:${job.schedule.every_secs}`
        : job.schedule?.kind === "cron"
          ? `cron:${job.schedule.expr}`
          : `at:${job.schedule?.at ?? ""}`,
    status,
    retry_count: job.last_retry_count ?? 0,
    session_id: session.session_id,
    payload_kind: job.payload?.kind ?? "agent_turn",
    profile_key: job.payload?.profile_key ?? session.profile_key,
    profile_id: job.payload?.profile_id ?? null,
    environment_preset_id:
      job.payload?.environment_preset_id ??
      session.environment_preset_id ??
      null,
    target_id: job.payload?.target_id ?? session.target_id,
    browser_lifecycle_state: session.lifecycle_state,
    control_mode: session.control_mode,
    human_reason: session.human_reason ?? null,
    browser_last_error: session.last_error ?? null,
    browser_target_id: session.target_id,
    browser_target_url: session.target_url,
    connected: session.connected,
    duration_ms: durationMs ?? null,
  });
}

function resolveMockAutomationRunBySession(sessionId: string) {
  return mockAutomationRuns.find(
    (run) => run.source === "automation" && run.session_id === sessionId,
  );
}

function resolveMockAutomationJobByRun(run: any) {
  if (!run?.source_ref) {
    return null;
  }
  return mockAutomationJobs.find((job) => job.id === run.source_ref) ?? null;
}

function finishMockAutomationBrowserRun(
  job: any,
  run: any,
  session: any,
  status: "success" | "error",
) {
  const timestamp = now();
  const durationMs = Math.max(
    0,
    new Date(timestamp).getTime() - new Date(run.started_at).getTime(),
  );
  run.status = status;
  run.finished_at = timestamp;
  run.duration_ms = durationMs;
  run.error_code = status === "success" ? null : "browser_session_failed";
  run.error_message =
    status === "success"
      ? null
      : (session.last_error ?? session.human_reason ?? "浏览器会话执行失败");
  run.updated_at = timestamp;
  run.metadata = buildMockAutomationBrowserMetadata(
    job,
    session,
    status,
    durationMs,
  );

  job.last_status = status;
  job.last_error = run.error_message;
  job.last_run_at = run.started_at;
  job.last_finished_at = timestamp;
  job.running_started_at = null;
  job.updated_at = timestamp;
  job.last_retry_count = job.last_retry_count ?? 0;
  if (status === "success") {
    job.consecutive_failures = 0;
    job.auto_disabled_until = null;
  } else {
    job.consecutive_failures = (job.consecutive_failures ?? 0) + 1;
  }
  if (job.schedule?.kind === "at") {
    job.enabled = false;
    job.next_run_at = null;
  } else {
    job.next_run_at = timestamp;
  }
}

function syncMockAutomationBrowserSessionState(
  session: any,
  options?: { finalize?: boolean },
) {
  const run = resolveMockAutomationRunBySession(session.session_id);
  const job = resolveMockAutomationJobByRun(run);
  if (!run || !job) {
    return session;
  }
  if (["success", "error", "canceled", "timeout"].includes(run.status)) {
    return session;
  }

  if (options?.finalize || session.lifecycle_state === "closed") {
    finishMockAutomationBrowserRun(job, run, session, "success");
    return session;
  }
  if (session.lifecycle_state === "failed") {
    finishMockAutomationBrowserRun(job, run, session, "error");
    return session;
  }

  const timestamp = now();
  const status =
    session.lifecycle_state === "human_controlling"
      ? "human_controlling"
      : session.lifecycle_state === "waiting_for_human"
        ? "waiting_for_human"
        : session.lifecycle_state === "agent_resuming"
          ? "agent_resuming"
          : "running";

  run.status = "running";
  run.finished_at = null;
  run.duration_ms = null;
  run.error_code = null;
  run.error_message = null;
  run.updated_at = timestamp;
  run.metadata = buildMockAutomationBrowserMetadata(job, session, status, null);

  job.last_status = status;
  job.last_error = null;
  job.last_run_at = run.started_at;
  job.last_finished_at = null;
  job.running_started_at = job.running_started_at ?? run.started_at;
  job.next_run_at = null;
  job.updated_at = timestamp;
  return session;
}

configureBrowserMocks({
  syncBrowserSessionState: syncMockAutomationBrowserSessionState,
});

export function clearSceneAppAutomationMocks() {
  mockSceneAppContextStore.clear();
}

export const sceneAppAutomationMocks: Record<string, (args?: any) => any> = {
  get_automation_scheduler_config: () => ({
    enabled: true,
    poll_interval_secs: 30,
    enable_history: true,
  }),
  update_automation_scheduler_config: () => undefined,
  get_automation_status: () => ({
    running: true,
    last_polled_at: now(),
    next_poll_at: now(),
    last_job_count: mockAutomationJobs.length,
    total_executions: mockAutomationRuns.length,
    active_job_id: null,
    active_job_name: null,
  }),
  get_automation_jobs: () => mockAutomationJobs,
  get_automation_job: (args: any) =>
    mockAutomationJobs.find((job) => job.id === args?.id) ?? null,
  create_automation_job: (args: any) => {
    const created = {
      ...args.request,
      id: `automation-job-${Date.now()}`,
      enabled: args.request.enabled ?? true,
      execution_mode: args.request.execution_mode ?? "intelligent",
      delivery: args.request.delivery ?? {
        mode: "none",
        channel: null,
        target: null,
        best_effort: true,
        output_schema: "text",
        output_format: "text",
      },
      timeout_secs: args.request.timeout_secs ?? null,
      max_retries: args.request.max_retries ?? 3,
      next_run_at: now(),
      last_status: null,
      last_error: null,
      last_run_at: null,
      last_finished_at: null,
      running_started_at: null,
      consecutive_failures: 0,
      last_retry_count: 0,
      auto_disabled_until: null,
      last_delivery: null,
      created_at: now(),
      updated_at: now(),
    };
    mockAutomationJobs.unshift(created);
    return created;
  },
  update_automation_job: (args: any) => {
    const index = mockAutomationJobs.findIndex((job) => job.id === args?.id);
    if (index === -1) {
      throw new Error(`automation job not found: ${args?.id}`);
    }
    const current = mockAutomationJobs[index];
    const next = {
      ...current,
      ...args.request,
      timeout_secs: args.request.clear_timeout_secs
        ? null
        : (args.request.timeout_secs ?? current.timeout_secs),
      updated_at: now(),
    };
    mockAutomationJobs[index] = next;
    return next;
  },
  delete_automation_job: (args: any) => {
    const index = mockAutomationJobs.findIndex((job) => job.id === args?.id);
    if (index === -1) {
      return false;
    }
    mockAutomationJobs.splice(index, 1);
    return true;
  },
  run_automation_job_now: (args: any) => {
    const job = mockAutomationJobs.find((item) => item.id === args?.id);
    if (!job) {
      throw new Error(`automation job not found: ${args?.id}`);
    }
    const timestamp = now();
    const browserLaunch =
      job.payload?.kind === "browser_session"
        ? launchMockBrowserSession({
            profile_id: job.payload.profile_id,
            profile_key: job.payload.profile_key,
            url: job.payload.url,
            environment_preset_id: job.payload.environment_preset_id,
            target_id: job.payload.target_id,
            open_window: job.payload.open_window,
            stream_mode: job.payload.stream_mode,
          })
        : null;
    if (job.payload?.kind === "browser_session" && browserLaunch?.session) {
      const session = browserLaunch.session;
      job.last_status = "running";
      job.last_error = null;
      job.last_run_at = timestamp;
      job.last_finished_at = null;
      job.running_started_at = timestamp;
      job.next_run_at = null;
      job.updated_at = timestamp;
      mockAutomationRuns.unshift({
        id: `automation-run-${Date.now()}`,
        source: "automation",
        source_ref: job.id,
        session_id: session.session_id,
        status: "running",
        started_at: timestamp,
        finished_at: null,
        duration_ms: null,
        error_code: null,
        error_message: null,
        metadata: buildMockAutomationBrowserMetadata(
          job,
          session,
          "running",
          null,
        ),
        created_at: timestamp,
        updated_at: timestamp,
      });
      return {
        job_count: 1,
        success_count: 0,
        failed_count: 0,
        timeout_count: 0,
      };
    }

    job.last_status = "success";
    job.last_run_at = timestamp;
    job.last_finished_at = timestamp;
    job.running_started_at = null;
    job.updated_at = timestamp;
    mockAutomationRuns.unshift({
      id: `automation-run-${Date.now()}`,
      source: "automation",
      source_ref: job.id,
      session_id: browserLaunch?.session?.session_id ?? `session-${Date.now()}`,
      status: "success",
      started_at: timestamp,
      finished_at: timestamp,
      duration_ms: 1400,
      error_code: null,
      error_message: null,
      metadata: JSON.stringify({
        job_name: job.name,
        workspace_id: job.workspace_id,
        payload_kind: job.payload?.kind ?? "agent_turn",
        profile_key:
          job.payload?.kind === "browser_session"
            ? job.payload.profile_key
            : null,
      }),
      created_at: timestamp,
      updated_at: timestamp,
    });
    return {
      job_count: 1,
      success_count: 1,
      failed_count: 0,
      timeout_count: 0,
    };
  },
  get_automation_health: () => ({
    total_jobs: mockAutomationJobs.length,
    enabled_jobs: mockAutomationJobs.filter((job) => job.enabled).length,
    pending_jobs: mockAutomationJobs.filter(
      (job) =>
        job.enabled && !job.running_started_at && !job.auto_disabled_until,
    ).length,
    running_jobs: mockAutomationJobs.filter((job) => job.running_started_at)
      .length,
    failed_jobs: mockAutomationJobs.filter((job) =>
      ["error", "timeout"].includes(job.last_status ?? ""),
    ).length,
    cooldown_jobs: mockAutomationJobs.filter((job) => job.auto_disabled_until)
      .length,
    stale_running_jobs: 0,
    failed_last_24h: mockAutomationRuns.filter((run) =>
      ["error", "timeout"].includes(run.status),
    ).length,
    failure_trend_24h: [],
    alerts: [],
    risky_jobs: mockAutomationJobs
      .filter(
        (job) =>
          job.consecutive_failures > 0 ||
          job.auto_disabled_until ||
          ["waiting_for_human", "human_controlling"].includes(
            job.last_status ?? "",
          ),
      )
      .map((job) => ({
        job_id: job.id,
        name: job.name,
        status: job.last_status ?? "idle",
        consecutive_failures: job.consecutive_failures,
        retry_count: job.last_retry_count,
        auto_disabled_until: job.auto_disabled_until,
        updated_at: job.updated_at,
      })),
    generated_at: now(),
  }),
  get_automation_run_history: (args: any) =>
    mockAutomationRuns.filter((run) => run.source_ref === args?.id),
  preview_automation_schedule: () => now(),
  validate_automation_schedule: () => ({
    valid: true,
    error: null,
  }),
  execution_run_list: () => mockAutomationRuns,
  execution_run_get: (args: any) =>
    mockAutomationRuns.find((run) => run.id === args?.runId) ?? null,
  execution_run_get_general_workbench_state: () => ({
    run_state: "idle",
    current_gate_key: "idle",
    queue_items: [],
    latest_terminal: null,
    recent_terminals: [],
    updated_at: new Date().toISOString(),
  }),
  execution_run_list_general_workbench_history: () => ({
    items: [],
    has_more: false,
    next_offset: null,
  }),
  sceneapp_list_catalog: () => mockSceneAppCatalog,
  sceneapp_get_descriptor: (args: any) =>
    findMockSceneAppDescriptor(args?.id ?? args?.sceneappId ?? null),
  sceneapp_plan_launch: (args: any) =>
    buildMockSceneAppPlanResult(
      findMockSceneAppDescriptor(
        args?.intent?.sceneappId ?? args?.sceneappId ?? args?.id ?? null,
      ),
      args,
    ),
  sceneapp_save_context_baseline: (args: any) =>
    buildMockSceneAppPlanResult(
      findMockSceneAppDescriptor(
        args?.intent?.sceneappId ?? args?.sceneappId ?? args?.id ?? null,
      ),
      args,
      { persistContext: true },
    ),
  sceneapp_create_automation_job: (args: any) =>
    createMockSceneAppAutomationJob(args),
  sceneapp_list_runs: (args: any) => {
    const sceneappId =
      typeof args?.sceneappId === "string" ? args.sceneappId : null;
    return buildMockSceneAppRunSummaries(sceneappId ?? undefined);
  },
  sceneapp_get_run_summary: (args: any) =>
    buildMockSceneAppRunSummaries().find((run) => run.runId === args?.runId) ??
    null,
  sceneapp_prepare_run_governance_artifact: (args: any) =>
    buildMockSceneAppRunSummaries().find((run) => run.runId === args?.runId) ??
    null,
  sceneapp_get_scorecard: (args: any) =>
    buildMockSceneAppScorecard(
      typeof args?.sceneappId === "string" && args.sceneappId.trim()
        ? args.sceneappId
        : "story-video-suite",
    ),
  gateway_channel_status: (args: any) => ({
    channel:
      typeof args?.request?.channel === "string" && args.request.channel.trim()
        ? args.request.channel.trim().toLowerCase()
        : "telegram",
    status: {
      running_accounts: 0,
      accounts: [],
    },
  }),
  wechat_channel_list_accounts: () => [],
  content_get_general_workbench_document_state: () => null,
};
