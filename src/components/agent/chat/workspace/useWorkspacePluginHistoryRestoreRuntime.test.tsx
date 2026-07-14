import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime/sessionTypes";
import type { Artifact } from "@/lib/artifact/types";
import { toast } from "sonner";
import { useWorkspacePluginHistoryRestoreRuntime } from "./useWorkspacePluginHistoryRestoreRuntime";

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

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

type HookProps = Parameters<typeof useWorkspacePluginHistoryRestoreRuntime>[0];

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

function historyThreadRead(): AgentRuntimeThreadReadModel {
  return {
    thread_id: "thread-plugin-history",
    session_business_object_ref_metadata: {
      harness: {
        plugin_history_restore: {
          session_id: "session-plugin-history",
          plugin_id: "missing-plugin",
          artifact_refs: ["artifact-1"],
        },
      },
    },
  };
}

function renderHook(props?: Partial<HookProps>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const defaultProps: HookProps = {
    handleWorkspaceArtifactClick: vi.fn(),
    pluginRuntimeContext: {
      contracts: [],
      registry: [],
    },
    threadRead: historyThreadRead(),
    upsertGeneralArtifact: vi.fn(),
  };

  function Probe(currentProps: HookProps) {
    const runtime = useWorkspacePluginHistoryRestoreRuntime(currentProps);
    return <>{runtime.landingCard}</>;
  }

  act(() => {
    root.render(<Probe {...defaultProps} {...props} />);
  });
  mountedRoots.push({ container, root });

  return {
    container,
    props: { ...defaultProps, ...props },
  };
}

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

describe("useWorkspacePluginHistoryRestoreRuntime", () => {
  it("没有历史恢复 metadata 时不渲染 landing card", () => {
    const { container } = renderHook({
      threadRead: {
        thread_id: "thread-plain",
      },
    });

    expect(
      container.querySelector(
        "[data-testid='workspace-plugin-history-landing-card']",
      ),
    ).toBeNull();
  });

  it("交付内容预览由 runtime 生成 artifact 并交给工作台打开", () => {
    const { container, props } = renderHook();
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.includes("交付内容 1"),
    );

    expect(button).toBeTruthy();
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(props.upsertGeneralArtifact).toHaveBeenCalledTimes(1);
    expect(props.handleWorkspaceArtifactClick).toHaveBeenCalledTimes(1);
    const artifact = vi.mocked(props.upsertGeneralArtifact).mock
      .calls[0]?.[0] as Artifact;
    expect(artifact).toMatchObject({
      title: "交付内容 1",
      meta: {
        openedFrom: "plugin_history_restore",
        sessionId: "session-plugin-history",
        artifactRef: "artifact-1",
      },
    });
    expect(props.handleWorkspaceArtifactClick).toHaveBeenCalledWith(artifact);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
