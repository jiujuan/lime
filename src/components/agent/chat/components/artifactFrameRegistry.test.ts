import type React from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Artifact } from "@/lib/artifact/types";
import {
  clearArtifactFrameRegistry,
  artifactFrameRegistry,
  registerArtifactFrameRenderer,
  resolveArtifactFrameRenderer,
} from "./artifactFrameRegistry";

function createArtifact(overrides: Partial<Artifact> = {}): Artifact {
  const content = overrides.content ?? "artifact content";
  return {
    id: overrides.id ?? "artifact-1",
    type: overrides.type ?? "document",
    title: overrides.title ?? "artifact",
    content,
    status: overrides.status ?? "complete",
    meta: overrides.meta ?? {},
    position: overrides.position ?? { start: 0, end: content.length },
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    error: overrides.error,
  };
}

describe("artifactFrameRegistry", () => {
  afterEach(() => {
    clearArtifactFrameRegistry();
  });

  it("应按优先级和匹配器解析第一个可用 frame renderer", () => {
    clearArtifactFrameRegistry();

    const fallback = {
      id: "fallback",
      priority: 1,
      supports: () => true,
      component: (() => null) as React.ComponentType<{
        artifact: Artifact;
        messageId: string;
      }>,
    };
    const preferred = {
      id: "preferred",
      priority: 10,
      supports: (artifact: Artifact) => artifact.meta.kind === "preferred",
      component: (() => null) as React.ComponentType<{
        artifact: Artifact;
        messageId: string;
      }>,
    };

    registerArtifactFrameRenderer(fallback);
    registerArtifactFrameRenderer(preferred);

    expect(resolveArtifactFrameRenderer(createArtifact())).toBe(fallback);
    expect(
      resolveArtifactFrameRenderer(
        createArtifact({ meta: { kind: "preferred" } }),
      ),
    ).toBe(preferred);
  });

  it("重复注册同 id 的 renderer 时应覆盖旧实现", () => {
    clearArtifactFrameRegistry();

    const first = {
      id: "article",
      priority: 1,
      supports: () => true,
      component: (() => null) as React.ComponentType<{
        artifact: Artifact;
        messageId: string;
      }>,
    };
    const second = {
      id: "article",
      priority: 5,
      supports: () => true,
      component: (() => null) as React.ComponentType<{
        artifact: Artifact;
        messageId: string;
      }>,
    };

    registerArtifactFrameRenderer(first);
    registerArtifactFrameRenderer(second);

    expect(artifactFrameRegistry.getAll()).toHaveLength(1);
    expect(resolveArtifactFrameRenderer(createArtifact())).toBe(second);
  });
});
