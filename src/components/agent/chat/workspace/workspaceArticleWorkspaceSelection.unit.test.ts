import { describe, expect, it } from "vitest";
import type { WorkspaceArticleWorkspace } from "./workspaceArticleWorkspaceModel";
import {
  buildWorkspaceArticleObjectKey,
  buildWorkspaceArticleWorkspaceSelectionStorageKey,
  readWorkspaceArticleWorkspaceSelectedObjectKey,
  writeWorkspaceArticleWorkspaceSelectedObjectKey,
} from "./workspaceArticleWorkspaceSelection";

const profile: WorkspaceArticleWorkspace = {
  schemaVersion: "article-workspace.v1",
  appId: "content-factory-app",
  sessionId: "session-main",
  workspaceId: "workspace-main",
  source: "threadRead",
  objectCount: 2,
  actionHistory: [],
  objects: [
    {
      ref: {
        appId: "content-factory-app",
        kind: "articleDraft",
        id: "article-1",
        sessionId: "session-main",
      },
      title: "文章",
      status: "ready",
    },
    {
      ref: {
        appId: "content-factory-app",
        kind: "imageGenerationSet",
        id: "image-set-1",
        sessionId: "session-main",
      },
      title: "配图",
      status: "draft",
    },
  ],
};

describe("workspaceArticleWorkspaceSelection", () => {
  it("应按 workspace/session/app 生成稳定选择存储键", () => {
    expect(buildWorkspaceArticleWorkspaceSelectionStorageKey(profile)).toBe(
      "lime.workspace.article_workspace.selection.v1:workspace-main:session-main:content-factory-app",
    );
  });

  it("应写入并读取当前 profile 内有效对象选择", () => {
    const storage = new MapStorage();
    const objectKey = buildWorkspaceArticleObjectKey(profile.objects[1]!);

    writeWorkspaceArticleWorkspaceSelectedObjectKey(
      profile,
      objectKey,
      storage,
    );

    expect(
      readWorkspaceArticleWorkspaceSelectedObjectKey(profile, storage),
    ).toBe(objectKey);
  });

  it("读取到不属于当前 profile 的对象 key 时应忽略", () => {
    const storage = new MapStorage();
    storage.setItem(
      buildWorkspaceArticleWorkspaceSelectionStorageKey(profile),
      JSON.stringify({
        objectKey: "content-factory-app:session-main:missing:item",
      }),
    );

    expect(
      readWorkspaceArticleWorkspaceSelectedObjectKey(profile, storage),
    ).toBe(null);
  });
});

class MapStorage implements Storage {
  private readonly records = new Map<string, string>();

  get length(): number {
    return this.records.size;
  }

  clear(): void {
    this.records.clear();
  }

  getItem(key: string): string | null {
    return this.records.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.records.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.records.delete(key);
  }

  setItem(key: string, value: string): void {
    this.records.set(key, value);
  }
}
