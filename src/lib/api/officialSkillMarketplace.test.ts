import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOfficialSkillMarketplaceBundle,
  installOfficialMarketplaceSkill,
  listOfficialSkillMarketplace,
} from "./officialSkillMarketplace";

const skillsApiMock = vi.hoisted(() => ({
  installMarketplaceBundle: vi.fn(),
}));

vi.mock("./skills", () => ({
  skillsApi: skillsApiMock,
}));

function mockJsonResponse(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

describe("officialSkillMarketplace", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("应按官网 marketplace envelope 解析官方技能列表", async () => {
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
      "https://lime-api.limeai.run/api/v1/public/service-skills/marketplace?sort=default",
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

  it("应解析官方技能安装包并保留文件校验信息", async () => {
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

    await expect(
      getOfficialSkillMarketplaceBundle("analysis"),
    ).resolves.toEqual({
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
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://lime-api.limeai.run/api/v1/public/service-skills/marketplace/analysis/bundle",
      expect.any(Object),
    );
  });

  it("安装官方技能时应接受当前控制面 bundle 形态并进入 App Server 安装网关", async () => {
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
      "https://lime-api.limeai.run/api/v1/public/service-skills/marketplace/analysis/bundle",
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
  });

  it("接口返回错误时应透传服务端 message", async () => {
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
  });

  it("安装包文件缺少 content 时应 fail closed", async () => {
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
