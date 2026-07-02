import { describe, expect, it } from "vitest";

import contentFactoryFixture from "@/features/agent-app/testing/fixtures/content-factory-app.json";
import { buildPackageIdentity } from "@/features/agent-app/install/packageIdentity";
import { normalizeManifest } from "@/features/agent-app/manifest/normalizeManifest";
import { parseManifest } from "@/features/agent-app/manifest/parseManifest";
import type { InstalledAgentAppState } from "@/features/agent-app/types";
import {
  projectPluginContractsFromInstalledAgentApps,
  projectPluginRegistryFromInstalledAgentApps,
} from "./installedAgentApps";

function installedContentFactory(
  overrides: Partial<InstalledAgentAppState> = {},
): InstalledAgentAppState {
  const parsedManifest = parseManifest(contentFactoryFixture);
  const manifest = normalizeManifest(parsedManifest);
  return {
    appId: manifest.appId,
    identity: buildPackageIdentity({
      manifest: parsedManifest,
      loadedAt: "2026-06-25T00:00:00.000Z",
    }),
    manifest,
    projection: {} as InstalledAgentAppState["projection"],
    readiness: {
      appId: manifest.appId,
      status: "ready",
      checkedAt: "2026-06-25T00:00:00.000Z",
      blockers: [],
      warnings: [],
      supportedCapabilities: [],
      missingCapabilities: [],
      entryReadiness: [],
      installModes: [],
    },
    installMode: "in_lime",
    runtimeProfileSummary:
      {} as InstalledAgentAppState["runtimeProfileSummary"],
    setup: {} as InstalledAgentAppState["setup"],
    disabled: false,
    installedAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
    ...overrides,
  };
}

describe("installed Agent App plugin projection", () => {
  it("应把已安装 Agent App 投影成插件 contract 与可激活 registry", () => {
    const projection = projectPluginRegistryFromInstalledAgentApps([
      installedContentFactory(),
    ]);

    expect(projection.contracts[0]).toMatchObject({
      id: "content-factory-app",
      displayName: "内容工厂",
      provenance: {
        sourceKind: "agent_app_manifest",
        sourceId: "content-factory-app",
      },
    });
    expect(projection.registry[0]).toMatchObject({
      pluginId: "content-factory-app",
      installed: true,
      enabled: true,
      activationState: "activatable",
      capabilityStates: expect.arrayContaining(["activatable", "renderable"]),
    });
  });

  it("应兼容 App Server 返回的 raw Agent App manifest", () => {
    const projection = projectPluginRegistryFromInstalledAgentApps([
      {
        ...installedContentFactory(),
        manifest: contentFactoryFixture,
      } as unknown as InstalledAgentAppState,
    ]);

    expect(projection.skippedAppIds).toEqual([]);
    expect(projection.contracts[0]).toMatchObject({
      id: "content-factory-app",
      version: "2.0.0",
      activationEntries: expect.arrayContaining([
        expect.objectContaining({
          key: "content_article_generate",
          title: "写文章",
          aliases: ["@写文章", "@写作"],
          intent: "at_command",
        }),
      ]),
    });
    expect(projection.registry[0]).toMatchObject({
      pluginId: "content-factory-app",
      activationState: "activatable",
    });
  });

  it("应从 agentRuntime 合并旧安装状态中被截短的 activation entry", () => {
    const base = installedContentFactory();
    const projection = projectPluginRegistryFromInstalledAgentApps([
      {
        ...base,
        manifest: {
          ...base.manifest,
          activationEntries: [
            {
              key: "content_article_generate",
              title: "写文章",
              aliases: ["@写文章"],
              kind: "plugin",
              intent: "at_command",
              defaultObjectKind: "articleDraft",
            },
          ],
        },
      } as InstalledAgentAppState,
    ]);

    expect(projection.contracts[0]?.activationEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "content_article_generate",
          aliases: ["@写文章", "@写作"],
          taskKind: "content.article.generate",
          workflowKey: "content_article_workflow",
          outputArtifactKind: "content_factory.workspace_patch",
          rightSurface: "articleWorkspace",
          expectedObjects: ["articleDraft"],
        }),
      ]),
    );
  });

  it("禁用的 Agent App 应投影成只读历史状态", () => {
    const projection = projectPluginRegistryFromInstalledAgentApps([
      installedContentFactory({ disabled: true }),
    ]);

    expect(projection.registry[0]).toMatchObject({
      pluginId: "content-factory-app",
      installed: true,
      enabled: false,
      activationState: "disabled",
      historyState: "read_only_history",
      blockerCodes: expect.arrayContaining(["PLUGIN_DISABLED"]),
    });
  });

  it("坏 manifest 应 fail closed 并记录 skippedAppIds", () => {
    const broken = {
      ...installedContentFactory(),
      appId: "broken-app",
      manifest: {
        ...installedContentFactory().manifest,
        entries: null,
      },
    } as unknown as InstalledAgentAppState;

    expect(projectPluginContractsFromInstalledAgentApps([broken])).toEqual({
      contracts: [],
      skippedAppIds: ["broken-app"],
    });
    expect(projectPluginRegistryFromInstalledAgentApps([broken])).toMatchObject(
      {
        contracts: [],
        skippedAppIds: ["broken-app"],
        projectionInputs: [],
        registry: [],
      },
    );
  });
});
