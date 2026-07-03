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
    summary: "生成文章草稿，并写入 articleDraft 产物。"
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

function buildTopicProfile(context) {
  return {
    subject: context.topic,
    readerQuestion: `为什么“${context.topic}”值得现在写清楚`,
    coreFrame: "问题背景、关键判断、依据展开、行动建议和发布检查",
    evidenceNeed: "用户材料、业务场景、公开资料和可验证案例",
    deliveryFocus: "形成一篇结构清晰、可审稿、可继续迭代的正文",
    pitfall: "直接堆观点或套模板，却没有说明读者对象、使用场景和判断依据",
    nextAction: "先把目标读者、核心问题和可验证依据列成清单，再开始写正文"
  };
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
  const profile = buildTopicProfile(context);
  return [
    `这篇文章要先回答：${profile.readerQuestion}。`,
    `正文结构应覆盖${profile.coreFrame}，避免只堆素材。`,
    `每个关键判断都需要回到${profile.evidenceNeed}。`,
    `最终交付目标是${profile.deliveryFocus}。`
  ];
}

export function buildTitleCandidates(context) {
  const profile = buildTopicProfile(context);
  return [
    {
      id: "title-1",
      title: `${profile.subject}：先把问题说清楚`,
      angle: "问题定义",
      score: 0.92
    },
    {
      id: "title-2",
      title: `写${context.channel}文章，别急着套模板`,
      angle: "写作方法",
      score: 0.88
    },
    {
      id: "title-3",
      title: `${profile.subject}的文章要先有判断，再有表达`,
      angle: "内容判断",
      score: 0.84
    }
  ];
}

export function buildOutline(context, keyTakeaways) {
  const profile = buildTopicProfile(context);
  return [
    {
      id: "section-opening",
      title: "开场：交代场景和读者问题",
      purpose: `解释${profile.readerQuestion}。`,
      points: [keyTakeaways[0], `最大的误区是${profile.pitfall}。`],
      evidenceIds: ["citation-1"]
    },
    {
      id: "section-research",
      title: "判断：明确文章要成立的核心依据",
      purpose: `把${profile.evidenceNeed}收敛成可审稿依据。`,
      points: [keyTakeaways[1], "每个判断都要能回到用户材料、事实或可验证案例。"],
      evidenceIds: ["citation-1", "citation-2"]
    },
    {
      id: "section-strategy",
      title: "展开：把观点拆成可验证的段落",
      purpose: "把核心观点拆成读者能顺着读下去的段落。",
      points: [keyTakeaways[2], `建议从“${profile.nextAction}”开始。`],
      evidenceIds: ["citation-2"]
    },
    {
      id: "section-draft",
      title: "行动：给出读者下一步",
      purpose: "把文章落到可执行建议，而不是只停留在观点。",
      points: [keyTakeaways[3], "行动建议要具体到读者下一次可以做什么。"],
      evidenceIds: ["citation-3"]
    },
    {
      id: "section-delivery",
      title: "检查：发布前核对事实和表达",
      purpose: "确认正文结构、事实依据和语气都符合发布要求。",
      points: ["核对标题是否夸大承诺。", "核对引用、案例和配图是否服务正文。"],
      evidenceIds: ["citation-3"]
    }
  ];
}

