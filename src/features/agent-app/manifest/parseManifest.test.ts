import { describe, expect, it } from "vitest";
import contentEngineeringFixture from "../fixtures/content-engineering-app.json";
import { normalizeManifest } from "./normalizeManifest";
import { AgentAppManifestError, parseManifest } from "./parseManifest";

describe("Agent App manifest P0", () => {
  it("应解析并归一化内容工程化 fixture", () => {
    const manifest = parseManifest(contentEngineeringFixture);
    const normalized = normalizeManifest(manifest);

    expect(normalized).toMatchObject({
      manifestVersion: "0.2",
      appId: "shenlan-content-engineering",
      displayName: "shenlan-content-engineering",
      version: "0.1.0",
      runtimeTargets: ["local"],
      storage: {
        namespace: "shenlan-content-engineering",
      },
    });
    expect(normalized.entries.map((entry) => entry.kind)).toEqual([
      "page",
      "expert-chat",
      "workflow",
    ]);
  });

  it("缺少 entries 时应拒绝 manifest", () => {
    expect(() =>
      parseManifest({
        manifestVersion: "0.2.0",
        name: "empty-app",
        version: "0.1.0",
        entries: [],
      }),
    ).toThrow(AgentAppManifestError);
  });

  it("应为可选字段填充 P0 默认值", () => {
    const normalized = normalizeManifest(
      parseManifest({
        manifestVersion: "0.2.0",
        name: "Simple App",
        version: "0.1.0",
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
