import { pathToFileURL } from "node:url";
import {
  DEFAULT_WRITING_ORCHESTRATION,
  buildArticlePlanning,
} from "./article-planning.mjs";

const APP_ID = "content-factory-app";
const WORKER_REQUEST_SCHEMA = "content-factory.worker-request.v1";
const WORKER_RESPONSE_SCHEMA = "content-factory.worker-response.v1";
const ARTICLE_WORKSPACE_SCHEMA = "article-workspace.v1";
const WORKSPACE_PATCH_KIND = "content_factory.workspace_patch";
const WORKSPACE_PATCH_PATH = ".lime/artifacts/content-factory/workspace-patch.json";

const DEFAULT_SESSION_ID = "session-content-factory-local";
const DEFAULT_TURN_ID = "turn-content-factory-local";
const DEFAULT_TASK_ID = "task-content-factory-local";
const DEFAULT_ARTICLE_WORKFLOW_KEY = "content_article_workflow";
const DEFAULT_CLI_REFS = ["content-factory"];
const DEFAULT_CONNECTOR_REFS = [
  "lime-knowledge",
  "web-research",
  "media-generation"
];
const DEFAULT_HOOK_POLICY = {
  prompt: ["prompt-submit"],
  task: ["task-complete"]
};
const SUPPORTED_TASK_KINDS = new Set([
  "content.factory.generate",
  "content.article.generate",
  "content.image.generate",
  "content.video.script.generate",
  "content.video.storyboard.generate",
  "content.delivery.review"
]);

function normalizeText(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function normalizeList(value, fallback) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function normalizeHookPolicy(value, fallback = {}) {
  const record = asRecord(value);
  if (!record) {
    return fallback;
  }
  const policy = {};
  for (const [key, hooks] of Object.entries(record)) {
    const normalizedHooks = normalizeList(hooks, []);
    if (normalizedHooks.length > 0) {
      policy[key] = normalizedHooks;
    }
  }
  return Object.keys(policy).length > 0 ? policy : fallback;
}

function readStringListFromRecords(value, key) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = asRecord(item);
        const text = normalizeText(record?.[key] ?? item, "");
        return text ? [text] : [];
      })
    : [];
}

function normalizeOrchestration(value) {
  if (!Array.isArray(value)) {
    return DEFAULT_WRITING_ORCHESTRATION;
  }
  const items = value.flatMap((item) => {
    const record = asRecord(item);
    const id = normalizeText(record?.id, "");
    if (!id) {
      return [];
    }
    return [
      {
        id,
        title: normalizeText(record.title, id),
        subagent: normalizeText(record.subagent, ""),
        skillRefs: normalizeList(record.skillRefs, []),
        status: normalizeText(record.status, "completed"),
        summary: normalizeText(record.summary, "")
      }
    ];
  });
  return items.length > 0 ? items : DEFAULT_WRITING_ORCHESTRATION;
}

function normalizeHostManagedGeneration(value) {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const outputs = Array.isArray(record.outputs)
    ? record.outputs.flatMap((output) => {
        const item = asRecord(output);
        const content = normalizeText(item?.content, "");
        if (!item || !content) {
          return [];
        }
        return [
          {
            id: normalizeText(item.id, ""),
            kind: normalizeText(item.kind, ""),
            targetObjectKind: normalizeText(item.targetObjectKind ?? item.target_object_kind, ""),
            outputField: normalizeText(item.outputField ?? item.output_field, ""),
            contentType: normalizeText(item.contentType ?? item.content_type, "text/markdown"),
            content
          }
        ];
      })
    : [];
  return {
    schemaVersion: normalizeText(record.schemaVersion ?? record.schema_version, ""),
    source: normalizeText(record.source, "host_managed_generation"),
    status: normalizeText(record.status, ""),
    provider: normalizeText(record.provider, ""),
    model: normalizeText(record.model, ""),
    reasonCode: normalizeText(record.reasonCode ?? record.reason_code, ""),
    message: normalizeText(record.message, ""),
    outputs
  };
}

function hasHostManagedGenerationResult(value) {
  const record = asRecord(value);
  if (!record) {
    return false;
  }
  return Boolean(
    normalizeText(record.status, "") ||
      normalizeText(record.reasonCode ?? record.reason_code, "") ||
      normalizeText(record.provider, "") ||
      normalizeText(record.model, "") ||
      (Array.isArray(record.outputs) && record.outputs.length > 0)
  );
}

