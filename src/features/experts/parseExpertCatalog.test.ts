import { describe, expect, it } from "vitest";
import { parseExpertCatalog } from "./parseExpertCatalog";
import { getSeededExpertCatalog } from "./seededExpertCatalog";

function cloneSeededCatalog() {
  return getSeededExpertCatalog();
}

describe("parseExpertCatalog", () => {
  it("应接受 seeded 专家目录并返回隔离副本", () => {
    const catalog = cloneSeededCatalog();
    const parsed = parseExpertCatalog(catalog);

    expect(parsed?.items).toHaveLength(6);
    expect(parsed?.items[0]?.release.personaRef).toMatch(/^expert-persona:/);

    if (parsed) {
      parsed.items[0].title = "已修改";
    }
    expect(catalog.items[0].title).toBe("营销策略专家");
  });

  it("缺少必需 releaseId 时应拒绝目录", () => {
    const catalog = cloneSeededCatalog() as unknown as {
      items: Array<{ release: { releaseId?: string } }>;
    };
    delete catalog.items[0].release.releaseId;

    expect(parseExpertCatalog(catalog)).toBeNull();
  });

  it("缺少 personaRef 时应拒绝目录，避免启动无身份专家", () => {
    const catalog = cloneSeededCatalog() as unknown as {
      items: Array<{ release: { personaRef?: string } }>;
    };
    delete catalog.items[0].release.personaRef;

    expect(parseExpertCatalog(catalog)).toBeNull();
  });
});
