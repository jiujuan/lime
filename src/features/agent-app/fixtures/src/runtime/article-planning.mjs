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

function buildTopicProfile(context) {
  const rawTopic = `${context.topic} ${context.goal}`.toLowerCase();
  const isGoLearning =
    /golang|go语言|go 语言|学习 go|go 学习|learn go/.test(rawTopic) ||
    /\bgo\b/.test(rawTopic);
  if (isGoLearning) {
    return {
      subject: "Golang",
      foundation: "语法、类型、函数、接口、错误处理、包管理和标准库",
      practice: "命令行工具、HTTP 服务、数据库访问、测试用例和小型后台任务",
      advanced: "goroutine、channel、context、性能分析、部署和工程规范",
      pitfall: "只背语法和并发八股，却没有写过可运行、可测试、可维护的小项目",
      exampleProject: "写一个带单元测试的 REST API，或者写一个可取消的任务队列 worker"
    };
  }
  return {
    subject: context.topic,
    foundation: "核心概念、基本术语、常见场景和必要工具",
    practice: "一个能独立完成的小项目、一组可复用模板和一次真实复盘",
    advanced: "工程化方法、质量检查、性能边界和长期维护节奏",
    pitfall: "只收集资料却不做输出，或者只追求大而全却没有形成反馈闭环",
    exampleProject: "选择一个最小场景做出可交付版本，再根据反馈迭代"
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
    `${profile.subject} 的学习要先建立清晰主线：知道为什么学、先学什么、用什么项目验证。`,
    `第一阶段先掌握${profile.foundation}，不要一开始就钻进零散细节。`,
    `第二阶段用${profile.practice}建立反馈，把知识变成能运行的产物。`,
    `第三阶段补齐${profile.advanced}，让能力从“会写示例”升级到“能做工程”。`
  ];
}

export function buildTitleCandidates(context) {
  const profile = buildTopicProfile(context);
  return [
    {
      id: "title-1",
      title: `${profile.subject} 学习路线：从基础语法到工程实战`,
      angle: "学习路径",
      score: 0.92
    },
    {
      id: "title-2",
      title: `学习${profile.subject}，不要只停留在看懂示例`,
      angle: "常见误区",
      score: 0.88
    },
    {
      id: "title-3",
      title: `${profile.subject} 入门到进阶：一条更稳的实践路径`,
      angle: "行动建议",
      score: 0.84
    }
  ];
}

export function buildOutline(context, keyTakeaways) {
  const profile = buildTopicProfile(context);
  return [
    {
      id: "section-opening",
      title: "开场：先把学习目标从看懂改成能交付",
      purpose: `解释为什么学习${profile.subject}不能只停留在阅读教程。`,
      points: [keyTakeaways[0], `最大的误区是${profile.pitfall}。`],
      evidenceIds: ["citation-1"]
    },
    {
      id: "section-research",
      title: "基础：用最小知识集跑通第一批代码",
      purpose: `把${profile.foundation}收敛成第一阶段目标。`,
      points: [keyTakeaways[1], "每学一个概念，都要写出一段能运行的代码。"],
      evidenceIds: ["citation-1", "citation-2"]
    },
    {
      id: "section-strategy",
      title: "实践：用项目把知识连成闭环",
      purpose: `通过${profile.practice}建立真实反馈。`,
      points: [keyTakeaways[2], `建议从“${profile.exampleProject}”开始。`],
      evidenceIds: ["citation-2"]
    },
    {
      id: "section-draft",
      title: "进阶：补齐工程化能力",
      purpose: `把${profile.advanced}纳入长期学习。`,
      points: [keyTakeaways[3], "进阶阶段要关注可观测、可测试和可维护。"],
      evidenceIds: ["citation-3"]
    },
    {
      id: "section-delivery",
      title: "复盘：把学习节奏长期化",
      purpose: "用固定复盘保持持续进步，而不是靠一次冲刺。",
      points: ["每周复盘一次代码、问题和下一步计划。", "把输出结果沉淀成可复用笔记和项目模板。"],
      evidenceIds: ["citation-3"]
    }
  ];
}

