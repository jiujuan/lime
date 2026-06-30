export const DEFAULT_WRITING_ORCHESTRATION = [
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
    summary: "生成文章草稿，并写入文章产物框与右侧文章编辑器。"
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

function normalizeText(value, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function normalizeReferenceList(context) {
  return context.references.length > 0
    ? context.references
    : ["用户输入主题", "当前工作流上下文"];
}

function articleSearchQueries(context) {
  return [
    {
      id: "search-request-1",
      roundId: "research-round-1",
      connectorRef: "web-research",
      tool: "search_query",
      query: `${context.topic} ${context.channel} 文章 用户目标`,
      purpose: "确认主题、读者和文章目标。"
    },
    {
      id: "search-request-2",
      roundId: "research-round-2",
      connectorRef: "web-research",
      tool: "search_query",
      query: `${context.topic} 痛点 场景 案例`,
      purpose: "补齐场景痛点、案例和风险点。"
    },
    {
      id: "search-request-3",
      roundId: "research-round-3",
      connectorRef: "web-research",
      tool: "search_query",
      query: `${context.channel} 文章 结构 发布检查 配图`,
      purpose: "确认文章结构、发布检查和配图规划。"
    }
  ];
}

export function buildSearchRequests(context) {
  return articleSearchQueries(context).map((request, index) => ({
    ...request,
    status: "ready_for_host_execution",
    order: index + 1,
    expectedOutput: "searchEvidence"
  }));
}

export function buildResearchRounds(context) {
  const searchRequests = buildSearchRequests(context);
  return [
    {
      id: "research-round-1",
      title: "主题和用户目标检索",
      query: searchRequests[0]?.query ?? `${context.topic} ${context.channel}`,
      status: "completed",
      connectorRef: "web-research",
      searchRequestId: "search-request-1",
      evidenceStatus: "host_evidence_required",
      summary: `确认主题是“${context.topic}”，目标读者是${context.audience}，文章需要服务于“${context.goal}”。`,
      citations: context.references.slice(0, 2)
    },
    {
      id: "research-round-2",
      title: "场景痛点和现有资料检索",
      query: searchRequests[1]?.query ?? `${context.topic} 痛点`,
      status: "completed",
      connectorRef: "web-research",
      searchRequestId: "search-request-2",
      evidenceStatus: "host_evidence_required",
      summary: "归纳已有需求讨论、产品能力边界和可复用案例，避免直接进入泛泛写作。",
      citations: context.references.slice(1, 3)
    },
    {
      id: "research-round-3",
      title: "结构和发布检查检索",
      query: searchRequests[2]?.query ?? `${context.channel} 文章 结构`,
      status: "completed",
      connectorRef: "web-research",
      searchRequestId: "search-request-3",
      evidenceStatus: "host_evidence_required",
      summary: "把检索结果收敛为开场、核心判断、参考依据、下一步和配图规划。",
      citations: context.references
    }
  ];
}

export function buildSearchEvidence(context, researchRounds) {
  const references = normalizeReferenceList(context);
  return researchRounds.map((round, index) => ({
    id: `search-evidence-${index + 1}`,
    roundId: round.id,
    connectorRef: "web-research",
    status: "pending_host_execution",
    query: round.query,
    summary: round.summary,
    citations: references.slice(0, Math.min(index + 1, references.length)),
    confidence: references.length > index ? "medium" : "needs_review"
  }));
}

export function buildCitations(context, researchRounds) {
  const references = normalizeReferenceList(context);
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

export function buildKeyTakeaways(context) {
  return [
    `读者是${context.audience}，文章必须先回答“为什么现在需要这件事”。`,
    "写作过程需要先整理依据，再策划结构，最后把正文和配图规划写入文章产物框和右侧编辑器。",
    "聊天区只展示过程、小产物卡和可继续动作，避免把完整正文淹没在对话里。",
    `交付目标是${context.goal}，因此首版草稿必须可审核、可改写、可继续生成配图。`
  ];
}

export function buildTitleCandidates(context) {
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
      title: "从 @写文章 开始：把内容生产放回同一个工作台",
      angle: "操作入口",
      score: 0.84
    }
  ];
}

export function buildOutline(context, keyTakeaways) {
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
      points: [keyTakeaways[2], "点击小框后打开右侧文章编辑器。"],
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

export function buildImageSlots(context, outline) {
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

export function buildWritingPlan(context) {
  const orchestrationById = new Map(
    context.orchestration.map((step) => [normalizeText(step.id), step])
  );
  return [
    {
      id: "plan-research",
      orchestrationStepId: "research",
      title: "资料检索",
      owner: "content-researcher",
      skillRef: "article-research",
      output: "researchRounds, citations, keyTakeaways",
      done: true
    },
    {
      id: "plan-strategy",
      orchestrationStepId: "strategy",
      title: "选题策划",
      owner: "content-strategist",
      skillRef: "article-strategy",
      output: "titleCandidates, outline",
      done: true
    },
    {
      id: "plan-draft",
      orchestrationStepId: "draft",
      title: "正文写作",
      owner: "article-writer",
      skillRef: "article-writing",
      output: "articleDraft.source.markdown",
      done: true
    },
    {
      id: "plan-review",
      orchestrationStepId: "review",
      title: "审稿校对",
      owner: "copy-editor",
      skillRef: "article-editing",
      output: "deliveryChecklist",
      done: true
    },
    {
      id: "plan-image",
      orchestrationStepId: "image-plan",
      title: "配图规划",
      owner: "image-planner",
      skillRef: "article-image-plan",
      output: "imageSlots, imageGenerationSet",
      done: true
    }
  ].map((step) => {
    const orchestrationStep = orchestrationById.get(step.orchestrationStepId);
    return {
      ...step,
      title: normalizeText(orchestrationStep?.title, step.title),
      owner: normalizeText(orchestrationStep?.subagent, step.owner),
      skillRef: normalizeText(orchestrationStep?.skillRefs?.[0], step.skillRef),
      goal: context.goal
    };
  });
}

export function buildReviewChecklist(context, parts) {
  return [
    {
      id: "review-structure",
      title: "结构完整",
      status: parts.outline.length >= 5 ? "ready" : "needs_revision",
      owner: "copy-editor",
      notes: `确认 ${parts.outline.length} 段结构是否覆盖开场、检索、策划、正文和交付。`
    },
    {
      id: "review-evidence",
      title: "依据可追踪",
      status: parts.citations.length >= 1 ? "ready" : "needs_evidence",
      owner: "content-researcher",
      notes: "引用必须能回到用户材料、检索摘要或后续 host search evidence。"
    },
    {
      id: "review-voice",
      title: "表达符合目标读者",
      status: "ready",
      owner: "copy-editor",
      notes: `语气保持“${context.tone}”，避免泛泛营销话术。`
    }
  ];
}

export function buildImagePlan(context, imageSlots) {
  return {
    status: "planned",
    owner: "image-planner",
    connectorRef: "media-generation",
    slotCount: imageSlots.length,
    nextAction: "generate_images_after_article_review",
    slots: imageSlots.map((slot, index) => ({
      id: slot.id,
      order: index + 1,
      title: slot.title,
      sectionId: slot.sectionId,
      prompt: slot.prompt,
      purpose: slot.purpose,
      status: slot.status
    }))
  };
}

export function buildArticleMarkdown(context, parts) {
  const {
    citations,
    imageSlots,
    keyTakeaways,
    outline,
    researchRounds,
    reviewChecklist,
    searchRequests,
    titleCandidates,
    writingPlan
  } = parts;
  const chosenTitle = titleCandidates[0]?.title ?? context.topic;
  const researchLines = researchRounds
    .map((round) => `- **${round.title}**：${round.summary}`)
    .join("\n");
  const searchLines = searchRequests
    .map((request) => `- ${request.query}（${request.purpose}）`)
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
  const reviewLines = reviewChecklist
    .map((item) => `- ${item.title}：${item.notes}`)
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
    "很多写作失败不是模型不会写，而是系统太快进入正文。没有检索轮次，用户看不到依据；没有大纲，正文会变成松散段落；没有右侧产物框，文章会被埋进聊天流里，很难继续改。",
    "",
    `所以内容工厂启动“写文章”时，应该先让 ${DEFAULT_WRITING_ORCHESTRATION[0].subagent} 整理资料，再让 ${DEFAULT_WRITING_ORCHESTRATION[1].subagent} 规划结构，最后由 ${DEFAULT_WRITING_ORCHESTRATION[2].subagent} 把正文写入文章草稿对象。`,
    "",
    "## 三轮资料检索",
    "",
    researchLines,
    "",
    "## Host 待执行检索请求",
    "",
    searchLines,
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
    "如果用户输入“帮我写一篇文章”，系统马上在聊天区输出几千字，表面上看是完成了，实际留下三个问题：过程不可见、正文不可管理、后续配图和审稿没有承接点。用户想修改标题、补证据或生成配图时，只能回到一长串聊天文本里重新描述。",
    "",
    "### 2. 内容工厂应该先跑工作流",
    "",
    "更合理的方式是把写作拆成可观察步骤：资料检索、选题策划、正文写作、审稿校对、配图规划。每一步都由插件声明的子智能体和技能承担，运行证据写入 worker evidence。这样用户看到的是几轮搜索和整理后的产物，而不是一个突然出现的长答案。",
    "",
    "### 3. 正文应该进入右侧文章框",
    "",
    "聊天区适合承载过程、小框和继续动作；完整正文应该进入独立的文章产物框，再从这里打开右侧文章编辑器。用户点击小框后展开右侧栏，可以查看标题候选、大纲、正文、配图占位、引用和交付检查。这样“继续写”“生成配图”“审稿校对”都能回到同一个产物上。",
    "",
    "### 4. 子智能体和 skills 必须来自插件",
    "",
    "写作相关能力不应该由宿主 hard code。内容工厂插件本身要携带 agents、skills、workflow 和 CLI，这样本地安装 content-factory-app 后，@写文章、@写作、子智能体编排和 worker 输出都能从插件 manifest 读取。宿主只负责安装、激活、渲染和回流 action。",
    "",
    "### 5. 可交付的首版标准",
    "",
    `首版文章不需要一步到最终发布，但必须达到可审核：有检索摘要、有标题候选、有大纲、有正文、有配图规划、有引用来源和交付检查。达到这个标准后，${context.audience} 才能基于同一份文章产物继续修改，而不是重新开一轮对话。`,
    "",
    "## 配图占位",
    "",
    imageSlotLines,
    "",
    "## 审稿检查",
    "",
    reviewLines,
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

export function buildArticlePlanning(context) {
  const researchRounds = buildResearchRounds(context);
  const searchRequests = buildSearchRequests(context);
  const searchEvidence = buildSearchEvidence(context, researchRounds);
  const citations = buildCitations(context, researchRounds);
  const keyTakeaways = buildKeyTakeaways(context);
  const titleCandidates = buildTitleCandidates(context);
  const outline = buildOutline(context, keyTakeaways);
  const imageSlots = buildImageSlots(context, outline);
  const writingPlan = buildWritingPlan(context);
  const reviewChecklist = buildReviewChecklist(context, {
    citations,
    outline
  });
  const imagePlan = buildImagePlan(context, imageSlots);
  const markdown = buildArticleMarkdown(context, {
    citations,
    imageSlots,
    keyTakeaways,
    outline,
    researchRounds,
    reviewChecklist,
    searchRequests,
    titleCandidates,
    writingPlan
  });
  return {
    citations,
    imagePlan,
    imageSlots,
    keyTakeaways,
    markdown,
    outline,
    researchRounds,
    reviewChecklist,
    searchEvidence,
    searchRequests,
    titleCandidates,
    writingPlan
  };
}
