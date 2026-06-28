import { pathToFileURL } from "node:url";

const APP_ID = "content-factory-app";
const WORKER_REQUEST_SCHEMA = "content-factory.worker-request.v1";
const WORKER_RESPONSE_SCHEMA = "content-factory.worker-response.v1";
const PRODUCT_WORKSPACE_SCHEMA = "product-workspace.v1";
const WORKSPACE_PATCH_KIND = "content_factory.workspace_patch";

const DEFAULT_SESSION_ID = "session-content-factory-local";
const DEFAULT_TURN_ID = "turn-content-factory-local";
const DEFAULT_TASK_ID = "task-content-factory-local";
const DEFAULT_ARTICLE_WORKFLOW_KEY = "content_article_workflow";
const DEFAULT_WRITING_ORCHESTRATION = [
  {
    id: "research",
    title: "资料检索",
    subagent: "content-researcher",
    skillRefs: ["article-research"],
    status: "completed",
    summary: "整理用户需求、历史上下文和可引用资料。"
  },
  {
    id: "strategy",
    title: "选题策划",
    subagent: "content-strategist",
    skillRefs: ["article-strategy"],
    status: "completed",
    summary: "确定读者、文章角度、结构和标题方向。"
  },
  {
    id: "draft",
    title: "正文写作",
    subagent: "article-writer",
    skillRefs: ["article-writing"],
    status: "completed",
    summary: "生成文章草稿，并写入右侧 Product Profile。"
  },
  {
    id: "review",
    title: "审稿校对",
    subagent: "copy-editor",
    skillRefs: ["article-editing"],
    status: "completed",
    summary: "检查结构、语气、事实依据和可发布性。"
  },
  {
    id: "image-plan",
    title: "配图规划",
    subagent: "image-planner",
    skillRefs: ["article-image-plan"],
    status: "completed",
    summary: "生成主图和段落配图提示，等待后续图片执行。"
  }
];

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
    subagents: normalizeList(
      request.subagents,
      DEFAULT_WRITING_ORCHESTRATION.map((step) => step.subagent).filter(Boolean)
    ),
    skillRefs: normalizeList(
      request.skillRefs,
      Array.from(new Set(DEFAULT_WRITING_ORCHESTRATION.flatMap((step) => step.skillRefs)))
    ),
    orchestration: normalizeOrchestration(request.orchestration)
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
  return {
    request: {
      taskKind,
      sessionId: normalizeText(request.sessionId, DEFAULT_SESSION_ID),
      workspaceId: normalizeText(request.workspaceId, ""),
      turnId: normalizeText(request.turnId, DEFAULT_TURN_ID),
      taskId: normalizeText(request.taskId, DEFAULT_TASK_ID),
      topic: prompt,
      goal: "生成一套可审核的首版内容资产",
      references: normalizeList(request.sourceArtifactIds, [
        "Claw 中间保持对话和审批",
        "右侧 Product Profile 展示产物",
        "所有修改回流到 current turn"
      ]),
      sourceObjectRef: asRecord(request.sourceObjectRef),
      requestedAt: normalizeText(request.requestedAt, ""),
      workflowKey: normalizeText(
        request.workflowKey ?? request.pluginActivation?.workflow_key ?? request.pluginActivation?.workflowKey,
        DEFAULT_ARTICLE_WORKFLOW_KEY
      ),
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
      )
    }
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

function buildResearchRounds(context) {
  return [
    {
      id: "research-round-1",
      title: "主题和用户目标检索",
      query: `${context.topic} ${context.channel} 文章 用户目标`,
      status: "completed",
      summary: `确认主题是“${context.topic}”，目标读者是${context.audience}，文章需要服务于“${context.goal}”。`,
      citations: context.references.slice(0, 2)
    },
    {
      id: "research-round-2",
      title: "场景痛点和现有资料检索",
      query: `${context.topic} 痛点 场景 案例`,
      status: "completed",
      summary: "归纳已有需求讨论、产品能力边界和可复用案例，避免直接进入泛泛写作。",
      citations: context.references.slice(1, 3)
    },
    {
      id: "research-round-3",
      title: "结构和发布检查检索",
      query: `${context.channel} 文章 结构 发布检查 配图`,
      status: "completed",
      summary: "把检索结果收敛为开场、核心判断、参考依据、下一步和配图规划。",
      citations: context.references
    }
  ];
}

