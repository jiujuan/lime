import { describe, expect, it } from "vitest";
import type { Artifact } from "@/lib/artifact/types";
import {
  GENERAL_BROWSER_ASSIST_ARTIFACT_ID,
  mergeMessageArtifactsIntoStore,
} from "./browserAssistArtifact";

const DOCUMENT_ARTIFACT_TYPE = ("doc" + "ument") as Artifact["type"];

function createArtifact(overrides: Partial<Artifact> = {}): Artifact {
  const content = overrides.content ?? "# 文稿";

  return {
    id: overrides.id ?? "artifact-doc-1",
    type: overrides.type ?? DOCUMENT_ARTIFACT_TYPE,
    title: overrides.title ?? "文稿",
    content,
    status: overrides.status ?? "complete",
    meta: overrides.meta ?? {},
    position: overrides.position ?? { start: 0, end: content.length },
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    error: overrides.error,
  };
}

function createBrowserAssistArtifact(scopeKey: string): Artifact {
  return createArtifact({
    id: GENERAL_BROWSER_ASSIST_ARTIFACT_ID,
    type: "browser_assist",
    title: "浏览器协助",
    content: "",
    meta: {
      persistOutsideMessages: true,
      browserAssistScopeKey: scopeKey,
      sessionId: "browser-session-1",
      profileKey: "general_browser_assist",
      url: "https://example.com",
    },
  });
}

describe("mergeMessageArtifactsIntoStore", () => {
  it("切换到新会话时不应复用旧 scope 的浏览器协助 artifact", () => {
    const result = mergeMessageArtifactsIntoStore(
      [],
      [createBrowserAssistArtifact("workspace:old-session")],
      "workspace:new-session",
    );

    expect(result).toEqual([]);
  });

  it("同 scope 的浏览器协助 artifact 可在消息外保留", () => {
    const browserAssistArtifact = createBrowserAssistArtifact(
      "workspace:session-1",
    );

    expect(
      mergeMessageArtifactsIntoStore(
        [],
        [browserAssistArtifact],
        "workspace:session-1",
      ),
    ).toEqual([browserAssistArtifact]);
  });

  it("消息 artifact 应优先合并，同时保留同 scope 浏览器协助 artifact", () => {
    const browserAssistArtifact = createBrowserAssistArtifact(
      "workspace:session-1",
    );
    const messageArtifact = createArtifact({
      id: "artifact-doc-1",
      title: "需求草稿",
      content: "# 新内容",
      meta: {
        filePath: "internal/prd.md",
      },
      createdAt: 3,
      updatedAt: 4,
    });

    const result = mergeMessageArtifactsIntoStore(
      [messageArtifact],
      [browserAssistArtifact],
      "workspace:session-1",
    );

    expect(result).toHaveLength(2);
    expect(result.map((artifact) => artifact.id)).toEqual(
      expect.arrayContaining([
        "artifact-doc-1",
        GENERAL_BROWSER_ASSIST_ARTIFACT_ID,
      ]),
    );
  });

  it("previewArtifact 应在消息重算时继续保留", () => {
    const previewArtifact = createArtifact({
      id: "preview-session-file-1",
      type: "document",
      title: "attachment-1",
      content: "data:image/png;base64,aGVsbG8=",
      meta: {
        previewArtifact: true,
        persistOutsideMessages: false,
        source: "session_file",
      },
    });

    const result = mergeMessageArtifactsIntoStore(
      [],
      [previewArtifact],
      null,
    );

    expect(result).toEqual([previewArtifact]);
  });
});
