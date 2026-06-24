import { describe, expect, it } from "vitest";
import { resolveWorkspaceBrowserControlPresentation } from "./workspaceBrowserControlMode";

describe("workspaceBrowserControlMode", () => {
  it("应把 human / human_takeover 识别为用户接管", () => {
    expect(
      resolveWorkspaceBrowserControlPresentation({
        controlMode: "human_takeover",
        lifecycleState: "live",
      }),
    ).toMatchObject({
      owner: "human",
      humanTakeover: true,
      overlayVisible: true,
      labelKey: "agentChat.rightSurface.browserControl.human.label",
    });

    expect(
      resolveWorkspaceBrowserControlPresentation({
        controlMode: "agent",
        lifecycleState: "human_controlling",
      }),
    ).toMatchObject({
      owner: "human",
      humanTakeover: true,
      overlayVisible: true,
    });
  });

  it("应把 shared / waiting_for_human 识别为协同等待", () => {
    expect(
      resolveWorkspaceBrowserControlPresentation({
        controlMode: "shared",
      }),
    ).toMatchObject({
      owner: "shared",
      humanTakeover: false,
      overlayVisible: true,
      labelKey: "agentChat.rightSurface.browserControl.shared.label",
    });

    expect(
      resolveWorkspaceBrowserControlPresentation({
        lifecycleState: "waiting-for-human",
      }),
    ).toMatchObject({
      owner: "shared",
      overlayVisible: true,
    });
  });

  it("agent 常态只暴露 flags，不显示 overlay", () => {
    expect(
      resolveWorkspaceBrowserControlPresentation({
        controlMode: "agent",
        lifecycleState: "live",
      }),
    ).toMatchObject({
      owner: "agent",
      humanTakeover: false,
      overlayVisible: false,
      labelKey: "agentChat.rightSurface.browserControl.agent.label",
    });
  });
});