function buildCitations(context, researchRounds) {
  const references = context.references.length > 0
    ? context.references
    : ["用户输入主题", "当前工作流上下文"];
  const citationItems = references.map((reference, index) => ({
    id: `citation-${index + 1}`,
    title: reference,
    sourceType: index === 0 ? "user_reference" : "workflow_context",
    summary: `用于支撑“${context.topic}”文章中的第 ${index + 1} 个依据点。`,
    status: "available"
  }));
  return citationItems.length > 0
    ? citationItems
    : researchRounds.map((round, index) => ({
        id: `citation-${index + 1}`,
        title: round.title,
        sourceType: "research_round",
        summary: round.summary,
        status: "available"
      }));
}

function buildKeyTakeaways(context) {
  return [
    `读者是${context.audience}，文章必须先回答“为什么现在需要这件事”。`,
    "写作过程需要先整理依据，再策划结构，最后把正文和配图规划写入右侧产物区。",
    "聊天区只展示过程、小产物卡和可继续动作，避免把完整正文淹没在对话里。",
    `交付目标是${context.goal}，因此首版草稿必须可审核、可改写、可继续生成配图。`
  ];
}

function buildTitleCandidates(context) {
  return [
    {
      id: "title-1",
      title: `${context.topic}：不要只生成一段话，要交付一篇能继续迭代的文章`,
      angle: "产品和工作流升级",
      score: 0.92
    },
    {
      id: "title-2",
      title: `为什么${context.audience}需要一个会检索、会写作、会留痕的内容工厂`,
      angle: "读者痛点",
      score: 0.88
    },
    {
      id: "title-3",
      title: `从 @写文章 开始：把内容生产放回同一个工作台`,
      angle: "操作入口",
      score: 0.84
    }
  ];
}

function buildOutline(context, keyTakeaways) {
  return [
    {
      id: "section-opening",
      title: "开场：为什么普通对话式写作不够",
      purpose: "指出读者熟悉的失败体验，把问题从“生成文本”提升到“交付产物”。",
      points: [keyTakeaways[0], "没有检索和结构沉淀，文章很难继续修改。"],
      evidenceIds: ["citation-1"]
    },
    {
      id: "section-research",
      title: "先检索：写作之前要把依据铺出来",
      purpose: "解释为什么要有多轮检索和资料整理。",
      points: ["检索轮次让观点、证据和风险分开。", "低置信信息必须进入复核区。"],
      evidenceIds: ["citation-1", "citation-2"]
    },
    {
      id: "section-strategy",
      title: "再策划：标题、大纲和读者收益先对齐",
      purpose: "说明标题候选、大纲和写作计划如何减少返工。",
      points: [keyTakeaways[1], "大纲要能映射到正文和配图占位。"],
      evidenceIds: ["citation-2"]
    },
    {
      id: "section-draft",
      title: "后写作：正文进入右侧文章框，而不是塞进聊天流",
      purpose: "落实用户要的小框和右侧栏交互。",
      points: [keyTakeaways[2], "点击小框后打开右侧 Product Profile。"],
      evidenceIds: ["citation-3"]
    },
    {
      id: "section-delivery",
      title: "最后交付：审稿、配图和继续动作都要留在同一链路",
      purpose: "收束到可审核、可继续生成配图、可发布检查。",
      points: [keyTakeaways[3], "交付检查清单承接人工确认。"],
      evidenceIds: ["citation-3"]
    }
  ];
}

function buildImageSlots(context, outline) {
  return [
    {
      id: "image-slot-cover",
      title: "封面图",
      sectionId: "section-opening",
      purpose: "让读者第一眼看到“聊天过程”和“右侧文章产物”分工。",
      prompt: `Lime 桌面工作台，中间是写作过程小卡，右侧是文章草稿框，主题“${context.topic}”，清晰专业，适合${context.channel}封面`,
      status: "planned"
    },
    {
      id: "image-slot-research",
      title: "检索轮次图",
      sectionId: "section-research",
      purpose: "展示三轮检索如何进入写作依据。",
      prompt: `三轮资料检索流程图，包含主题目标、场景痛点、结构发布检查，中文标签清楚，面向${context.audience}`,
      status: "planned"
    },
    {
      id: "image-slot-outline",
      title: "文章结构图",
      sectionId: outline[2]?.id ?? "section-strategy",
      purpose: "展示标题候选、大纲、正文和配图规划的关系。",
      prompt: `文章生产结构图，标题候选、大纲、正文草稿、配图占位和交付清单从左到右排列，风格${context.tone}`,
      status: "planned"
    }
  ];
}

