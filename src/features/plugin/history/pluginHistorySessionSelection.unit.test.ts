import { describe, expect, it } from "vitest";
import type { AgentSessionInfo } from "@/lib/api/agentRuntime/sessionTypes";
import type { PluginMarketplaceViewItem } from "../marketplace/pluginMarketplaceViewModel";
import { buildPluginHistorySessionSelectionModel } from "./pluginHistorySessionSelection";

function item(pluginId = "content-factory@limecloud"): PluginMarketplaceViewItem {
  return {
    pluginId,
    pluginName: "content-factory",
    marketplaceName: "limecloud",
    marketplaceDisplayName: "Cloud",
    displayName: "内容工厂",
  } as PluginMarketplaceViewItem;
}

function session(
  id: string,
  metadata: Record<string, unknown> | null,
  updatedAt: number,
): AgentSessionInfo {
  return {
    id,
    name: `${id} title`,
    created_at: updatedAt - 1000,
    updated_at: updatedAt,
    messages_count: 3,
    model: "fixture-model",
    session_business_object_ref_metadata: metadata ?? undefined,
  };
}

describe("buildPluginHistorySessionSelectionModel", () => {
  it("应从历史恢复 metadata 中筛出当前插件会话并按更新时间倒序", () => {
    const model = buildPluginHistorySessionSelectionModel({
      item: item(),
      sessions: [
        session(
          "older",
          {
            harness: {
              plugin_history_restore: {
                session_id: "older",
                plugin_id: "content-factory@limecloud",
                artifact_refs: ["artifact-a", "artifact-a"],
              },
            },
          },
          100,
        ),
        session(
          "newer",
          {
            harness: {
              plugin_history_restore: {
                session_id: "newer",
                plugin_id: "content-factory@limecloud",
                active_plugin_ui_id: "content-factory-app",
              },
            },
          },
          300,
        ),
      ],
    });

    expect(model.candidates.map((candidate) => candidate.sessionId)).toEqual([
      "newer",
      "older",
    ]);
    expect(model.candidates[1]?.artifactRefs).toEqual(["artifact-a"]);
    expect(model.candidates[0]?.source).toBe("history_restore");
  });

  it("应兼容显式激活 metadata，但不匹配其他插件或坏 metadata", () => {
    const model = buildPluginHistorySessionSelectionModel({
      item: item(),
      sessions: [
        session(
          "activation-session",
          {
            harness: {
              plugin_activation: {
                session_id: "activation-session",
                plugin_id: "content-factory@limecloud",
                active_entry_key: "article-workspace",
              },
            },
          },
          200,
        ),
        session(
          "other-plugin",
          {
            harness: {
              plugin_activation: {
                plugin_id: "research-kit@limecloud",
              },
            },
          },
          500,
        ),
        session("bad", { harness: { plugin_activation: {} } }, 600),
      ],
    });

    expect(model.candidates).toHaveLength(1);
    expect(model.candidates[0]).toEqual(
      expect.objectContaining({
        sessionId: "activation-session",
        activeEntryKey: "article-workspace",
        source: "plugin_activation",
      }),
    );
  });
});