export function buildImageSlots(context, outline) {
  const profile = buildTopicProfile(context);
  return [
    {
      id: "image-slot-cover",
      title: "学习路线封面图",
      sectionId: "section-opening",
      purpose: `展示${profile.subject}从入门到工程实战的主线。`,
      prompt: `${profile.subject} 学习路线图，包含基础、项目、工程化、复盘四段，中文标签清楚，适合${context.channel}封面`,
      status: "planned"
    },
    {
      id: "image-slot-research",
      title: "项目实践图",
      sectionId: "section-research",
      purpose: "展示用项目把知识转成真实反馈。",
      prompt: `${profile.subject} 项目实践示意图，代码、测试、运行日志和复盘清单从左到右排列，中文标签清楚，面向${context.audience}`,
      status: "planned"
    },
    {
      id: "image-slot-outline",
      title: "复盘清单图",
      sectionId: outline[2]?.id ?? "section-strategy",
      purpose: "展示每周如何检查学习进展。",
      prompt: `${profile.subject} 学习复盘清单，包含已学概念、项目进展、问题记录、下一步计划，风格${context.tone}`,
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
    `很多人开始学${profile.subject}时，会先收集课程、语法清单和示例代码。但真正决定学习效果的，往往不是资料数量，而是你能不能把知识变成一个可运行、可测试、可复盘的成果。`,
    "",
    `如果目标读者是${context.audience}，这篇文章最想解决的问题是：怎样用一条稳定路径学习${profile.subject}，避免在教程、概念和零散代码之间来回打转。`,
    "",
    "## 先把目标定清楚",
    "",
    `${keyTakeaways[0]}学习目标不要写成“我要学会全部语法”，而要写成“我能独立完成一个小功能，并解释它为什么这样设计”。目标越具体，学习路径越不容易变形。`,
    "",
    `对${profile.subject}来说，一个更稳的目标是：先写出能运行的代码，再补语言细节；先完成小项目，再追求架构完整；先用测试保护改动，再讨论性能和工程规范。`,
    "",
    "## 第一阶段：打牢基础",
    "",
    `第一阶段不用追求大而全，重点是掌握${profile.foundation}。这一阶段最有效的方式，是每学一个概念就写一段小代码：定义结构体、处理错误、组织包、写一个简单测试，再从运行结果里确认自己真的理解了。`,
    "",
    "如果遇到看不懂的语法，不要只停在搜索答案。更好的做法是把它拆成三个问题：它解决什么问题、它和我已经学过的概念有什么关系、我能不能写一个更小的例子复现它。",
    "",
    "## 第二阶段：用项目建立反馈",
    "",
    `第二阶段要进入${profile.practice}。这时不要再把学习成果停留在笔记里，而要做一个能被别人运行的东西。${profile.exampleProject}，就是一个合适的起点。`,
    "",
    "项目不需要复杂，但必须完整。它至少要有清晰入口、错误处理、测试用例和一份能说明如何运行的 README。这样你会自然遇到依赖管理、目录组织、接口边界和调试方法，这些才是学习真正开始变扎实的地方。",
    "",
    "## 第三阶段：补齐工程化能力",
    "",
    `当基础和项目都跑通后，再进入${profile.advanced}。这个阶段不要把并发、性能或架构当成孤立知识点，它们都应该回到具体问题里：请求为什么变慢、任务为什么不能取消、错误为什么难定位、部署后怎么观察状态。`,
    "",
    `${profile.subject} 的进阶学习尤其需要克制。并发不是越多越好，抽象不是越早越好，性能优化也不是越复杂越好。先写出简单直接的实现，再用测试、日志和性能分析确认瓶颈，最后再决定是否引入更复杂的设计。`,
    "",
    "## 最容易踩的坑",
    "",
    `最常见的坑是${profile.pitfall}。它会让学习看起来很努力，但每隔一段时间又回到原点：教程看过很多，真正动手时还是不知道从哪里开始。`,
    "",
    "解决这个问题的办法很朴素：每周只保留一到两个学习重点，每个重点必须对应一个输出。输出可以是一段代码、一个测试、一次性能对比、一篇复盘，或者一个小项目的新功能。没有输出，就说明这个知识点还没有真正进入你的能力范围。",
    "",
    "## 30 天行动建议",
    "",
    "前 7 天，集中补基础。每天写一个小例子，重点练习语法、类型、错误处理、包组织和测试。",
    "",
    "第 8 到 20 天，完成一个小项目。项目可以很小，但必须能运行、能测试、能说明设计取舍。",
    "",
    "第 21 到 30 天，做工程化补强。给项目加日志、配置、并发控制、性能观察和部署说明，同时复盘哪些地方写得别扭，哪些地方需要重构。",
    "",
    "## 结尾",
    "",
    `学习${profile.subject}不是把所有知识一次性装进脑子里，而是持续把知识变成可交付成果。先打牢基础，再用项目获得反馈，最后补齐工程化能力。只要这条主线不丢，学习就会从“看过很多”变成“真的能做”。`
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