function declaredHostManagedGenerationFallback(request) {
  const declaration = asRecord(request.runtime?.hostManagedGeneration);
  if (
    !declaration ||
    declaration.enabled !== true ||
    normalizeText(request.taskKind, "") !== "content.article.generate"
  ) {
    return null;
  }
  const requests = Array.isArray(declaration.requests) ? declaration.requests : [];
  if (requests.length === 0) {
    return null;
  }
  return {
    schemaVersion: "lime.agent_app.host_managed_generation.v1",
    source: "host_managed_generation_missing_result",
    status: "unavailable",
    provider: "",
    model: "",
    reasonCode: "host_generation_unavailable",
    message: "host managed generation result unavailable",
    outputs: []
  };
}

function hostManagedGenerationFromRequest(request) {
  return (
    (hasHostManagedGenerationResult(request.hostManagedGeneration)
      ? normalizeHostManagedGeneration(request.hostManagedGeneration)
      : null) ??
    (hasHostManagedGenerationResult(request.runtime?.hostManagedGenerationResult)
      ? normalizeHostManagedGeneration(request.runtime?.hostManagedGenerationResult)
      : null) ??
    declaredHostManagedGenerationFallback(request)
  );
}

function generatedDocumentTextFromHost(hostManagedGeneration) {
  if (!hostManagedGeneration || hostManagedGeneration.status !== "completed") {
    return "";
  }
  const output = hostManagedGeneration.outputs.find((item) =>
    (item.targetObjectKind === "articleDraft" || !item.targetObjectKind) &&
    (item.outputField === "documentText" || item.outputField === "finalMarkdown" || !item.outputField) &&
    item.content
  );
  return normalizeText(output?.content, "");
}

