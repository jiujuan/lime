import { describe, expect, it } from "vitest";
import type { Artifact, ArtifactType } from "@/lib/artifact/types";
import { GENERAL_BROWSER_ASSIST_ARTIFACT_ID } from "./browserAssistArtifact";
import {
  areWorkspaceArtifactsEqual,
  resolveWorkspaceArtifactsFromMessages,
} from "./workspaceArtifactStoreSync";

function artifact(id: string, type: ArtifactType = "document"): Artifact {
  return {
    id,
    type,
    title: id,
    content: `content:${id}`,
    status: "complete",
    meta: {},
    position: { start: 0, end: 0 },
    createdAt: 1,
    updatedAt: 1,
  };
}

function browserAssistArtifact(scopeKey: string): Artifact {
  return {
    ...artifact(GENERAL_BROWSER_ASSIST_ARTIFACT_ID, "browser_assist"),
    content: "",
    meta: {
      persistOutsideMessages: true,
      browserAssistScopeKey: scopeKey,
    },
  };
}

describe("resolveWorkspaceArtifactsFromMessages", () => {
  it("artifact store 等价判断应允许同内容不同引用短路", () => {
    expect(
      areWorkspaceArtifactsEqual(
        [artifact("artifact-1")],
        [{ ...artifact("artifact-1") }],
      ),
    ).toBe(true);
  });

  it("artifact store 等价判断应识别内容或顺序变化", () => {
    expect(
      areWorkspaceArtifactsEqual(
        [artifact("artifact-1"), artifact("artifact-2")],
        [artifact("artifact-2"), artifact("artifact-1")],
      ),
    ).toBe(false);
    expect(
      areWorkspaceArtifactsEqual(
        [artifact("artifact-1")],
        [{ ...artifact("artifact-1"), updatedAt: 2 }],
      ),
    ).toBe(false);
  });

  it("非 general 主题应清空 artifact store", () => {
    expect(
      resolveWorkspaceArtifactsFromMessages({
        activeTheme: "article",
        messages: [{ artifacts: [artifact("message-artifact")] }],
        currentArtifacts: [artifact("current-artifact")],
        browserAssistScopeKey: "workspace:session-1",
      }),
    ).toEqual([]);
  });

  it("general 主题应合并消息 artifacts 并保留同 scope 浏览器协助 artifact", () => {
    const scopedBrowserAssistArtifact = browserAssistArtifact(
      "workspace:session-1",
    );

    const result = resolveWorkspaceArtifactsFromMessages({
      activeTheme: "general",
      messages: [{ artifacts: [artifact("message-artifact")] }],
      currentArtifacts: [scopedBrowserAssistArtifact],
      browserAssistScopeKey: "workspace:session-1",
    });

    expect(result.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "message-artifact",
        GENERAL_BROWSER_ASSIST_ARTIFACT_ID,
      ]),
    );
  });

  it("general 主题应丢弃不同 scope 的浏览器协助 artifact", () => {
    const result = resolveWorkspaceArtifactsFromMessages({
      activeTheme: "general",
      messages: [],
      currentArtifacts: [browserAssistArtifact("workspace:old-session")],
      browserAssistScopeKey: "workspace:new-session",
    });

    expect(result).toEqual([]);
  });

  it("应先去重消息 artifacts 再写入 store", () => {
    const firstArtifact = artifact("artifact-1");
    const secondArtifact = {
      ...artifact("artifact-1"),
      title: "artifact-1-updated",
      content: "updated",
      updatedAt: 2,
    };

    const result = resolveWorkspaceArtifactsFromMessages({
      activeTheme: "general",
      messages: [
        { artifacts: [firstArtifact] },
        { artifacts: [secondArtifact] },
      ],
      currentArtifacts: [],
      browserAssistScopeKey: null,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "artifact-1",
      title: "artifact-1-updated",
      content: "updated",
      updatedAt: 2,
    });
  });
});