function buildWritingPlan(context) {
  return [
    {
      id: "plan-research",
      title: "资料检索",
      owner: "content-researcher",
      skillRef: "article-research",
      output: "researchRounds, citations, keyTakeaways",
      done: true
    },
    {
      id: "plan-strategy",
      title: "选题策划",
      owner: "content-strategist",
      skillRef: "article-strategy",
      output: "titleCandidates, outline",
      done: true
    },
    {
      id: "plan-draft",
      title: "正文写作",
      owner: "article-writer",
      skillRef: "article-writing",
      output: "articleDraft.source.markdown",
      done: true
    },
    {
      id: "plan-review",
      title: "审稿校对",
      owner: "copy-editor",
      skillRef: "article-editing",
      output: "deliveryChecklist",
      done: true
    },
    {
      id: "plan-image",
      title: "配图规划",
      owner: "image-planner",
      skillRef: "article-image-plan",
      output: "imageSlots, imageGenerationSet",
      done: true
    }
  ].map((step) => ({
    ...step,
    goal: context.goal
  }));
}

function buildArticleMarkdown(context, parts) {
  const {
    citations,
    imageSlots,
    keyTakeaways,
    outline,
    researchRounds,
    titleCandidates,
    writingPlan
  } = parts;
  const chosenTitle = titleCandidates[0]?.title ?? context.topic;
  const researchLines = researchRounds
    .map((round) => `- **${round.title}**：${round.summary}`)
    .join("\n");
  const citationLines = citations
    .map((citation) => `- ${citation.title}：${citation.summary}`)
    .join("\n");
  const outlineLines = outline
    .map((section, index) => `${index + 1}. **${section.title}**：${section.purpose}`)
    .join("\n");
  const imageSlotLines = imageSlots
    .map((slot) => `- ${slot.title}：${slot.purpose}`)
    .join("\n");
  const planLines = writingPlan
    .map((step) => `- ${step.title}（${step.owner} / ${step.skillRef}）：${step.output}`)
    .join("\n");

  return [
    `# ${chosenTitle}`,
    "",
    `这篇文章不是一次普通的聊天输出。面向${context.audience}，它要把“${context.topic}”讲成一条可追踪、可审核、可继续生产的内容工作流。`,
    "",
    "## 先说结论",
    "",
    keyTakeaways.map((item) => `- ${item}`).join("\n"),
    "",
    "## 为什么第一步不是直接写",
    "",
    `很多写作失败不是模型不会写，而是系统太快进入正文。没有检索轮次，用户看不到依据；没有大纲，正文会变成松散段落；没有右侧产物框，文章会被埋进聊天流里，很难继续改。`,
    "",
    `所以内容工厂启动“写文章”时，应该先让 ${DEFAULT_WRITING_ORCHESTRATION[0].subagent} 整理资料，再让 ${DEFAULT_WRITING_ORCHESTRATION[1].subagent} 规划结构，最后由 ${DEFAULT_WRITING_ORCHESTRATION[2].subagent} 把正文写入文章草稿对象。`,
    "",
    "## 三轮资料检索",
    "",
    researchLines,
    "",
    "## 标题候选",
    "",
    titleCandidates
      .map((candidate, index) => `${index + 1}. ${candidate.title}（${candidate.angle}）`)
      .join("\n"),
    "",
    "## 文章大纲",
    "",
    outlineLines,
    "",
    "## 正文草稿",
    "",
    "### 1. 普通对话式写作的问题",
    "",
    `如果用户输入“帮我写一篇文章”，系统马上在聊天区输出几千字，表面上看是完成了，实际留下三个问题：过程不可见、正文不可管理、后续配图和审稿没有承接点。用户想修改标题、补证据或生成配图时，只能回到一长串聊天文本里重新描述。`,
    "",
    "### 2. 内容工厂应该先跑工作流",
    "",
    `更合理的方式是把写作拆成可观察步骤：资料检索、选题策划、正文写作、审稿校对、配图规划。每一步都由插件声明的子智能体和技能承担，运行证据写入 worker evidence。这样用户看到的是几轮搜索和整理后的产物，而不是一个突然出现的长答案。`,
    "",
    "### 3. 正文应该进入右侧文章框",
    "",
    `聊天区适合承载过程、小框和继续动作；完整正文应该进入右侧 Product Profile 的文章草稿对象。用户点击小框后展开右侧栏，可以查看标题候选、大纲、正文、配图占位、引用和交付检查。这样“继续写”“生成配图”“审稿校对”都能回到同一个产物上。`,
    "",
    "### 4. 子智能体和 skills 必须来自插件",
    "",
    `写作相关能力不应该由宿主 hard code。内容工厂插件本身要携带 agents、skills、workflow 和 CLI，这样本地安装 ${APP_ID} 后，@写文章、@写作、子智能体编排和 worker 输出都能从插件 manifest 读取。宿主只负责安装、激活、渲染和回流 action。`,
    "",
    "### 5. 可交付的首版标准",
    "",
    `首版文章不需要一步到最终发布，但必须达到可审核：有检索摘要、有标题候选、有大纲、有正文、有配图规划、有引用来源和交付检查。达到这个标准后，${context.audience} 才能基于同一份 Product Profile 继续修改，而不是重新开一轮对话。`,
    "",
    "## 配图占位",
    "",
    imageSlotLines,
    "",
    "## 引用与依据",
    "",
    citationLines,
    "",
    "## 工作流编排",
    "",
    planLines,
    "",
    "## 下一步",
    "",
    `先让用户在右侧文章框确认标题和大纲，再根据正文段落执行配图生成，最后用交付检查清单确认是否达成“${context.goal}”。`
  ].join("\n");
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
  const researchRounds = buildResearchRounds(context);
  const citations = buildCitations(context, researchRounds);
  const keyTakeaways = buildKeyTakeaways(context);
  const titleCandidates = buildTitleCandidates(context);
  const outline = buildOutline(context, keyTakeaways);
  const imageSlots = buildImageSlots(context, outline);
  const writingPlan = buildWritingPlan(context);
  const markdown = buildArticleMarkdown(context, {
    citations,
    imageSlots,
    keyTakeaways,
    outline,
    researchRounds,
    titleCandidates,
    writingPlan
  });

  return {
    ref: objectRef({
      kind: "articleDraft",
      id,
      sessionId: context.sessionId,
      turnId: context.turnId,
      taskId: context.taskId,
      artifactIds
    }),
    title: `${context.channel}文章草稿`,
    status: "needs_review",
    summary: `已完成 ${researchRounds.length} 轮资料检索、${outline.length} 段大纲、${imageSlots.length} 个配图占位和首版正文，等待确认结构、观点和引用。`,
    previewArtifactId: artifactIds[0],
    source: {
      ...sourceBase({
        taskKind: "content.article.generate",
        taskId: context.taskId,
        turnId: context.turnId,
        artifactIds
      }),
      markdown,
      excerpt: keyTakeaways[0],
      researchRounds,
      titleCandidates,
      outline,
      keyTakeaways,
      imageSlots,
      citations,
      writingPlan,
      reviewNotes: [
        "确认标题是否符合真实表达，不要夸大承诺。",
        "确认引用是否来自用户认可的资料。",
        "确认配图占位是否和正文段落一致。"
      ]
    }
  };
}

