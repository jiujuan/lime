import { describe, expect, it } from "vitest";
import type { Artifact } from "@/lib/artifact/types";
import {
  buildMessageArtifactsSignature,
  shouldPersistSettledLiveArtifact,
} from "./useWorkspaceArtifactStoreRuntime";

function artifact(id: string, status: Artifact["status"] = "complete") {
  return {
    id,
    type: "document",
    title: id,
    content: "content",
    status,
    meta: {},
    position: { start: 0, end: 0 },
    createdAt: 1,
    updatedAt: 1,
  } satisfies Artifact;
}

describe("shouldPersistSettledLiveArtifact", () => {
  it("只有 general 主题里从 streaming settled 成新引用时才需要回写", () => {
    const liveArtifact = artifact("artifact-1", "streaming");
    const settledLiveArtifact = artifact("artifact-1", "complete");

    expect(
      shouldPersistSettledLiveArtifact({
        activeTheme: "general",
        liveArtifact,
        settledLiveArtifact,
      }),
    ).toBe(true);
  });

  it("非 general 主题不回写 settled artifact", () => {
    const liveArtifact = artifact("artifact-1", "streaming");
    const settledLiveArtifact = artifact("artifact-1", "complete");

    expect(
      shouldPersistSettledLiveArtifact({
        activeTheme: "article",
        liveArtifact,
        settledLiveArtifact,
      }),
    ).toBe(false);
  });

  it("settled artifact 与 live artifact 同引用时不重复回写", () => {
    const liveArtifact = artifact("artifact-1");

    expect(
      shouldPersistSettledLiveArtifact({
        activeTheme: "general",
        liveArtifact,
        settledLiveArtifact: liveArtifact,
      }),
    ).toBe(false);
  });
});

describe("buildMessageArtifactsSignature", () => {
  it("消息数组引用变化但 artifacts 内容相同时签名应保持稳定", () => {
    const firstArtifact = artifact("artifact-1");
    const firstMessages = [{ artifacts: [firstArtifact] }];
    const secondMessages = [{ artifacts: [{ ...firstArtifact }] }];

    expect(buildMessageArtifactsSignature(firstMessages)).toBe(
      buildMessageArtifactsSignature(secondMessages),
    );
  });

  it("artifacts 内容变化时签名应变化", () => {
    expect(
      buildMessageArtifactsSignature([{ artifacts: [artifact("artifact-1")] }]),
    ).not.toBe(
      buildMessageArtifactsSignature([
        { artifacts: [artifact("artifact-1", "streaming")] },
      ]),
    );
  });
});
