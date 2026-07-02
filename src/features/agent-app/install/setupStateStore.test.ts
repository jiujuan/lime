import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../testing/fixtures/content-factory-app.json";
import { buildInstalledAppPreview } from "./installedAppPreview";
import {
  buildSetupStateFromBindings,
  InMemoryAgentAppSetupStateStore,
} from "./setupStateStore";

const now = "2026-05-15T00:00:00.000Z";

function resolvedContentFactoryBindings() {
  return [
    { appId: "content-factory-app", kind: "knowledge" as const, key: "ip_knowledge", resolved: true, ref: "knowledge:ip", updatedAt: now },
    { appId: "content-factory-app", kind: "knowledge" as const, key: "project_knowledge", resolved: true, ref: "knowledge:project", updatedAt: now },
    { appId: "content-factory-app", kind: "knowledge" as const, key: "material_library", resolved: true, ref: "knowledge:materials", updatedAt: now },
    { appId: "content-factory-app", kind: "skill" as const, key: "article-writer", resolved: true, ref: "skill:article-writer", updatedAt: now },
    { appId: "content-factory-app", kind: "tool" as const, key: "document_parser", resolved: true, ref: "tool:document_parser", updatedAt: now },
    { appId: "content-factory-app", kind: "tool" as const, key: "competitor_research", resolved: true, ref: "tool:competitor_research", updatedAt: now },
    { appId: "content-factory-app", kind: "artifact" as const, key: "content_table", resolved: true, ref: "artifact-schema:content_table", updatedAt: now },
    { appId: "content-factory-app", kind: "eval" as const, key: "fact_grounding", resolved: true, ref: "eval:fact_grounding", updatedAt: now },
    { appId: "content-factory-app", kind: "secret" as const, key: "publishing_workspace_token", resolved: true, ref: "secret-ref:publishing_workspace_token", updatedAt: now },
    { appId: "content-factory-app", kind: "overlay" as const, key: "workspace_content_rules", resolved: true, ref: "overlay:workspace_content_rules", updatedAt: now },
    { appId: "content-factory-app", kind: "service" as const, key: "content_worker", resolved: true, ref: "service:content_worker", updatedAt: now },
    { appId: "content-factory-app", kind: "workflow" as const, key: "content_scenario_planning", resolved: true, ref: "workflow:content_scenario_planning", updatedAt: now },
  ];
}

describe("Agent App setup state store P9", () => {
  it("应把 binding records 聚合为 AgentAppSetupState", () => {
    const state = buildSetupStateFromBindings(
      resolvedContentFactoryBindings(),
      "content-factory-app",
    );

    expect(state).toMatchObject({
      knowledgeBindings: {
        project_knowledge: true,
      },
      skills: {
        "article-writer": true,
      },
      tools: {
        document_parser: true,
      },
      secrets: {
        publishing_workspace_token: true,
      },
    });
  });

  it("store 应支持 upsert、查询、删除和按 app 清理", () => {
    const store = new InMemoryAgentAppSetupStateStore();
    resolvedContentFactoryBindings().forEach((record) => store.upsert(record));

    expect(store.list("content-factory-app")).toHaveLength(12);
    expect(store.getSetupState("content-factory-app").workflows).toEqual({
      content_scenario_planning: true,
    });
    expect(
      store.remove({
        appId: "content-factory-app",
        kind: "secret",
        key: "publishing_workspace_token",
      }),
    ).toBe(true);
    expect(store.getSetupState("content-factory-app").secrets).toBeUndefined();
    expect(store.clearApp("content-factory-app")).toBe(11);
    expect(store.list("content-factory-app")).toHaveLength(0);
  });

  it("setup state 接入 preview 后应消除 needs-setup 状态", () => {
    const store = new InMemoryAgentAppSetupStateStore();
    resolvedContentFactoryBindings().forEach((record) => store.upsert(record));

    const preview = buildInstalledAppPreview({
      fixture: contentFactoryFixture,
      setup: store.getSetupState("content-factory-app"),
      loadedAt: now,
      checkedAt: now,
      generatedAt: now,
    });

    expect(preview.readiness.status).not.toBe("needs-setup");
    expect(preview.readiness.warnings.map((issue) => issue.code)).not.toContain(
      "KNOWLEDGE_BINDING_REQUIRED",
    );
    expect(preview.cleanupPlan.setupStatePaths[0]?.value).toBe(
      "<LimeAppData>/agent-apps/setup/content-factory-app.json",
    );
  });
});