function markdownTitleFromDocumentText(documentText) {
  const heading = normalizeText(documentText, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^#\s+/.test(line));
  return heading ? heading.replace(/^#\s+/, "").trim() : "";
}

function markdownExcerptFromDocumentText(documentText) {
  return (
    normalizeText(documentText, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#")) ?? ""
  );
}

function slugify(value) {
  return normalizeText(value, "content")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "content";
}

function safePathSegment(value) {
  return normalizeText(value, "artifact")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "artifact";
}

function normalizeRequest(request = {}) {
  const taskKind = normalizeText(request.taskKind, "content.factory.generate");
  if (!SUPPORTED_TASK_KINDS.has(taskKind)) {
    throw new Error(`unsupported taskKind: ${taskKind}`);
  }

  const brief = request.brief && typeof request.brief === "object"
    ? request.brief
    : {};
  const topic = normalizeText(
    request.topic ?? brief.topic,
    "内容工厂工作流升级"
  );
  const audience = normalizeText(
    request.audience ?? brief.audience,
    "需要稳定产出内容的运营团队"
  );
  const tone = normalizeText(request.tone ?? brief.tone, "专业、直接、可执行");
  const channel = normalizeText(request.channel ?? brief.channel, "公众号");
  const goal = normalizeText(
    request.goal ?? brief.goal,
    "生成可审核、可继续迭代的首版内容资产"
  );
  const references = normalizeList(request.references ?? brief.references, [
    "已有需求讨论",
    "目标读者痛点",
    "产品当前能力边界"
  ]);

  return {
    taskKind,
    sessionId: normalizeText(request.sessionId, DEFAULT_SESSION_ID),
    workspaceId: normalizeText(request.workspaceId, ""),
    turnId: normalizeText(request.turnId, DEFAULT_TURN_ID),
    taskId: normalizeText(request.taskId, DEFAULT_TASK_ID),
    topic,
    audience,
    tone,
    channel,
    goal,
    references,
    sourceObjectRef: asRecord(request.sourceObjectRef),
    requestedAt: normalizeText(request.requestedAt, ""),
    workflowKey: normalizeText(request.workflowKey, DEFAULT_ARTICLE_WORKFLOW_KEY),
    cliRefs: normalizeList(request.cliRefs, DEFAULT_CLI_REFS),
    connectorRefs: normalizeList(request.connectorRefs, DEFAULT_CONNECTOR_REFS),
    hookPolicy: normalizeHookPolicy(request.hookPolicy, DEFAULT_HOOK_POLICY),
    subagents: normalizeList(
      request.subagents,
      DEFAULT_WRITING_ORCHESTRATION.map((step) => step.subagent).filter(Boolean)
    ),
    skillRefs: normalizeList(
      request.skillRefs,
      Array.from(new Set(DEFAULT_WRITING_ORCHESTRATION.flatMap((step) => step.skillRefs)))
    ),
    orchestration: normalizeOrchestration(request.orchestration),
    hostManagedGeneration: hostManagedGenerationFromRequest(request)
  };
}

function isHostWorkerRequest(value) {
  const request = asRecord(value);
  return (
    request?.schemaVersion === WORKER_REQUEST_SCHEMA &&
    request?.appId === APP_ID
  );
}

function normalizeHostWorkerRequest(input) {
  const request = asRecord(input);
  if (!request) {
    return { error: "WORKER_REQUEST_INVALID" };
  }
  const runtime = asRecord(request.runtime);
  const expectedOutput = asRecord(request.expectedOutput);
  const taskKind = normalizeText(request.taskKind, "");
  const prompt = normalizeText(request.prompt, "");
  if (
    request.schemaVersion !== WORKER_REQUEST_SCHEMA ||
    request.appId !== APP_ID ||
    !normalizeText(request.sessionId, "") ||
    !normalizeText(request.turnId, "") ||
    !normalizeText(request.taskId, "") ||
    !taskKind ||
    !prompt
  ) {
    return { error: "WORKER_REQUEST_REQUIRED_FIELD_MISSING" };
  }
  if (!SUPPORTED_TASK_KINDS.has(taskKind)) {
    return { error: "WORKER_TASK_KIND_UNSUPPORTED" };
  }
  if (
    runtime?.directProviderAccess !== false ||
    runtime?.directFilesystemAccess !== false ||
    normalizeText(runtime?.outputArtifactKind, "") !== WORKSPACE_PATCH_KIND ||
    normalizeText(expectedOutput?.artifactKind, "") !== WORKSPACE_PATCH_KIND
  ) {
    return { error: "WORKER_RUNTIME_CONTRACT_UNSUPPORTED" };
  }
  const normalizedRequest = {
    taskKind,
    sessionId: normalizeText(request.sessionId, DEFAULT_SESSION_ID),
    workspaceId: normalizeText(request.workspaceId, ""),
    turnId: normalizeText(request.turnId, DEFAULT_TURN_ID),
    taskId: normalizeText(request.taskId, DEFAULT_TASK_ID),
    topic: prompt,
    goal: "生成一套可审核的首版内容资产",
    references: normalizeList(request.sourceArtifactIds, [
      "Claw 中间保持对话和审批",
      "右侧文章编辑器展示产物",
      "所有修改回流到 current turn"
    ]),
    sourceObjectRef: asRecord(request.sourceObjectRef),
    requestedAt: normalizeText(request.requestedAt, ""),
    workflowKey: normalizeText(
      request.workflowKey ?? request.pluginActivation?.workflow_key ?? request.pluginActivation?.workflowKey,
      DEFAULT_ARTICLE_WORKFLOW_KEY
    ),
    cliRefs: normalizeList(request.cliRefs, DEFAULT_CLI_REFS),
    connectorRefs: normalizeList(request.connectorRefs, DEFAULT_CONNECTOR_REFS),
    hookPolicy: normalizeHookPolicy(request.hookPolicy, DEFAULT_HOOK_POLICY),
    subagents: normalizeList(
      request.subagents,
      readStringListFromRecords(request.pluginActivation?.subagents, "id")
    ),
    skillRefs: normalizeList(
      request.skillRefs,
      readStringListFromRecords(request.pluginActivation?.skill_refs ?? request.pluginActivation?.skillRefs, "id")
    ),
    orchestration: normalizeOrchestration(
      request.orchestration ?? request.pluginActivation?.orchestration
    ),
    hostManagedGeneration: hostManagedGenerationFromRequest(request)
  };
  if (
    taskKind === "content.article.generate" &&
    !generatedDocumentTextFromHost(normalizedRequest.hostManagedGeneration)
  ) {
    return { error: "HOST_MANAGED_GENERATION_REQUIRED" };
  }
  return {
    request: normalizedRequest
  };
}

function objectRef({ kind, id, sessionId, turnId, taskId, artifactIds }) {
  return {
    appId: APP_ID,
    kind,
    id,
    sessionId,
    version: "v1",
    artifactIds,
    sourceTurnId: turnId,
    sourceTaskId: taskId
  };
}

function sourceBase({ taskKind, taskId, turnId, artifactIds }) {
  return {
    taskKind,
    taskId,
    turnId,
    artifactIds,
    evidenceIds: [`evidence-${taskId}`]
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function workspacePatchArtifact({ artifactId, patch, metadata = {}, status = "ready" }) {
  return {
    kind: "artifact.snapshot",
    artifactId,
    artifactRef: artifactId,
    path: WORKSPACE_PATCH_PATH,
    filePath: WORKSPACE_PATCH_PATH,
    file_path: WORKSPACE_PATCH_PATH,
    title: "Content Factory workspace patch",
    type: "document",
    status,
    contentType: "application/json",
    metadata: {
      kind: WORKSPACE_PATCH_KIND,
      articleWorkspaceSchema: ARTICLE_WORKSPACE_SCHEMA,
      contentFactoryWorkspacePatch: patch,
      workspace_patch: patch,
      ...metadata
    },
    content: JSON.stringify(patch)
  };
}

function runtimeEventEnvelope(eventType, payload) {
  return {
    kind: "runtime.event",
    eventType,
    payload
  };
}

function articleObjectFromPatch(patch) {
  return patch.objects?.find((object) => object?.ref?.kind === "articleDraft") ?? null;
}

function setArticleDocumentText(patch, documentText, status) {
  const article = articleObjectFromPatch(patch);
  if (!article?.source) {
    return patch;
  }
  const source = article.source ?? {};
  const streamingArticle = {
    ...cloneJson(article),
    status: status === "completed" ? "needs_review" : "generating",
    summary:
      status === "completed"
        ? article.summary
        : "正在生成文章草稿，正文将按段落进入同一产物。",
    source: {
      taskKind: source.taskKind,
      taskId: source.taskId,
      turnId: source.turnId,
      artifactIds: source.artifactIds,
      prompt: source.prompt,
      processMarkdown: source.processMarkdown,
      documentText,
      finalMarkdown: documentText,
      articleGenerationStatus:
        status === "completed" ? "complete" : "streaming",
      hostSearchStatus: source.hostSearchStatus || "completed"
    }
  };
  return {
    schemaVersion: patch.schemaVersion,
    appId: patch.appId,
    sessionId: patch.sessionId,
    workspaceId: patch.workspaceId,
    primaryObjectRef: streamingArticle.ref,
    selectedObjectRef: streamingArticle.ref,
    layoutState: {
      ...(patch.layoutState ?? {}),
      activeTabKind: "articleWorkspace",
      activePaneKind: "documentCanvas"
    },
    objects: [streamingArticle],
    ...(Array.isArray(patch.sourceArtifacts)
      ? { sourceArtifacts: cloneJson(patch.sourceArtifacts) }
      : {}),
    ...(patch.updatedAt ? { updatedAt: patch.updatedAt } : {})
  };
}

function markdownBlocks(markdown) {
  const blocks = [];
  let current = [];
  for (const line of normalizeText(markdown, "").split(/\r?\n/)) {
    if (!line.trim()) {
      if (current.length > 0) {
        blocks.push(current.join("\n").trim());
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) {
    blocks.push(current.join("\n").trim());
  }
  return blocks;
}

function isMarkdownHeading(block) {
  return block.trimStart().startsWith("#");
}

function articleDocumentPrefixes(documentText) {
  const blocks = markdownBlocks(documentText);
  if (blocks.length <= 2) {
    return [];
  }
  const prefixes = [];
  let current = "";
  for (let index = 0; index < blocks.length; index += 1) {
    current = current ? `${current}\n\n${blocks[index]}` : blocks[index];
    if (index === 0 && isMarkdownHeading(blocks[index])) {
      continue;
    }
    if (current.trim() !== normalizeText(documentText, "")) {
      prefixes.push(current);
    }
  }
  return prefixes;
}

function workflowConnectorRequestedEvents(context, patch) {
  if (
    !["content.article.generate", "content.factory.generate"].includes(context.taskKind) ||
    !context.orchestration.some((step) => step.id === "research")
  ) {
    return [];
  }
  const article = articleObjectFromPatch(patch);
  const searchRequests = Array.isArray(article?.source?.searchRequests)
    ? article.source.searchRequests
    : [];
  return searchRequests.map((request, index) =>
    runtimeEventEnvelope("workflow.connector.requested", {
      stepId: "research",
      connectorRef: normalizeText(request.connectorRef, "web-research"),
      toolName: "WebSearch",
      requestId: normalizeText(request.id, `search-request-${index + 1}`),
      roundId: normalizeText(request.roundId, `research-round-${index + 1}`),
      query: normalizeText(request.query, context.topic),
      purpose: normalizeText(request.purpose, "补齐文章写作依据。"),
      connectorExpectedOutput: normalizeText(request.expectedOutput, "searchEvidence"),
      status: normalizeText(request.status, "ready_for_host_execution"),
      order: Number.isFinite(request.order) ? request.order : index + 1,
      auditOnly: true
    })
  );
}

function mediaCacheRecord(context, { artifactId, format, kind, mimeType }) {
  const fileStem = safePathSegment(artifactId);
  const relativePath = [
    ".lime",
    "agent-apps",
    APP_ID,
    "sessions",
    safePathSegment(context.sessionId),
    "tasks",
    safePathSegment(context.taskId),
    `${fileStem}.${format}`
  ].join("/");

  return {
    status: "pending_executor",
    executor: "content-factory.media-cache.v1",
    kind,
    cacheKey: `${context.sessionId}:${context.taskId}:${artifactId}`,
    relativePath,
    manifestPath: `${relativePath}.manifest.json`,
    mimeType
  };
}

function buildBriefObject(context) {
  const id = `brief-${slugify(context.topic)}`;
  const artifactIds = [`artifact-${id}`];
  return {
    ref: objectRef({
      kind: "contentBrief",
      id,
      sessionId: context.sessionId,
      turnId: context.turnId,
      taskId: context.taskId,
      artifactIds
    }),
    title: "内容简报",
    status: "ready",
    summary: `${context.channel} 内容生产简报，面向${context.audience}。`,
    previewArtifactId: artifactIds[0],
    source: {
      ...sourceBase({
        taskKind: context.taskKind,
        taskId: context.taskId,
        turnId: context.turnId,
        artifactIds
      }),
      fields: [
        { key: "topic", label: "主题", value: context.topic },
        { key: "audience", label: "读者", value: context.audience },
        { key: "channel", label: "渠道", value: context.channel },
        { key: "tone", label: "语气", value: context.tone },
        { key: "goal", label: "目标", value: context.goal }
      ]
    }
  };
}

function buildArticleObject(context) {
  const id = `article-${slugify(context.topic)}`;
  const artifactIds = [`artifact-${id}`];
  const planning = buildArticlePlanning(context);
  const generatedDocumentText = generatedDocumentTextFromHost(
    context.hostManagedGeneration
  );
  const articleTitle =
    markdownTitleFromDocumentText(generatedDocumentText) ||
    planning.titleCandidates[0]?.title ||
    `${context.channel}文章草稿`;
  const documentText = generatedDocumentText || planning.documentText;
  const excerpt =
    markdownExcerptFromDocumentText(documentText) || planning.keyTakeaways[0];
  const generationMetadata = context.hostManagedGeneration
    ? {
        status: context.hostManagedGeneration.status,
        source: context.hostManagedGeneration.source,
        provider: context.hostManagedGeneration.provider,
        model: context.hostManagedGeneration.model,
        reasonCode: context.hostManagedGeneration.reasonCode,
        outputIds: context.hostManagedGeneration.outputs.map((output) => output.id).filter(Boolean)
      }
    : null;

  return {
    ref: objectRef({
      kind: "articleDraft",
      id,
      sessionId: context.sessionId,
      turnId: context.turnId,
      taskId: context.taskId,
      artifactIds
    }),
    title: articleTitle,
    status: "needs_review",
    summary: `围绕“${articleTitle || context.topic}”生成首版${context.channel}正文，可继续编辑、审稿和发布。`,
    previewArtifactId: artifactIds[0],
    source: {
      ...sourceBase({
        taskKind: "content.article.generate",
        taskId: context.taskId,
        turnId: context.turnId,
        artifactIds
      }),
      processMarkdown: planning.processMarkdown,
      documentText,
      finalMarkdown: documentText,
      excerpt,
      researchRounds: planning.researchRounds,
      titleCandidates: planning.titleCandidates,
      outline: planning.outline,
      keyTakeaways: planning.keyTakeaways,
      imageSlots: planning.imageSlots,
      citations: planning.citations,
      writingPlan: planning.writingPlan,
      searchRequests: planning.searchRequests,
      searchEvidence: planning.searchEvidence,
      reviewChecklist: planning.reviewChecklist,
      imagePlan: planning.imagePlan,
      reviewNotes: [
        "确认标题是否符合真实表达，不要夸大承诺。",
        "确认引用是否来自用户认可的资料。",
        "确认配图占位是否和正文段落一致。"
      ],
      hostManagedGeneration: generationMetadata
    }
  };
}

function buildImageSetObject(context) {
  const id = `images-${slugify(context.topic)}`;
  const planning = buildArticlePlanning(context);
  const artifactIds = planning.imageSlots.map((slot) => `artifact-${id}-${slot.id}`);
  const imageItems = planning.imageSlots.map((slot, index) => {
    const artifactId = artifactIds[index] ?? `artifact-${id}-${index + 1}`;
    const cache = mediaCacheRecord(context, {
      artifactId,
      format: "png",
      kind: "image",
      mimeType: "image/png"
    });
    return {
      id: artifactId,
      slotId: slot.id,
      title: slot.title,
      alt: `${context.topic} ${slot.title}`,
      cachedPath: cache.relativePath,
      cache,
      prompt: slot.prompt,
      purpose: slot.purpose,
      sectionId: slot.sectionId,
      citationIds: planning.citations.slice(0, 2).map((citation) => citation.id)
    };
  });
  return {
    ref: objectRef({
      kind: "imageGenerationSet",
      id,
      sessionId: context.sessionId,
      turnId: context.turnId,
      taskId: context.taskId,
      artifactIds
    }),
    title: "文章配图组",
    status: "draft",
    summary: `根据文章结构生成 ${imageItems.length} 个配图占位和提示词，等待模型执行或人工确认。`,
    previewArtifactId: artifactIds[0],
    source: {
      ...sourceBase({
        taskKind: "content.image.generate",
        taskId: context.taskId,
        turnId: context.turnId,
        artifactIds
      }),
      images: imageItems,
      imageSlots: planning.imageSlots,
      imagePlan: planning.imagePlan,
      searchRequests: planning.searchRequests,
      searchEvidence: planning.searchEvidence
    }
  };
}

function buildVideoScriptObject(context) {
  const id = `script-${slugify(context.topic)}`;
  const artifactIds = [`artifact-${id}`];
  return {
    ref: objectRef({
      kind: "videoScript",
      id,
      sessionId: context.sessionId,
      turnId: context.turnId,
      taskId: context.taskId,
      artifactIds
    }),
    title: "视频脚本",
    status: "draft",
    summary: "短视频口播脚本已整理，可继续派生分镜。",
    previewArtifactId: artifactIds[0],
    source: {
      ...sourceBase({
        taskKind: "content.video.script.generate",
        taskId: context.taskId,
        turnId: context.turnId,
        artifactIds
      }),
      markdown: [
        `# ${context.topic} 短视频脚本`,
        "",
        "## 0-5 秒",
        `如果你的团队已经有很多素材，却还是很难稳定交付内容，问题可能不在生成能力，而在产物没有进入同一个工作台。`,
        "",
        "## 5-20 秒",
        `内容工厂把文章、配图、视频分镜和交付清单放进右侧 Article Workspace，中间仍由 Claw 负责对话和审批。`,
        "",
        "## 20-35 秒",
        `这样每一次继续写作、重生成图片或确认交付，都会回到同一条可追踪的运行链路。`
      ].join("\n")
    }
  };
}

function buildStoryboardObject(context) {
  const id = `storyboard-${slugify(context.topic)}`;
  const artifactIds = [`artifact-${id}`];
  return {
    ref: objectRef({
      kind: "videoStoryboard",
      id,
      sessionId: context.sessionId,
      turnId: context.turnId,
      taskId: context.taskId,
      artifactIds
    }),
    title: "视频分镜",
    status: "needs_review",
    summary: "根据文章和脚本生成的首版分镜，等待确认镜头节奏。",
    previewArtifactId: artifactIds[0],
    source: {
      ...sourceBase({
        taskKind: "content.video.storyboard.generate",
        taskId: context.taskId,
        turnId: context.turnId,
        artifactIds
      }),
      shots: [
        {
          id: "shot-01",
          title: "痛点开场",
          description: "展示内容团队在多个工具间切换，素材和审核意见分散。",
          visualPrompt: "桌面工作台，多窗口内容草稿和素材列表，信息分散但真实克制",
          duration: "5s",
          cache: mediaCacheRecord(context, {
            artifactId: `${artifactIds[0]}-shot-01`,
            format: "mp4",
            kind: "video",
            mimeType: "video/mp4"
          })
        },
        {
          id: "shot-02",
          title: "工作台收敛",
          description: "Claw 对话保持在中间，右侧出现文章草稿和配图规划。",
          visualPrompt: "Lime 桌面端，中间对话，右侧 Article Workspace 产物区，清晰专业",
          duration: "8s",
          cache: mediaCacheRecord(context, {
            artifactId: `${artifactIds[0]}-shot-02`,
            format: "mp4",
            kind: "video",
            mimeType: "video/mp4"
          })
        },
        {
          id: "shot-03",
          title: "确认交付",
          description: "交付清单逐项确认，操作回到 Claw 继续生成或修改。",
          visualPrompt: "交付检查清单和确认按钮，旁边是运行历史和证据摘要",
          duration: "6s",
          cache: mediaCacheRecord(context, {
            artifactId: `${artifactIds[0]}-shot-03`,
            format: "mp4",
            kind: "video",
            mimeType: "video/mp4"
          })
        }
      ]
    }
  };
}

function buildChecklistObject(context) {
  const id = `checklist-${slugify(context.topic)}`;
  const artifactIds = [`artifact-${id}`];
  const planning = buildArticlePlanning(context);
  return {
    ref: objectRef({
      kind: "deliveryChecklist",
      id,
      sessionId: context.sessionId,
      turnId: context.turnId,
      taskId: context.taskId,
      artifactIds
    }),
    title: "交付检查清单",
    status: "needs_review",
    summary: "发布前检查项已生成，需要人工确认。",
    previewArtifactId: artifactIds[0],
    source: {
      ...sourceBase({
        taskKind: "content.delivery.review",
        taskId: context.taskId,
        turnId: context.turnId,
        artifactIds
      }),
      items: [
        {
          id: "check-article",
          title: "文章结构完整",
          status: planning.outline.length >= 5 ? "ready" : "pending",
          notes: `确认 ${planning.outline.length} 段大纲是否覆盖开场、检索、策划、正文和交付。`
        },
        {
          id: "check-research",
          title: "检索依据可追踪",
          status: planning.researchRounds.length >= 3 ? "ready" : "pending",
          notes: `已记录 ${planning.researchRounds.length} 轮检索，需确认引用是否来自用户认可资料。`
        },
        {
          id: "check-title",
          title: "标题候选可选择",
          status: planning.titleCandidates.length >= 3 ? "ready" : "pending",
          notes: `已生成 ${planning.titleCandidates.length} 个标题候选，需确认是否符合${context.channel}语气。`
        },
        {
          id: "check-images",
          title: "配图提示词可执行",
          status: planning.imageSlots.length >= 2 ? "ready" : "pending",
          notes: `已规划 ${planning.imageSlots.length} 个配图占位，需确认图片是否服务正文段落。`
        },
        {
          id: "check-storyboard",
          title: "视频分镜可交付",
          status: "pending",
          notes: "确认镜头标题、描述、视觉提示和时长都可用于后续生成。"
        }
      ]
    }
  };
}

function selectObjectsForTask(context) {
  const brief = buildBriefObject(context);
  const article = buildArticleObject(context);
  const images = buildImageSetObject(context);
  const script = buildVideoScriptObject(context);
  const storyboard = buildStoryboardObject(context);
  const checklist = buildChecklistObject(context);

  switch (context.taskKind) {
    case "content.article.generate":
      return { primary: article, objects: [brief, article, checklist] };
    case "content.image.generate":
      return { primary: images, objects: [article, images, checklist] };
    case "content.video.script.generate":
      return { primary: script, objects: [brief, article, script] };
    case "content.video.storyboard.generate":
      return { primary: storyboard, objects: [brief, script, storyboard, checklist] };
    case "content.delivery.review":
      return { primary: checklist, objects: [article, images, storyboard, checklist] };
    default:
      return { primary: article, objects: [brief, article, images, script, storyboard, checklist] };
  }
}

export function buildContentFactoryWorkspacePatch(request = {}) {
  const context = normalizeRequest(request);
  const selection = selectObjectsForTask(context);
  const planning = buildArticlePlanning(context);

  const patch = {
    schemaVersion: ARTICLE_WORKSPACE_SCHEMA,
    appId: APP_ID,
    sessionId: context.sessionId,
    primaryObjectRef: selection.primary.ref,
    selectedObjectRef: selection.primary.ref,
    objects: selection.objects,
    layoutState: {
      activeTabKind: "articleWorkspace",
      activePaneKind: selection.primary.ref.kind === "imageGenerationSet"
        ? "imageGrid"
        : selection.primary.ref.kind === "videoStoryboard"
          ? "storyboard"
          : selection.primary.ref.kind === "deliveryChecklist"
            ? "checklist"
            : "documentCanvas",
      openTabKinds: ["articleWorkspace", "files", "evidence"],
      splitMode: "chat-right-dock"
    }
  };
  if (context.workspaceId) {
    patch.workspaceId = context.workspaceId;
  }
  patch.sourceArtifacts = [
    {
      source: "content_factory_worker",
      artifactRef: `${context.taskId}:workspace-patch`,
      taskKind: context.taskKind,
      turnId: context.turnId
    }
  ];
  patch.workerEvidence = [
    {
      source: "worker",
      taskId: context.taskId,
      turnId: context.turnId,
      taskKind: context.taskKind,
      status: "completed",
      artifactKind: WORKSPACE_PATCH_KIND,
      inputSummary: `topic=${context.topic}`,
      outputSummary: `${selection.objects.length} workspace objects, ${planning.researchRounds.length} research rounds, ${planning.outline.length} outline sections`,
      outputObjectCount: selection.objects.length,
      workflowKey: context.workflowKey,
      cliRefs: context.cliRefs,
      connectorRefs: context.connectorRefs,
      hookPolicy: context.hookPolicy,
      subagents: context.subagents,
      skillRefs: context.skillRefs,
      researchRounds: planning.researchRounds,
      titleCandidates: planning.titleCandidates,
      outline: planning.outline,
      keyTakeaways: planning.keyTakeaways,
      imageSlots: planning.imageSlots,
      citations: planning.citations,
      writingPlan: planning.writingPlan,
      searchRequests: planning.searchRequests,
      searchEvidence: planning.searchEvidence,
      reviewChecklist: planning.reviewChecklist,
      imagePlan: planning.imagePlan,
      orchestration: context.orchestration
    }
  ];
  if (context.requestedAt) {
    patch.updatedAt = context.requestedAt;
  }
  return patch;
}

export function runContentFactoryTask(request = {}) {
  const patch = buildContentFactoryWorkspacePatch(request);
  return {
    artifactKind: WORKSPACE_PATCH_KIND,
    appId: APP_ID,
    taskKind: normalizeText(request.taskKind, "content.factory.generate"),
    patch
  };
}

export function buildContentFactoryWorkerProgressEvents(input = {}) {
  if (!isHostWorkerRequest(input)) {
    return [];
  }
  const normalized = normalizeHostWorkerRequest(input);
  if (normalized.error) {
    return [];
  }
  const request = normalized.request;
  if (!["content.article.generate", "content.factory.generate"].includes(request.taskKind)) {
    return [];
  }
  const patch = buildContentFactoryWorkspacePatch(request);
  const article = articleObjectFromPatch(patch);
  const documentText = normalizeText(article?.source?.documentText, "");
  const prefixes = articleDocumentPrefixes(documentText);
  if (prefixes.length === 0) {
    return [];
  }

  const connectorEvents = workflowConnectorRequestedEvents(request, patch);
  const artifactEvents = prefixes.map((prefix, index) => {
    const partialPatch = setArticleDocumentText(cloneJson(patch), prefix, "streaming");
    const artifact = workspacePatchArtifact({
      artifactId: `${request.taskId}:workspace-patch`,
      patch: partialPatch,
      status: "streaming",
      metadata: {
        complete: false,
        writePhase: "streaming",
        contentStatus: "streaming",
        streamSource: "worker_delta",
        streamSequence: index + 1
      }
    });
    return runtimeEventEnvelope("artifact.snapshot", { artifact });
  });
  return [...connectorEvents, ...artifactEvents];
}

export function handleContentFactoryWorkerRequest(input = {}) {
  if (!isHostWorkerRequest(input)) {
    const result = runContentFactoryTask(input);
    return {
      schemaVersion: WORKER_RESPONSE_SCHEMA,
      appId: APP_ID,
      sessionId: result.patch.sessionId,
      taskKind: result.taskKind,
      status: "completed",
      artifacts: [
        workspacePatchArtifact({
          artifactId: `${result.patch.sourceArtifacts?.[0]?.artifactRef ?? "workspace-patch"}`,
          patch: result.patch,
          metadata: {
            complete: true,
            writePhase: "persisted",
            contentStatus: "complete"
          }
        })
      ]
    };
  }

  const normalized = normalizeHostWorkerRequest(input);
  if (normalized.error) {
    return {
      schemaVersion: WORKER_RESPONSE_SCHEMA,
      appId: APP_ID,
      status: "failed",
      error: { code: normalized.error },
      artifacts: []
    };
  }
  const request = normalized.request;
  const patch = buildContentFactoryWorkspacePatch(request);
  return {
    schemaVersion: WORKER_RESPONSE_SCHEMA,
    appId: APP_ID,
    sessionId: request.sessionId,
    turnId: request.turnId,
    taskId: request.taskId,
    taskKind: request.taskKind,
    status: "completed",
    artifacts: [
      workspacePatchArtifact({
        artifactId: `${request.taskId}:workspace-patch`,
        patch,
        metadata: {
          complete: true,
          writePhase: "persisted",
          contentStatus: "complete"
        }
      })
    ]
  };
}

async function readStdinJson() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input.trim() ? JSON.parse(input) : {};
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const request = await readStdinJson();
  for (const event of buildContentFactoryWorkerProgressEvents(request)) {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  }
  const response = handleContentFactoryWorkerRequest(request);
  process.stdout.write(`${JSON.stringify(response)}\n`);
  if (response.status !== "completed") {
    process.exitCode = 1;
  }
}
