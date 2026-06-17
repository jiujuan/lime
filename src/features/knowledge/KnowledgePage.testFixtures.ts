import type {
  KnowledgePackDetail,
  KnowledgePackStatus,
} from "@/lib/api/knowledge";

export function buildPackDetail(
  name = "founder-personal-ip",
  overrides?: {
    description?: string;
    type?: string;
    status?: KnowledgePackStatus;
    defaultForWorkspace?: boolean;
    trust?: string;
  },
): KnowledgePackDetail {
  const now = 1_712_345_678_900;
  const rootPath = `/tmp/project/.lime/knowledge/packs/${name}`;
  const isFounder = name === "founder-personal-ip";
  const description =
    overrides?.description ??
    (isFounder ? "创始人个人 IP 项目资料" : "金花黑茶品牌产品资料");
  const packType =
    overrides?.type ?? (isFounder ? "personal-ip" : "brand-product");
  const status = overrides?.status ?? "ready";

  return {
    metadata: {
      name,
      description,
      type: packType,
      status,
      version: "1.0.0",
      language: "zh-CN",
      license: null,
      maintainers: ["content-team"],
      scope: "workspace",
      trust:
        overrides?.trust ??
        (status === "ready" ? "user-confirmed" : "unreviewed"),
      grounding: "recommended",
    },
    rootPath,
    knowledgePath: `${rootPath}/KNOWLEDGE.md`,
    defaultForWorkspace: overrides?.defaultForWorkspace ?? status === "ready",
    updatedAt: now,
    sourceCount: 1,
    wikiCount: 1,
    compiledCount: 1,
    runCount: 1,
    preview: isFounder
      ? "用于个人介绍、短视频脚本、沙龙开场和商务话术。"
      : "发现 4 个待补充事实，2 条功效表达风险。",
    guide: isFounder
      ? "用于个人介绍、视频号脚本、商务开场、社群话术。知识正文只作为数据使用。"
      : "用于品牌产品介绍、渠道脚本和客服话术。功效表达必须待确认。",
    sources: [
      {
        relativePath: "sources/source.md",
        absolutePath: `${rootPath}/sources/source.md`,
        bytes: 128,
        updatedAt: now,
        sha256: "mock-sha256",
        preview: isFounder
          ? "创始人访谈：深耕自媒体营销领域。"
          : "产品面向内容团队，禁止编造功效。",
      },
    ],
    wiki: [
      {
        relativePath: isFounder ? "wiki/profile.md" : "wiki/product.md",
        absolutePath: `${rootPath}/wiki/profile.md`,
        bytes: 256,
        updatedAt: now,
        sha256: "mock-sha256",
        preview: "定位、故事、语气和边界。",
      },
    ],
    compiled: [
      {
        relativePath: `compiled/splits/${name}/应用指南.md`,
        absolutePath: `${rootPath}/compiled/splits/${name}/应用指南.md`,
        bytes: 512,
        updatedAt: now,
        sha256: "mock-sha256",
        preview: "应用指南：事实、语气、故事素材和边界。",
      },
    ],
    runs: [
      {
        relativePath: "runs/compile-mock.json",
        absolutePath: `${rootPath}/runs/compile-mock.json`,
        bytes: 96,
        updatedAt: now,
        preview: '{"status":"completed"}',
      },
    ],
  };
}

function toSummary(pack: KnowledgePackDetail) {
  return {
    metadata: pack.metadata,
    rootPath: pack.rootPath,
    knowledgePath: pack.knowledgePath,
    defaultForWorkspace: pack.defaultForWorkspace,
    updatedAt: pack.updatedAt,
    sourceCount: pack.sourceCount,
    wikiCount: pack.wikiCount,
    compiledCount: pack.compiledCount,
    runCount: pack.runCount,
    preview: pack.preview,
  };
}

export function buildListResponse(packs: KnowledgePackDetail[]) {
  return {
    workingDir: "/tmp/project",
    rootPath: "/tmp/project/.lime/knowledge/packs",
    packs: packs.map(toSummary),
  };
}
