import { beforeEach, describe, expect, it } from "vitest";
import { getSeededExpertCatalog } from "./seededExpertCatalog";
import {
  recordExpertLaunch,
  readExpertInstallOverlay,
  saveExpertInstallOverlay,
  upsertInstalledExpert,
} from "./expertInstallOverlay";

describe("expertInstallOverlay", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("应持久化已添加专家 overlay", () => {
    const expert = getSeededExpertCatalog().items[0];

    const saved = upsertInstalledExpert([], expert, 1_800_000_000_000);

    expect(saved).toEqual([
      expect.objectContaining({
        expertId: expert.id,
        releaseId: expert.release.releaseId,
        memoryEnabled: true,
        workflowEnabled: true,
      }),
    ]);
    expect(readExpertInstallOverlay()).toEqual(saved);
  });

  it("应过滤非法 overlay 记录", () => {
    window.localStorage.setItem(
      "lime:expert-install-overlay:v1",
      JSON.stringify([
        { expertId: "x" },
        { expertId: "ok", releaseId: "rel", installedAt: 1, lastUsedAt: null },
      ]),
    );

    expect(readExpertInstallOverlay()).toEqual([
      { expertId: "ok", releaseId: "rel", installedAt: 1, lastUsedAt: null },
    ]);
  });

  it("重复添加同一专家应更新 release 记录且保留安装时间", () => {
    const expert = getSeededExpertCatalog().items[0];
    const existing = saveExpertInstallOverlay([
      {
        expertId: expert.id,
        releaseId: "old-release",
        installedAt: 1,
        lastUsedAt: 1,
      },
    ]);

    const next = upsertInstalledExpert(existing, expert, 2);

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      expertId: expert.id,
      releaseId: expert.release.releaseId,
      installedAt: 1,
      lastUsedAt: 1,
    });
  });

  it("启动专家应更新最近使用时间但不重置安装时间", () => {
    const expert = getSeededExpertCatalog().items[0];
    const existing = saveExpertInstallOverlay([
      {
        expertId: expert.id,
        releaseId: expert.release.releaseId,
        installedAt: 1,
        lastUsedAt: 1,
        memoryEnabled: false,
      },
    ]);

    const next = recordExpertLaunch(existing, expert, 9);

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      expertId: expert.id,
      installedAt: 1,
      lastUsedAt: 9,
      memoryEnabled: false,
    });
  });
});