function buildImageSetObject(context) {
  const id = `images-${slugify(context.topic)}`;
  const researchRounds = buildResearchRounds(context);
  const citations = buildCitations(context, researchRounds);
  const keyTakeaways = buildKeyTakeaways(context);
  const outline = buildOutline(context, keyTakeaways);
  const imageSlots = buildImageSlots(context, outline);
  const artifactIds = imageSlots.map((slot) => `artifact-${id}-${slot.id}`);
  const imageItems = imageSlots.map((slot, index) => {
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
      citationIds: citations.slice(0, 2).map((citation) => citation.id)
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
      imageSlots
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
        `内容工厂把文章、配图、视频分镜和交付清单放进右侧 Profile，中间仍由 Claw 负责对话和审批。`,
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
          description: "Claw 对话保持在中间，右侧出现文章草稿和配图 Profile。",
          visualPrompt: "Lime 桌面端，中间对话，右侧产物 Profile，清晰专业",
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
  const researchRounds = buildResearchRounds(context);
  const keyTakeaways = buildKeyTakeaways(context);
  const titleCandidates = buildTitleCandidates(context);
  const outline = buildOutline(context, keyTakeaways);
  const imageSlots = buildImageSlots(context, outline);
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
          status: outline.length >= 5 ? "ready" : "pending",
          notes: `确认 ${outline.length} 段大纲是否覆盖开场、检索、策划、正文和交付。`
        },
        {
          id: "check-research",
          title: "检索依据可追踪",
          status: researchRounds.length >= 3 ? "ready" : "pending",
          notes: `已记录 ${researchRounds.length} 轮检索，需确认引用是否来自用户认可资料。`
        },
        {
          id: "check-title",
          title: "标题候选可选择",
          status: titleCandidates.length >= 3 ? "ready" : "pending",
          notes: `已生成 ${titleCandidates.length} 个标题候选，需确认是否符合${context.channel}语气。`
        },
        {
          id: "check-images",
          title: "配图提示词可执行",
          status: imageSlots.length >= 2 ? "ready" : "pending",
          notes: `已规划 ${imageSlots.length} 个配图占位，需确认图片是否服务正文段落。`
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
  const researchRounds = buildResearchRounds(context);
  const citations = buildCitations(context, researchRounds);
  const keyTakeaways = buildKeyTakeaways(context);
  const titleCandidates = buildTitleCandidates(context);
  const outline = buildOutline(context, keyTakeaways);
  const imageSlots = buildImageSlots(context, outline);
  const writingPlan = buildWritingPlan(context);

  const patch = {
    schemaVersion: 1,
    appId: APP_ID,
    sessionId: context.sessionId,
    primaryObjectRef: selection.primary.ref,
    selectedObjectRef: selection.primary.ref,
    objects: selection.objects,
    layoutState: {
      activeTabKind: "productProfile",
      activePaneKind: selection.primary.ref.kind === "imageGenerationSet"
        ? "imageGrid"
        : selection.primary.ref.kind === "videoStoryboard"
          ? "storyboard"
          : selection.primary.ref.kind === "deliveryChecklist"
            ? "checklist"
            : "documentCanvas",
      openTabKinds: ["productProfile", "files", "evidence"],
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
      outputSummary: `${selection.objects.length} product objects, ${researchRounds.length} research rounds, ${outline.length} outline sections`,
      outputObjectCount: selection.objects.length,
      workflowKey: context.workflowKey,
      subagents: context.subagents,
      skillRefs: context.skillRefs,
      researchRounds,
      titleCandidates,
      outline,
      keyTakeaways,
      imageSlots,
      citations,
      writingPlan,
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
        {
          kind: "artifact.snapshot",
          artifactId: `${result.patch.sourceArtifacts?.[0]?.artifactRef ?? "workspace-patch"}`,
          title: "Content Factory workspace patch",
          contentType: "application/json",
          metadata: {
            kind: WORKSPACE_PATCH_KIND,
            productWorkspaceSchema: PRODUCT_WORKSPACE_SCHEMA,
            contentFactoryWorkspacePatch: result.patch,
            workspace_patch: result.patch
          },
          content: JSON.stringify(result.patch)
        }
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
      {
        kind: "artifact.snapshot",
        artifactId: `${request.taskId}:workspace-patch`,
        title: "Content Factory workspace patch",
        contentType: "application/json",
        metadata: {
          kind: WORKSPACE_PATCH_KIND,
          productWorkspaceSchema: PRODUCT_WORKSPACE_SCHEMA,
          contentFactoryWorkspacePatch: patch,
          workspace_patch: patch
        },
        content: JSON.stringify(patch)
      }
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
  const response = handleContentFactoryWorkerRequest(request);
  process.stdout.write(`${JSON.stringify(response)}\n`);
  if (response.status !== "completed") {
    process.exitCode = 1;
  }
}
