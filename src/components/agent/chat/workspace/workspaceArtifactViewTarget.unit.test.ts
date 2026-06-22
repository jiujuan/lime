import { describe, expect, it } from "vitest";
import { resolveActiveArtifactViewTargetId } from "./workspaceArtifactViewTarget";

describe("resolveActiveArtifactViewTargetId", () => {
  it("应优先使用 displayed artifact id", () => {
    expect(
      resolveActiveArtifactViewTargetId({
        displayedArtifact: { id: "displayed" },
        currentCanvasArtifact: { id: "current" },
        selectedArtifact: { id: "selected" },
        liveArtifact: { id: "live" },
      }),
    ).toBe("displayed");
  });

  it("displayed 缺失时应使用 current canvas artifact id", () => {
    expect(
      resolveActiveArtifactViewTargetId({
        currentCanvasArtifact: { id: "current" },
        selectedArtifact: { id: "selected" },
        liveArtifact: { id: "live" },
      }),
    ).toBe("current");
  });

  it("current 缺失时应使用 selected artifact id", () => {
    expect(
      resolveActiveArtifactViewTargetId({
        selectedArtifact: { id: "selected" },
        liveArtifact: { id: "live" },
      }),
    ).toBe("selected");
  });

  it("selected 缺失时应使用 live artifact id", () => {
    expect(
      resolveActiveArtifactViewTargetId({
        liveArtifact: { id: "live" },
      }),
    ).toBe("live");
  });

  it("没有可用 artifact id 时应返回 null", () => {
    expect(resolveActiveArtifactViewTargetId({})).toBeNull();
  });
});
