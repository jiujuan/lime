import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspacePluginHistoryRestoreLandingCard } from "./WorkspacePluginHistoryRestoreLandingCard";
import type { WorkspacePluginHistoryRestoreLandingModel } from "./workspacePluginHistoryRestoreLanding";

vi.mock("react-i18next", async () => {
  const agentZhCN = (await import("@/i18n/resources/zh-CN/agent.json"))
    .default as Record<string, string>;

  return {
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        const template = agentZhCN[key] ?? key;
        return template.replace(/{{\s*([^}]+?)\s*}}/g, (_, name: string) =>
          String(options?.[name.trim()] ?? ""),
        );
      },
    }),
  };
});

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

const model: WorkspacePluginHistoryRestoreLandingModel = {
  mode: "artifact_preview",
  tone: "info",
  titleKey: "pluginHistory.title.artifactPreview",
  descriptionKey: "pluginHistory.description.artifactPreview",
  statusKey: "pluginHistory.status.artifactPreview",
  pluginLabel: "创作工作台",
  artifactCount: 1,
  openedTabCount: 0,
  blockerCodes: [],
};

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

function renderCard(
  props?: Partial<
    React.ComponentProps<typeof WorkspacePluginHistoryRestoreLandingCard>
  >,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <WorkspacePluginHistoryRestoreLandingCard model={model} {...props} />,
    );
  });

  mountedRoots.push({ container, root });
  return container;
}

describe("WorkspacePluginHistoryRestoreLandingCard", () => {
  it("交付名称为空时仍展示可点击的交付内容按钮", () => {
    const onOpenArtifactPreview = vi.fn();
    const container = renderCard({
      artifactPreviewItems: [
        {
          key: "session-1:artifact-1",
          artifactRef: "artifact-1",
          index: 0,
          displayIndex: 1,
        },
      ],
      onOpenArtifactPreview,
    });

    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.includes("交付内容 1"),
    );
    expect(button).toBeTruthy();
    expect(button?.hasAttribute("disabled")).toBe(false);

    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenArtifactPreview).toHaveBeenCalledWith({
      key: "session-1:artifact-1",
      artifactRef: "artifact-1",
      index: 0,
      displayIndex: 1,
    });
  });

  it("没有打开回调时交付内容按钮保持禁用", () => {
    const container = renderCard({
      artifactPreviewItems: [
        {
          key: "session-1:artifact-1",
          artifactRef: "artifact-1",
          index: 0,
          displayIndex: 1,
        },
      ],
    });

    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.includes("交付内容 1"),
    );

    expect(button?.hasAttribute("disabled")).toBe(true);
  });
});
