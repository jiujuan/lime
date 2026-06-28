import { describe, expect, it } from "vitest";
import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime";
import type { PluginContract, PluginRegistryItem } from "@/features/plugin";
import {
  buildWorkspacePluginHistoryRestoreProjection,
  extractWorkspacePluginHistoryRestoreSnapshot,
} from "./workspacePluginHistoryRestoreRuntime";

const contract: PluginContract = {
  schemaVersion: 1,
  id: "creator-workbench",
  displayName: "创作工作台",
  version: "1.0.0",
  description: "创作业务应用",
  keywords: [],
  categories: [],
  capabilities: [],
  componentPaths: {},
  skills: [],
  agentApps: [],
  subagents: [],
  workflows: [],
  connectors: [],
  mcpServers: [],
  artifactRenderers: [],
  activationEntries: [
    {
      key: "creator",
      title: "创作工作台",
      kind: "agentApp",
      defaultObjectKind: "articleDraft",
    },
  ],
  historyRestore: {
    defaultSurface: "selectedObject",
    restoreSelection: true,
    restoreLayout: true,
    fallback: "artifactPreview",
  },
  rightSurface: {
    defaultActiveTab: "productProfile",
    supportedTabs: ["productProfile", "appSurface"],
    historyRestore: {
      enabled: true,
      restoreSelection: true,
      restoreLayout: true,
    },
    productWorkspace: {
      enabled: true,
      primaryObjectKind: "articleDraft",
      selectionPolicy: "last",
    },
    panes: [],
  },
  provenance: {
    sourceKind: "agent_app_manifest",
    sourceId: "creator-workbench",
    sourceVersion: "1.0.0",
  },
};

const registryItem: PluginRegistryItem = {
  pluginId: "creator-workbench",
  displayName: "创作工作台",
  version: "1.0.0",
  installed: true,
  enabled: true,
  capabilityStates: ["activatable", "renderable"],
  activationState: "activatable",
  rendererState: "renderable",
  historyState: "read_write",
  blockerCodes: [],
};

function threadRead(): AgentRuntimeThreadReadModel {
  return {
    thread_id: "thread-1",
    session_business_object_ref_metadata: {
      harness: {
        plugin_history_restore: {
          session_id: "session-1",
          plugin_id: "creator-workbench",
          active_agent_app_id: "creator-workbench",
          active_entry_key: "creator",
          selected_skill_keys: ["article-draft"],
          plugin_workspace: {
            plugin_id: "creator-workbench",
            objects: [
              {
                ref: {
                  plugin_id: "creator-workbench",
                  object_kind: "articleDraft",
                  object_id: "draft-1",
                  artifact_ids: ["artifact-1"],
                },
                title: "文章草稿",
              },
            ],
            selected_object_ref: {
              plugin_id: "creator-workbench",
              object_kind: "articleDraft",
              object_id: "draft-1",
            },
            opened_tabs: ["productProfile", "appSurface"],
            pinned_tabs: ["productProfile"],
          },
          layout_state: {
            active_surface_kind: "productProfile",
            open_surface_kinds: ["productProfile", "appSurface"],
          },
          artifact_refs: ["artifact-1"],
        },
      },
    },
  };
}

describe("workspacePluginHistoryRestoreRuntime", () => {
  it("应从 thread read session metadata 反投影插件历史恢复 snapshot", () => {
    expect(extractWorkspacePluginHistoryRestoreSnapshot(threadRead())).toMatchObject({
      sessionId: "session-1",
      pluginId: "creator-workbench",
      activeEntryKey: "creator",
      selectedSkillKeys: ["article-draft"],
      pluginWorkspace: {
        pluginId: "creator-workbench",
        selectedObjectRef: {
          pluginId: "creator-workbench",
          objectKind: "articleDraft",
          objectId: "draft-1",
        },
        openedTabs: ["productProfile", "appSurface"],
      },
      artifactRefs: ["artifact-1"],
    });
  });

  it("应生成可交给右栏 pending 的历史恢复 activation context", () => {
    const projection = buildWorkspacePluginHistoryRestoreProjection({
      threadRead: threadRead(),
      contracts: [contract],
      registryItems: [registryItem],
    });

    expect(projection).toMatchObject({
      status: "restored",
      actionMode: "interactive",
      activationContext: {
        sessionId: "session-1",
        pluginId: "creator-workbench",
        source: "history",
        selectedObjectRef: {
          pluginId: "creator-workbench",
          objectKind: "articleDraft",
          objectId: "draft-1",
        },
        openedTabs: ["productProfile", "appSurface"],
      },
    });
  });

  it("没有历史恢复 metadata 时应返回 null", () => {
    expect(
      buildWorkspacePluginHistoryRestoreProjection({
        threadRead: { thread_id: "thread-1" },
        contracts: [contract],
        registryItems: [registryItem],
      }),
    ).toBeNull();
  });

});
