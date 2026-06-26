import { describe, expect, it } from "vitest";
import type { PluginContract } from "@/features/plugin";
import type { WorkspacePluginRuntimeContext } from "./workspacePluginRuntimeContext";
import { buildWorkspacePluginInputSuggestions } from "./workspacePluginInputSuggestions";

function createContract(overrides: Partial<PluginContract> = {}): PluginContract {
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
      productWorkspace: {
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
});
