import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOfficialSkillMarketplaceBundle,
  listOfficialSkillMarketplace,
} from "./officialSkillMarketplace";

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
        code: 0,
        message: "ok",
        data: {
          items: [
            {
              id: "official:analysis",
              name: "analysis",
              aliases: ["data-analysis", ""],
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
            {
              id: "",
              title: "非法条目",
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
        aliases: ["data-analysis"],
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
        code: 0,
        message: "ok",
        data: {
          manifestVersion: "agentskills.v1",
          name: "analysis",
          aliases: ["data-analysis"],
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

    await expect(getOfficialSkillMarketplaceBundle("analysis")).resolves.toEqual({
      manifestVersion: "agentskills.v1",
      name: "analysis",
      aliases: ["data-analysis"],
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
});
