import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { normalizeManifest } from "./normalizeManifest";
import { AgentAppManifestError, parseManifest } from "./parseManifest";

describe("Agent App manifest P0", () => {
  it("应解析并归一化 内容工厂 v0.3 fixture", () => {
    const manifest = parseManifest(contentFactoryFixture);
    const normalized = normalizeManifest(manifest);

    expect(normalized).toMatchObject({
      manifestVersion: "0.3",
      appId: "content-factory-app",
      displayName: "内容工厂",
      version: "0.3.0",
      runtimeTargets: ["local"],
      storage: {
        namespace: "content-factory-app",
      },
    });
    expect(normalized.entries.map((entry) => entry.kind)).toEqual([
      "page",
      "page",
      "workflow",
      "page",
      "expert-chat",
    ]);
    expect(normalized.entries.map((entry) => entry.key)).toEqual([
      "dashboard",
      "knowledge",
      "content_scenario_planning",
      "content_factory",
      "content_strategist",
    ]);
    expect(normalized.services.map((service) => service.key)).toEqual([
      "content_worker",
    ]);
    expect(normalized.workflows.map((workflow) => workflow.key)).toEqual([
      "content_scenario_planning",
    ]);
    expect(normalized.toolRefs.map((tool) => tool.key)).toEqual([
      "document_parser",
      "competitor_research",
    ]);
    expect(normalized.evals.map((evalRule) => evalRule.key)).toEqual([
      "fact_grounding",
    ]);
    expect(normalized.secrets.map((secret) => secret.key)).toEqual([
      "publishing_workspace_token",
    ]);
    expect(normalized.overlayTemplates.map((overlay) => overlay.key)).toEqual([
      "workspace_content_rules",
    ]);
  });

  it("缺少 entries 时应拒绝 manifest", () => {
    expect(() =>
      parseManifest({
        manifestVersion: "0.3.0",
        name: "empty-app",
        version: "0.3.0",
        entries: [],
      }),
    ).toThrow(AgentAppManifestError);
  });

  it("应为可选字段填充 P0 默认值", () => {
    const normalized = normalizeManifest(
      parseManifest({
        manifestVersion: "0.3.0",
        name: "Simple App",
        version: "0.3.0",
        entries: [{ key: "home", kind: "page" }],
      }),
    );

    expect(normalized).toMatchObject({
      appId: "simple-app",
      status: "draft",
      appType: "domain-app",
      runtimeTargets: ["local"],
    });
    expect(normalized.entries[0]).toMatchObject({
      key: "home",
      title: "home",
      enabledByDefault: true,
    });
  });
});
