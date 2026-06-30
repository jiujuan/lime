import { describe, expect, it } from "vitest";
import type { PluginContract } from "@/features/plugin";
import contentFactoryFixture from "@/features/agent-app/fixtures/content-factory-app.json";
import { buildPackageIdentity } from "@/features/agent-app/install/packageIdentity";
import { normalizeManifest } from "@/features/agent-app/manifest/normalizeManifest";
import { parseManifest } from "@/features/agent-app/manifest/parseManifest";
import type { InstalledAgentAppState } from "@/features/agent-app/types";
import { projectPluginRegistryFromInstalledAgentApps } from "@/features/plugin";
import type { WorkspacePluginRuntimeContext } from "./workspacePluginRuntimeContext";
import { buildWorkspacePluginInputSuggestions } from "./workspacePluginInputSuggestions";

function createContract(
  overrides: Partial<PluginContract> = {},
): PluginContract {
  return {
    schemaVersion: 1,
    id: "content-workbench",
    name: "content-workbench",
    displayName: "内容工厂",
    version: "1.0.0",
    description: "内容生产插件",
    keywords: [],
    categories: [],
    capabilities: [],
    componentPaths: {},
    skills: [
      {
        id: "article-writer",
        title: "文章写作",
        description: "生成文章草稿",
      },
    ],
    agentApps: [],
    subagents: [],
    workflows: [],
    connectors: [],
    mcpServers: [],
    artifactRenderers: [],
    activationEntries: [],
    historyRestore: {
      defaultSurface: "chat",
      restoreSelection: false,
      restoreLayout: false,
      fallback: "chatOnly",
    },
    rightSurface: {
      supportedTabs: [],
      historyRestore: {
        enabled: false,
        restoreSelection: false,
        restoreLayout: false,
      },
      articleWorkspace: {
        enabled: false,
        selectionPolicy: "primary",
      },
      panes: [],
    },
    provenance: {
      sourceKind: "plugin_manifest",
      sourceId: "content-workbench",
      sourceVersion: "1.0.0",
    },
    ...overrides,
  };
}

function createContext(
  overrides: Partial<WorkspacePluginRuntimeContext> = {},
): WorkspacePluginRuntimeContext {
  return {
    status: "inactive",
    activationContext: null,
    contracts: [createContract()],
    skippedAppIds: [],
    blockerCodes: [],
    registry: [
      {
        pluginId: "content-workbench",
        displayName: "内容工厂",
        version: "1.0.0",
        installed: true,
        enabled: true,
        capabilityStates: ["activatable"],
        activationState: "activatable",
        rendererState: "renderable",
        historyState: "read_write",
        blockerCodes: [],
      },
      {
        pluginId: "blocked-workbench",
        displayName: "受限工作台",
        version: "1.0.0",
        installed: true,
        enabled: false,
        capabilityStates: [],
        activationState: "disabled",
        rendererState: "renderable",
        historyState: "read_only_history",
        blockerCodes: ["PLUGIN_DISABLED"],
      },
    ],
    ...overrides,
  };
}

function installedContentFactory(): InstalledAgentAppState {
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
  };
}

describe("workspacePluginInputSuggestions", () => {
  it("应把 workspace 插件 registry 投影为输入栏候选", () => {
    expect(buildWorkspacePluginInputSuggestions(createContext())).toEqual([
      {
        pluginId: "content-workbench",
        displayName: "内容工厂",
        description: "content-workbench",
        disabled: false,
        blockerCodes: [],
        skills: [
          {
            skillId: "article-writer",
            title: "文章写作",
            description: "生成文章草稿",
            disabled: false,
            blockerCodes: [],
          },
        ],
      },
      {
        pluginId: "blocked-workbench",
        displayName: "受限工作台",
        description: "blocked-workbench",
        disabled: true,
        blockerCodes: ["PLUGIN_DISABLED"],
        skills: [],
      },
    ]);
  });

  it("未安装插件 registry 时不应硬编码内容工厂候选", () => {
    expect(
      buildWorkspacePluginInputSuggestions(
        createContext({
          contracts: [],
          registry: [],
        }),
      ),
    ).toEqual([]);
  });

  it("内容工厂安装后应从 installed registry 投影写文章快捷入口", () => {
    const projection = projectPluginRegistryFromInstalledAgentApps([
      installedContentFactory(),
    ]);
    expect(
      buildWorkspacePluginInputSuggestions(
        createContext({
          contracts: projection.contracts,
          registry: projection.registry,
        }),
      ),
    ).toEqual([
      expect.objectContaining({
        pluginId: "content-factory-app",
        displayName: "内容工厂",
        description: expect.stringContaining("@写文章"),
        defaultPrompts: expect.arrayContaining([
          expect.stringContaining("@写文章"),
          expect.stringContaining("@写作"),
        ]),
        disabled: false,
        skills: expect.arrayContaining([
          expect.objectContaining({
            skillId: "content_article_generate",
            title: "写文章",
            trigger: "@写文章",
            defaultPrompt: expect.stringContaining("@写文章"),
            disabled: false,
          }),
          expect.objectContaining({
            skillId: "content_article_generate",
            title: "写文章",
            trigger: "@写作",
            disabled: false,
          }),
        ]),
      }),
    ]);
  });
});
