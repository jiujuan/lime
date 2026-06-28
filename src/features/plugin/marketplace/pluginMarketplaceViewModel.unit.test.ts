import { describe, expect, it } from "vitest";

import type { PluginMarketplaceRegistrySnapshot } from "./marketplaceRegistryLoader";
import { buildPluginMarketplaceViewModel } from "./pluginMarketplaceViewModel";

function snapshot(): PluginMarketplaceRegistrySnapshot {
  return {
    marketplace: {
      schemaVersion: "plugin-marketplace/v1",
      tenantId: "tenant-0001",
      generatedAt: "2026-06-25T00:00:00.000Z",
      marketplaceName: "limecloud",
      items: [
        {
          pluginKey: "research-kit@limecloud",
          pluginName: "research-kit",
          marketplaceName: "limecloud",
          displayName: "Research Kit",
          description: "Research workflow",
          version: "1.2.3",
          category: "research",
          sourceKind: "agent_app_release",
          appId: "research-kit",
          enabled: true,
          installState: "available",
          activationState: "activatable",
          policy: {
            installation: "AVAILABLE",
            authentication: "ON_USE",
          },
          package: {
            releaseId: "release-001",
            packageUrl:
              "https://packages.limecloud.example/plugins/research-kit-1.2.3.lpkg",
            packageHash:
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            manifestHash:
              "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          },
          manifestSummary: {
            agentApps: [
              {
                id: "research-kit",
                title: "Research Agent",
                entryKey: "research",
                uiKind: "pane",
              },
            ],
            workbench: {
              workbenchTasks: [
                {
                  kind: "research.article.generate",
                  title: "Generate article",
                  expectedObjects: ["articleDraft"],
                  defaultSurface: "documentCanvas",
                },
              ],
            },
            subagents: [
              {
                id: "researcher",
                title: "资料检索",
                description: "整理资料和引用依据",
                activation: "research.article.generate",
                skills: ["article-writer"],
              },
              {
                id: "writer",
                title: "正文写作",
                description: "生成文章草稿",
                activation: "research.article.generate",
                skills: ["article-writer"],
              },
            ],
            toolRefs: [
              {
                key: "research-worker",
                provider: "local-worker",
                capabilities: ["research.article.generate"],
              },
            ],
            skills: [
              {
                id: "article-writer",
                title: "Article Writer",
                description: "Draft articles",
              },
            ],
            skillRefs: [
              {
                id: "article-image-cheatsheet",
                activation: "content.image.generate",
              },
            ],
          },
        },
        {
          pluginKey: "notes-kit@limecloud",
          pluginName: "notes-kit",
          marketplaceName: "limecloud",
          displayName: "Notes Kit",
          description: "Note workspace",
          version: "2.0.0",
          category: "writing",
          sourceKind: "agent_app_release",
          appId: "notes-kit",
          enabled: true,
          installState: "available",
          activationState: "activatable",
          policy: {
            installation: "AVAILABLE",
            authentication: "ON_USE",
          },
        },
        {
          pluginKey: "blocked-kit@limecloud",
          pluginName: "blocked-kit",
          marketplaceName: "limecloud",
          displayName: "Blocked Kit",
          description: "Registration required",
          version: "0.1.0",
          category: "research",
          sourceKind: "agent_app_release",
          appId: "blocked-kit",
          enabled: false,
          installState: "blocked",
          activationState: "blocked",
          blockedReason: "registration required",
          policy: {
            installation: "NOT_AVAILABLE",
            authentication: "ON_INSTALL",
          },
        },
      ],
    },
    installed: {
      states: [],
      issues: [
        {
          code: "READ_FAILED",
          path: "<LimeAppData>/agent-apps/installed/broken.json",
          message: "read failed",
        },
      ],
    },
    projectionInputs: [],
    registry: [
      {
        pluginId: "research-kit@limecloud",
        displayName: "Research Kit",
        version: "1.2.3",
        installed: true,
        enabled: true,
        capabilityStates: ["activatable"],
        activationState: "activatable",
        rendererState: "missing_renderer",
        historyState: "read_write",
        blockerCodes: ["PLUGIN_RENDERER_UNAVAILABLE"],
      },
      {
        pluginId: "notes-kit@limecloud",
        displayName: "Notes Kit",
        version: "2.0.0",
        installed: true,
        enabled: false,
        capabilityStates: [],
        activationState: "disabled",
        rendererState: "missing_renderer",
        historyState: "unavailable",
        blockerCodes: [
          "PLUGIN_DISABLED",
          "PLUGIN_RENDERER_UNAVAILABLE",
          "PLUGIN_WORKSPACE_MISSING",
        ],
      },
      {
        pluginId: "blocked-kit@limecloud",
        displayName: "Blocked Kit",
        version: "0.1.0",
        installed: false,
        enabled: false,
        capabilityStates: [],
        activationState: "blocked",
        rendererState: "missing_renderer",
        historyState: "unavailable",
        blockerCodes: [
          "PLUGIN_MARKETPLACE_BLOCKED:registration required",
          "PLUGIN_INSTALL_UNAVAILABLE",
        ],
      },
    ],
  };
}

describe("plugin marketplace view model", () => {
  it("应把 registry snapshot 投影为只读插件中心列表模型", () => {
    const model = buildPluginMarketplaceViewModel(snapshot());

    expect(model.generatedAt).toBe("2026-06-25T00:00:00.000Z");
    expect(model.issueCount).toBe(1);
    expect(model.filterCounts).toEqual({
      all: 3,
      installed: 2,
      installable: 0,
      activatable: 1,
      attention: 2,
    });
    expect(model.items.map((item) => item.pluginId)).toEqual([
      "blocked-kit@limecloud",
      "notes-kit@limecloud",
      "research-kit@limecloud",
    ]);
    expect(
      model.items.find((item) => item.pluginId === "research-kit@limecloud"),
    ).toMatchObject({
      installed: true,
      enabled: true,
      activatable: true,
      needsAttention: false,
      blockerCodes: ["PLUGIN_RENDERER_UNAVAILABLE"],
      visibleBlockers: [],
      primaryAction: {
        kind: "open",
        labelKey: "plugin.marketplace.action.open",
        disabled: false,
      },
      package: expect.objectContaining({
        releaseId: "release-001",
      }),
      policy: {
        installation: "AVAILABLE",
        authentication: "ON_USE",
      },
      skills: [
        {
          id: "article-writer",
          title: "Article Writer",
          description: "Draft articles",
        },
      ],
      capabilityProfile: expect.objectContaining({
        summary: {
          agentCount: 1,
          subagentCount: 2,
          toolCount: 1,
          skillCount: 2,
        },
      }),
    });
    const researchProfile = model.items.find(
      (item) => item.pluginId === "research-kit@limecloud",
    )?.capabilityProfile;
    expect(
      researchProfile?.sections.flatMap((section) =>
        section.items.map((item) => item.id),
      ),
    ).toEqual(
      expect.arrayContaining([
        "research-kit",
        "researcher",
        "writer",
        "research-worker",
        "article-writer",
        "article-image-cheatsheet",
      ]),
    );
    expect(
      model.items.find((item) => item.pluginId === "notes-kit@limecloud"),
    ).toMatchObject({
      installed: true,
      enabled: false,
      needsAttention: true,
      visibleBlockers: [
        {
          code: "PLUGIN_DISABLED",
          labelKey: "plugin.marketplace.blocker.disabled",
        },
      ],
      primaryAction: {
        kind: "enable",
        labelKey: "plugin.marketplace.action.enable",
        disabled: false,
      },
    });
    expect(
      model.items.find((item) => item.pluginId === "blocked-kit@limecloud"),
    ).toMatchObject({
      installed: false,
      enabled: false,
      needsAttention: true,
      primaryAction: {
        kind: "blocked",
        labelKey: "plugin.marketplace.action.blocked",
        disabled: true,
        blockerCodes: expect.arrayContaining([
          "PLUGIN_MARKETPLACE_BLOCKED:registration required",
        ]),
      },
      visibleBlockers: expect.arrayContaining([
        {
          code: "PLUGIN_MARKETPLACE_BLOCKED:registration required",
          labelKey: "plugin.marketplace.blocker.marketplaceBlocked",
        },
      ]),
    });
  });

  it("应支持 query / category / status filter 和 status sort", () => {
    const model = buildPluginMarketplaceViewModel(snapshot(), {
      query: "kit",
      category: "research",
      statusFilter: "attention",
      sort: "status",
    });

    expect(model.items.map((item) => item.pluginId)).toEqual([
      "blocked-kit@limecloud",
    ]);
  });

  it("displayName 为空时应回落到 marketplace displayName 或插件标识", () => {
    const base = snapshot();
    base.marketplace.items[0] = {
      ...base.marketplace.items[0]!,
      displayName: "Marketplace Research",
    };
    base.registry[0] = {
      ...base.registry[0]!,
      displayName: " ",
    };

    expect(
      buildPluginMarketplaceViewModel(base).items.find(
        (item) => item.pluginId === "research-kit@limecloud",
      )?.displayName,
    ).toBe("Marketplace Research");

    base.marketplace.items[0] = {
      ...base.marketplace.items[0]!,
      displayName: " ",
      pluginName: " ",
    };

    expect(
      buildPluginMarketplaceViewModel(base).items.find(
        (item) => item.pluginId === "research-kit@limecloud",
      )?.displayName,
    ).toBe("research-kit@limecloud");
  });

  it("已安装但需要刷新包证据时应展示安装动作", () => {
    const base = snapshot();
    base.registry[0] = {
      ...base.registry[0]!,
      installed: true,
      enabled: true,
      capabilityStates: ["installable"],
      activationState: "blocked",
      blockerCodes: ["PLUGIN_CLOUD_RELEASE_EVIDENCE_MISSING"],
    };

    expect(
      buildPluginMarketplaceViewModel(base).items.find(
        (item) => item.pluginId === "research-kit@limecloud",
      ),
    ).toMatchObject({
      installed: true,
      installable: true,
      primaryAction: {
        kind: "install",
        labelKey: "plugin.marketplace.action.install",
        disabled: false,
      },
      visibleBlockers: [
        {
          code: "PLUGIN_CLOUD_RELEASE_EVIDENCE_MISSING",
          labelKey: "plugin.marketplace.blocker.generic",
        },
      ],
    });
  });
});
