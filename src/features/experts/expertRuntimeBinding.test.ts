import { describe, expect, it } from "vitest";
import { buildExpertCatalogProjection } from "./projectExpertCatalog";
import { buildExpertRuntimeMetadata } from "./expertRuntimeBinding";
import { getSeededExpertCatalog } from "./seededExpertCatalog";

describe("buildExpertRuntimeMetadata", () => {
  it("应把专家 release 转为现有 Agent Runtime request metadata", () => {
    const catalog = getSeededExpertCatalog();
    const projection = buildExpertCatalogProjection(catalog);
    const expert = projection.items.find(
      (item) => item.id === "marketing-strategist",
    );

    expect(expert).toBeDefined();
    const metadata = buildExpertRuntimeMetadata(expert!, {
      catalogVersion: catalog.version,
      tenantId: catalog.tenantId,
    });

    expect(metadata.expert).toMatchObject({
      expertId: "marketing-strategist",
      releaseId: "rel-marketing-strategist-20260515",
      personaRef: "expert-persona:marketing-strategist@1.0.0",
      memoryTemplateRef: "memory-template:marketing-strategist@1.0.0",
      catalogVersion: catalog.version,
    });
    expect(metadata.harness.expert).toMatchObject({
      expert_id: "marketing-strategist",
      release_id: "rel-marketing-strategist-20260515",
      persona_ref: "expert-persona:marketing-strategist@1.0.0",
      memory_enabled: true,
      workflow_enabled: true,
    });
  });

  it("关闭专家记忆或工作流时不应继续注入对应引用", () => {
    const expert = buildExpertCatalogProjection(getSeededExpertCatalog()).items
      .find((item) => item.id === "marketing-strategist")!;

    const metadata = buildExpertRuntimeMetadata(expert, {
      overlay: {
        expertId: expert.id,
        releaseId: expert.release.releaseId,
        installedAt: 1,
        lastUsedAt: 2,
        memoryEnabled: false,
        workflowEnabled: false,
      },
    });

    expect(metadata.expert.memoryTemplateRef).toBeUndefined();
    expect(metadata.expert.workflowRefs).toEqual([]);
    expect(metadata.harness.expert.memory_template_ref).toBeUndefined();
    expect(metadata.harness.expert.workflow_refs).toEqual([]);
  });
});
