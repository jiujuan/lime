import { describe, expect, it } from "vitest";
import type { Artifact } from "@/lib/artifact/types";
import { resolveSettledWorkbenchArtifacts } from "./workspaceSettledArtifacts";

function artifact(id: string, overrides: Partial<Artifact> = {}): Artifact {
  return {
    id,
    type: "code",
    title: id,
    content: "",
    status: "complete",
    meta: {},
    position: { start: 0, end: 0 },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("resolveSettledWorkbenchArtifacts", () => {
  it("没有 settled live artifact 时应保留原 artifacts 引用", () => {
    const artifacts = [artifact("artifact-1")];

    expect(resolveSettledWorkbenchArtifacts(artifacts, null)).toBe(artifacts);
  });

  it("settled artifact 已经是同一引用时应保留原 artifacts 引用", () => {
    const liveArtifact = artifact("artifact-1");
    const artifacts = [liveArtifact, artifact("artifact-2")];

    expect(resolveSettledWorkbenchArtifacts(artifacts, liveArtifact)).toBe(
      artifacts,
    );
  });

  it("settled artifact 匹配现有 id 时应替换对应项", () => {
    const existingArtifact = artifact("artifact-1", { status: "streaming" });
    const settledArtifact = artifact("artifact-1", { status: "complete" });
    const otherArtifact = artifact("artifact-2");

    const nextArtifacts = resolveSettledWorkbenchArtifacts(
      [existingArtifact, otherArtifact],
      settledArtifact,
    );

    expect(nextArtifacts).toEqual([settledArtifact, otherArtifact]);
  });

  it("settled artifact 不存在于列表时应保留原 artifacts 引用", () => {
    const artifacts = [artifact("artifact-1")];

    expect(
      resolveSettledWorkbenchArtifacts(artifacts, artifact("artifact-2")),
    ).toBe(artifacts);
  });
});
