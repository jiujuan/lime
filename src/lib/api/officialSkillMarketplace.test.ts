import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOfficialSkillMarketplaceBundle,
  installOfficialMarketplaceSkill,
  listOfficialSkillMarketplace,
} from "./officialSkillMarketplace";
import { resolveOemCloudRuntimeContext } from "./oemCloudRuntime";

const skillsApiMock = vi.hoisted(() => ({
  installMarketplaceBundle: vi.fn(),
  installFromDownloadUrl: vi.fn(),
}));

vi.mock("./skills", () => ({
  skillsApi: skillsApiMock,
}));

vi.mock("./oemCloudRuntime", () => ({
  resolveOemCloudRuntimeContext: vi.fn(),
}));

function mockJsonResponse(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function mockTextResponse(text: string, ok = true, status = 200) {
  return {
    ok,
    status,
    text: vi.fn().mockResolvedValue(text),
  } as unknown as Response;
}

function buildStaticMarketplaceHtml(skills: unknown[]) {
  const escapedSkills = JSON.stringify(skills).replace(/"/g, '\\"');
  return `<!doctype html><script>self.__next_f.push([1,"b:[\\"$\\",\\"$1\\",\\"c\\",{\\"children\\":[[\\"$\\",\\"$Le\\",null,{\\"skills\\":${escapedSkills}}]]}]"])</script>`;
}

const staticMarketplaceSkills = [
  {
    slug: "daily-trend-briefing",
    title: "每日趋势摘要",
    description: "围绕平台、赛道和地区先拉一版趋势摘要。",
    summary: "每天开工前先看一眼真正值得做的方向。",
    meta: "适合内容团队",
    category: "研究",
    launch: {
      type: "curated_task",
      taskId: "daily-trend-briefing",
    },
  },
  {
    slug: "viral-content-breakdown",
    title: "爆款内容拆解",
    description: "把一条高表现内容拆成可复用模板。",
    summary: "拆钩子、结构和转化动作。",
    meta: "1 个文件 · 1.0.0",
    category: "研究",
    launch: {
      type: "service_skill",
      skillId: "viral-content-breakdown",
    },
  },
];

describe("officialSkillMarketplace", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(resolveOemCloudRuntimeContext).mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("默认应从官网静态技能市场解析可安装官方技能列表", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockTextResponse(buildStaticMarketplaceHtml(staticMarketplaceSkills)),
    );

    const items = await listOfficialSkillMarketplace({ sort: "default" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://limeai.run/skills/",
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "text/html" },
      }),
    );
    expect(items).toEqual([
      expect.objectContaining({
        id: "official:viral-content-breakdown",
        name: "viral-content-breakdown",
        aliases: [],
        title: "爆款内容拆解",
        summary: "拆钩子、结构和转化动作。",
        category: "研究",
        outputHint: "把一条高表现内容拆成可复用模板。",
        version: "1.0.0",
        sort: 1,
      }),
    ]);
  });

  it("有 OEM 运行时但未显式配置 marketplace API base 时仍应使用官网静态源", async () => {
    vi.mocked(resolveOemCloudRuntimeContext).mockReturnValue({
      baseUrl: "https://user.limeai.run",
      controlPlaneBaseUrl: "https://user.limeai.run/api",
      sceneBaseUrl: "https://user.limeai.run/scene-api",
      gatewayBaseUrl: "https://user.limeai.run/gateway-api",
      tenantId: "tenant-demo",
      sessionToken: "session-token",
      hubProviderName: null,
      loginPath: "/login",
      desktopClientId: "desktop-client",
      desktopOauthRedirectUrl: "lime://oauth/callback",
      desktopOauthNextPath: "/welcome",
      agentAppSignatureTrustRoots: [],
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockTextResponse(buildStaticMarketplaceHtml(staticMarketplaceSkills)),
    );

    await expect(listOfficialSkillMarketplace()).resolves.toEqual([
      expect.objectContaining({ name: "viral-content-breakdown" }),
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://limeai.run/skills/",
      expect.any(Object),
    );
  });

  it("显式配置 API base 时应按官网 marketplace envelope 解析官方技能列表", async () => {
    vi.stubEnv(
      "VITE_LIME_SKILL_MARKETPLACE_API_BASE_URL",
      "https://cloud.example.com/api/",
    );
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        code: 200,
        message: "success",
        data: {
          items: [
            {
              id: "official:analysis",
              name: "analysis",
              title: "数据分析",
              summary: "整理数据并输出结论。",
              category: "数据",
              outputHint: "分析摘要",
              version: "2026.05",
              sort: 10,
              icon: {
                kind: "svg",
                svg: "<svg></svg>",
              },
              bundle: {
                name: "analysis",
                description: "标准包",
                resourceSummary: {
                  hasReferences: true,
                },
                standardCompliance: {
                  isStandard: true,
                },
              },
            },
          ],
        },
      }),
    );

    const items = await listOfficialSkillMarketplace({ sort: "default" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://cloud.example.com/api/v1/public/service-skills/marketplace?sort=default",
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "application/json" },
      }),
    );
    expect(items).toEqual([
      expect.objectContaining({
        id: "official:analysis",
        name: "analysis",
        aliases: [],
        title: "数据分析",
        bundle: expect.objectContaining({
          resourceSummary: {
            hasScripts: false,
            hasReferences: true,
            hasAssets: false,
          },
          standardCompliance: {
            isStandard: true,
            validationErrors: [],
            deprecatedFields: [],
          },
        }),
      }),
    ]);
  });

  it("默认应解析官网静态 bundle.json 并保留文件校验信息", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        manifestVersion: "agentskills.v1",
        name: "viral-content-breakdown",
        version: "1.0.0",
        contentHash: "sha256:bundle",
        fileCount: 1,
        files: [
          {
            path: "SKILL.md",
            content: "# Viral Content Breakdown",
            encoding: "utf-8",
            sha256: "sha256:file",
          },
        ],
      }),
    );

    await expect(
      getOfficialSkillMarketplaceBundle("viral-content-breakdown"),
    ).resolves.toEqual({
      manifestVersion: "agentskills.v1",
      name: "viral-content-breakdown",
      aliases: [],
      version: "1.0.0",
      contentHash: "sha256:bundle",
      fileCount: 1,
      files: [
        {
          path: "SKILL.md",
          content: "# Viral Content Breakdown",
          encoding: "utf-8",
          sha256: "sha256:file",
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://limeai.run/skill-packages/viral-content-breakdown/latest/bundle.json",
      expect.any(Object),
    );
  });

  it("默认安装官方技能时应通过官网 ZIP 下载 URL 进入 App Server current 网关", async () => {
    skillsApiMock.installFromDownloadUrl.mockResolvedValueOnce({
      directory: "viral-content-breakdown",
      inspection: {
        content: "# Viral Content Breakdown",
        metadata: {},
        allowedTools: [],
        resourceSummary: {
          hasScripts: false,
          hasReferences: false,
          hasAssets: false,
        },
        standardCompliance: {
          isStandard: true,
          validationErrors: [],
          deprecatedFields: [],
        },
      },
    });

    await expect(
      installOfficialMarketplaceSkill("viral-content-breakdown"),
    ).resolves.toEqual(
      expect.objectContaining({ directory: "viral-content-breakdown" }),
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(skillsApiMock.installFromDownloadUrl).toHaveBeenCalledWith(
      {
        skillName: "viral-content-breakdown",
        downloadUrl:
          "https://limeai.run/skill-packages/viral-content-breakdown/latest/viral-content-breakdown.zip",
      },
      "lime",
    );
    expect(skillsApiMock.installMarketplaceBundle).not.toHaveBeenCalled();
  });

  it("显式配置 API base 时安装官方技能应接受控制面 bundle 并进入 App Server 安装网关", async () => {
    vi.stubEnv(
      "VITE_LIME_SKILL_MARKETPLACE_API_BASE_URL",
      "https://cloud.example.com/api",
    );
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        code: 200,
        message: "success",
        data: {
          manifestVersion: "agentskills.v1",
          name: "analysis",
          version: "2026.05",
          contentHash: "sha256:bundle",
          fileCount: 1,
          files: [
            {
              path: "SKILL.md",
              content: "# Analysis",
              encoding: "utf-8",
              sha256: "sha256:file",
            },
          ],
        },
      }),
    );
    skillsApiMock.installMarketplaceBundle.mockResolvedValueOnce({
      directory: "analysis",
      inspection: {
        content: "# Analysis",
        metadata: {},
        allowedTools: [],
        resourceSummary: {
          hasScripts: false,
          hasReferences: false,
          hasAssets: false,
        },
        standardCompliance: {
          isStandard: true,
          validationErrors: [],
          deprecatedFields: [],
        },
      },
    });

    await expect(installOfficialMarketplaceSkill("analysis")).resolves.toEqual(
      expect.objectContaining({ directory: "analysis" }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://cloud.example.com/api/v1/public/service-skills/marketplace/analysis/bundle",
      expect.any(Object),
    );
    expect(skillsApiMock.installMarketplaceBundle).toHaveBeenCalledWith(
      {
        manifestVersion: "agentskills.v1",
        name: "analysis",
        aliases: [],
        version: "2026.05",
        contentHash: "sha256:bundle",
        fileCount: 1,
        files: [
          {
            path: "SKILL.md",
            content: "# Analysis",
            encoding: "utf-8",
            sha256: "sha256:file",
          },
        ],
      },
      "lime",
    );
    expect(skillsApiMock.installFromDownloadUrl).not.toHaveBeenCalled();
  });

  it("接口返回错误时应透传服务端 message", async () => {
    vi.stubEnv(
      "VITE_LIME_SKILL_MARKETPLACE_API_BASE_URL",
      "https://cloud.example.com/api",
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse(
        {
          code: 500,
          message: "marketplace unavailable",
        },
        false,
        503,
      ),
    );

    await expect(listOfficialSkillMarketplace()).rejects.toThrow(
      "marketplace unavailable",
    );
  });

  it("业务 envelope 返回错误时应透传服务端 message", async () => {
    vi.stubEnv(
      "VITE_LIME_SKILL_MARKETPLACE_API_BASE_URL",
      "https://cloud.example.com/api",
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse({
        code: 500,
        message: "marketplace disabled",
        data: null,
      }),
    );

    await expect(listOfficialSkillMarketplace()).rejects.toThrow(
      "marketplace disabled",
    );
  });

  it("列表 data 不是 marketplace item page 时应 fail closed", async () => {
    vi.stubEnv(
      "VITE_LIME_SKILL_MARKETPLACE_API_BASE_URL",
      "https://cloud.example.com/api",
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse({
        code: 0,
        message: "ok",
        data: {},
      }),
    );

    await expect(listOfficialSkillMarketplace()).rejects.toThrow(
      "The official skill marketplace response is invalid",
    );
  });

  it("列表 item 缺少关键字段时应 fail closed", async () => {
    vi.stubEnv(
      "VITE_LIME_SKILL_MARKETPLACE_API_BASE_URL",
      "https://cloud.example.com/api",
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse({
        code: 0,
        message: "ok",
        data: {
          items: [
            {
              id: "official:broken",
              name: "broken",
              title: "非法条目",
              aliases: [],
            },
          ],
        },
      }),
    );

    await expect(listOfficialSkillMarketplace()).rejects.toThrow(
      "The official skill marketplace response is invalid",
    );
  });

  it("安装包缺少 bundle 关键字段时应 fail closed 且不进入安装 facade", async () => {
    vi.stubEnv(
      "VITE_LIME_SKILL_MARKETPLACE_API_BASE_URL",
      "https://cloud.example.com/api",
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse({
        code: 0,
        message: "ok",
        data: {
          manifestVersion: "agentskills.v1",
          name: "analysis",
          aliases: [],
          version: "2026.05",
          files: [
            {
              path: "SKILL.md",
              content: "# Analysis",
            },
          ],
        },
      }),
    );

    await expect(installOfficialMarketplaceSkill("analysis")).rejects.toThrow(
      "The official skill bundle is invalid",
    );
    expect(skillsApiMock.installMarketplaceBundle).not.toHaveBeenCalled();
    expect(skillsApiMock.installFromDownloadUrl).not.toHaveBeenCalled();
  });

  it("安装包文件缺少 content 时应 fail closed", async () => {
    vi.stubEnv(
      "VITE_LIME_SKILL_MARKETPLACE_API_BASE_URL",
      "https://cloud.example.com/api",
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse({
        code: 0,
        message: "ok",
        data: {
          manifestVersion: "agentskills.v1",
          name: "analysis",
          aliases: [],
          version: "2026.05",
          contentHash: "sha256:bundle",
          fileCount: 1,
          files: [
            {
              path: "SKILL.md",
            },
          ],
        },
      }),
    );

    await expect(getOfficialSkillMarketplaceBundle("analysis")).rejects.toThrow(
      "The official skill bundle is invalid",
    );
  });

  it("安装包 fileCount 与 files 不一致时应 fail closed", async () => {
    vi.stubEnv(
      "VITE_LIME_SKILL_MARKETPLACE_API_BASE_URL",
      "https://cloud.example.com/api",
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse({
        code: 0,
        message: "ok",
        data: {
          manifestVersion: "agentskills.v1",
          name: "analysis",
          aliases: [],
          version: "2026.05",
          contentHash: "sha256:bundle",
          fileCount: 2,
          files: [
            {
              path: "SKILL.md",
              content: "# Analysis",
            },
          ],
        },
      }),
    );

    await expect(getOfficialSkillMarketplaceBundle("analysis")).rejects.toThrow(
      "The official skill bundle is invalid",
    );
  });
});
