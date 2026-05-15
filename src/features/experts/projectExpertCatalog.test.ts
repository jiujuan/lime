import { describe, expect, it } from "vitest";
import { buildExpertCatalogProjection } from "./projectExpertCatalog";
import { getSeededExpertCatalog } from "./seededExpertCatalog";
import type { ExpertInstallOverlayRecord } from "./types";

describe("buildExpertCatalogProjection", () => {
  it("应合并安装 overlay、置顶状态和榜单来源", () => {
    const overlay: ExpertInstallOverlayRecord = {
      expertId: "data-analyst",
      releaseId: "rel-data-analyst-20260515",
      installedAt: 1_800_000_000_000,
      lastUsedAt: 1_800_000_000_123,
      pinned: true,
      memoryEnabled: true,
      workflowEnabled: true,
    };

    const projection = buildExpertCatalogProjection(getSeededExpertCatalog(), {
      overlays: [overlay],
    });

    expect(projection.items[0].id).toBe("data-analyst");
    expect(projection.items[0]).toMatchObject({
      installed: true,
      pinned: true,
      lastUsedAt: 1_800_000_000_123,
    });
    expect(projection.items[0].rankingKeys).toEqual(
      expect.arrayContaining(["popular_now", "fresh_releases"]),
    );
  });

  it("应按分类和搜索词过滤，且隐藏 overlay 不进入结果", () => {
    const projection = buildExpertCatalogProjection(getSeededExpertCatalog(), {
      category: "marketing",
      query: "脚本",
      overlays: [
        {
          expertId: "short-video-scriptwriter",
          releaseId: "rel-short-video-scriptwriter-20260515",
          installedAt: 1,
          lastUsedAt: null,
          hidden: true,
        },
      ],
    });

    expect(projection.items.map((item) => item.id)).toEqual([]);
  });

  it("榜单 profile 应复用过滤后的同一批 projection item", () => {
    const projection = buildExpertCatalogProjection(getSeededExpertCatalog(), {
      category: "analytics",
    });

    expect(projection.items.map((item) => item.id)).toEqual(["data-analyst"]);
    expect(
      projection.rankings.flatMap((ranking) =>
        ranking.profiles.map((profile) => profile.id),
      ),
    ).toEqual(expect.arrayContaining(["data-analyst"]));
    expect(
      projection.rankings
        .flatMap((ranking) => ranking.profiles)
        .every((profile) => profile.category === "analytics"),
    ).toBe(true);
  });
});