export function buildImageSlots(context, outline) {
  const profile = buildTopicProfile(context);
  return [
    {
      id: "image-slot-cover",
      title: "主题封面图",
      sectionId: "section-opening",
      purpose: `展示“${profile.subject}”的核心场景和读者问题。`,
      prompt: `${profile.subject} 主题封面图，包含场景、问题、判断、行动四个中文标签，适合${context.channel}封面`,
      status: "planned"
    },
    {
      id: "image-slot-research",
      title: "观点结构图",
      sectionId: "section-research",
      purpose: "展示观点、依据和段落之间的关系。",
      prompt: `${profile.subject} 观点结构图，问题、依据、段落、结论从左到右排列，中文标签清楚，面向${context.audience}`,
      status: "planned"
    },
    {
      id: "image-slot-outline",
      title: "发布检查图",
      sectionId: outline[2]?.id ?? "section-strategy",
      purpose: "展示发布前如何检查事实、结构和表达。",
      prompt: `${profile.subject} 发布检查清单，包含标题、事实、结构、配图、下一步五项，风格${context.tone}`,
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
      output: "articleDraft.source.processMarkdown + documentText",
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
  const { keyTakeaways, titleCandidates } = parts;
  const profile = buildTopicProfile(context);
  const chosenTitle = titleCandidates[0]?.title ?? context.topic;

  return [
    `# ${chosenTitle}`,
    "",
    `很多文章看起来信息很满，但读者读完仍然不知道它到底解决什么问题。真正有效的${context.channel}文章，首先要把读者、场景和核心判断说清楚。`,
    "",
    `如果目标读者是${context.audience}，这篇文章最想解决的问题是：${profile.readerQuestion}。`,
    "",
    "## 先交代读者为什么要关心",
    "",
    `${keyTakeaways[0]}开场不要急着给结论，先写清楚谁正在遇到什么问题，以及这个问题为什么现在需要被处理。`,
    "",
    `对“${profile.subject}”来说，一个更稳的写法是先说明场景，再说明判断，最后给出读者能带走的行动。`,
    "",
    "## 把核心判断写成一句话",
    "",
    `${keyTakeaways[1]}核心判断越清楚，后面的段落越不容易散。它可以是一句明确观点，也可以是一条判断标准。`,
    "",
    "如果一句话说不清楚，就先不要扩写正文。先把想表达的判断拆成对象、问题、依据和建议，确认它能被读者理解。",
    "",
    "## 用依据支撑每个段落",
    "",
    `${keyTakeaways[2]}依据不一定都来自外部检索，也可以来自用户材料、业务案例、历史讨论或可复盘的经验。关键是每个观点都要能被追问。`,
    "",
    "段落之间也要有递进关系：先讲问题，再讲判断，再讲依据，最后给行动。这样读者不会被素材淹没。",
    "",
    "## 给出下一步行动",
    "",
    `${keyTakeaways[3]}文章的最后不要只做情绪收束，也要告诉读者下一步可以怎么做。`,
    "",
    `一个可执行的建议是：${profile.nextAction}。这能帮助正文从观点变成可落地的行动。`,
    "",
    "## 发布前再做一次核对",
    "",
    `最常见的坑是${profile.pitfall}。发布前要检查标题、事实、案例、语气和配图是否都服务同一个核心判断。`,
    "",
    "如果某一段删掉后并不影响读者理解，说明它可能只是填充内容；如果某个配图不能帮助读者理解结构，也应该重新规划。",
    "",
    "## 结尾",
    "",
    `写好“${profile.subject}”不是套一个固定模板，而是把读者问题、判断依据和行动建议连成一条清楚的线。只要这条线成立，正文就能继续审稿、编辑和发布。`
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n")
    .trim();
}

export function buildArticleProcessMarkdown(context, parts) {
  const {
    keyTakeaways,
    outline,
    researchRounds,
    searchRequests,
    titleCandidates,
    writingPlan
  } = parts;
  const chosenTitle = titleCandidates[0]?.title ?? context.topic;
  return [
    `# ${chosenTitle}`,
    "",
    `过程稿：面向${context.audience}，先完成检索、策划和正文草稿，再进入最终文章产物。`,
    "",
    "## 检索轮次",
    "",
    researchRounds.map((round) => `- ${round.title}：${round.summary}`).join("\n"),
    "",
    "## 待执行检索",
    "",
    searchRequests.map((request) => `- ${request.query}（${request.purpose}）`).join("\n"),
    "",
    "## 标题候选",
    "",
    titleCandidates
      .map((candidate, index) => `${index + 1}. ${candidate.title}（${candidate.angle}）`)
      .join("\n"),
    "",
    "## 结构与观点",
    "",
    outline.map((section) => `- ${section.title}：${section.purpose}`).join("\n"),
    "",
    "## 核心观点",
    "",
    keyTakeaways.map((item) => `- ${item}`).join("\n"),
    "",
    "## 编排步骤",
    "",
    writingPlan
      .map((step) => `- ${step.title}（${step.owner} / ${step.skillRef}）：${step.output}`)
      .join("\n")
  ]
    .join("\n")
    .trim();
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
  const processMarkdown = buildArticleProcessMarkdown(context, {
    keyTakeaways,
    outline,
    researchRounds,
    searchRequests,
    titleCandidates,
    writingPlan
  });
  const documentText = buildArticleMarkdown(context, {
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
    documentText,
    imagePlan,
    imageSlots,
    keyTakeaways,
    outline,
    processMarkdown,
    researchRounds,
    reviewChecklist,
    searchEvidence,
    searchRequests,
    titleCandidates,
    writingPlan
  };
}
