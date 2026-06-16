import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceTopicSwitch } from "./useWorkspaceTopicSwitch";

const projectApiMock = vi.hoisted(() => ({
  getProject: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/lib/api/project", () => projectApiMock);
vi.mock("@/lib/agentDebug", () => ({
  logAgentDebug: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: toastMock,
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

type HookValue = ReturnType<typeof useWorkspaceTopicSwitch>;

type HookProps = Parameters<typeof useWorkspaceTopicSwitch>[0];

function createBaseProps(overrides: Partial<HookProps> = {}): HookProps {
  return {
    projectId: "workspace-1",
    externalProjectId: null,
    originalSwitchTopic: vi.fn(async () => undefined),
    onBeforeTopicSwitch: vi.fn(),
    startTopicProjectResolution: vi.fn(() => true),
    finishTopicProjectResolution: vi.fn(),
    deferTopicSwitch: vi.fn(),
    consumePendingTopicSwitch: vi.fn(() => null),
    rememberProjectId: vi.fn(),
    getRememberedProjectId: vi.fn(() => null),
    loadTopicBoundProjectId: vi.fn(() => "workspace-1"),
    resetTopicLocalState: vi.fn(),
    ...overrides,
  };
}

function renderHook(props: HookProps) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latestValue: HookValue | null = null;

  function Probe(currentProps: HookProps) {
    latestValue = useWorkspaceTopicSwitch(currentProps);
    return null;
  }

  mountedRoots.push({ root, container });

  act(() => {
    root.render(<Probe {...props} />);
  });

  return {
    getValue() {
      if (!latestValue) {
        throw new Error("useWorkspaceTopicSwitch 尚未渲染");
      }
      return latestValue;
    },
  };
}

describe("useWorkspaceTopicSwitch", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    projectApiMock.getProject.mockReset();
    toastMock.error.mockReset();
    toastMock.info.mockReset();
  });

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const mounted = mountedRoots.pop();
      if (!mounted) {
        continue;
      }

      act(() => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("当前项目快速切换前应先发出会话导航信号", async () => {
    const originalSwitchTopic = vi.fn(async () => undefined);
    const onBeforeTopicSwitch = vi.fn();
    const props = createBaseProps({
      originalSwitchTopic,
      onBeforeTopicSwitch,
    });
    const mounted = renderHook(props);

    let result: Awaited<ReturnType<HookValue["switchTopic"]>> | undefined;
    await act(async () => {
      result = await mounted.getValue().switchTopic("session-1");
    });

    expect(result).toBe("success");
    expect(onBeforeTopicSwitch).toHaveBeenCalledTimes(1);
    expect(onBeforeTopicSwitch).toHaveBeenCalledWith("session-1");
    expect(onBeforeTopicSwitch.mock.invocationCallOrder[0]).toBeLessThan(
      originalSwitchTopic.mock.invocationCallOrder[0],
    );
  });

  it("没有明确项目时应返回 missing，不再回退默认项目", async () => {
    const originalSwitchTopic = vi.fn(async () => undefined);
    const onBeforeTopicSwitch = vi.fn();
    const props = createBaseProps({
      projectId: undefined,
      originalSwitchTopic,
      onBeforeTopicSwitch,
      loadTopicBoundProjectId: vi.fn(() => null),
    });
    const mounted = renderHook(props);

    let result: Awaited<ReturnType<HookValue["switchTopic"]>> | undefined;
    await act(async () => {
      result = await mounted.getValue().switchTopic("session-2");
    });

    expect(result).toBe("missing");
    expect(onBeforeTopicSwitch).toHaveBeenCalledTimes(1);
    expect(projectApiMock.getProject).not.toHaveBeenCalled();
    expect(props.deferTopicSwitch).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith("未找到可用项目，请先创建项目");
    expect(originalSwitchTopic).not.toHaveBeenCalled();
  });

  it("当前项目已知但话题未绑定时应直接切换，不再等待项目解析", async () => {
    const originalSwitchTopic = vi.fn(async () => undefined);
    const onBeforeTopicSwitch = vi.fn();
    const props = createBaseProps({
      originalSwitchTopic,
      onBeforeTopicSwitch,
      loadTopicBoundProjectId: vi.fn(() => null),
    });
    const mounted = renderHook(props);

    let result: Awaited<ReturnType<HookValue["switchTopic"]>> | undefined;
    await act(async () => {
      result = await mounted.getValue().switchTopic("session-fast-path");
    });

    expect(result).toBe("success");
    expect(projectApiMock.getProject).not.toHaveBeenCalled();
    expect(onBeforeTopicSwitch).toHaveBeenCalledWith("session-fast-path");
    expect(originalSwitchTopic).toHaveBeenCalledWith("session-fast-path");
  });

  it("直接 runTopicSwitch 时也应发出导航信号", async () => {
    const originalSwitchTopic = vi.fn(async () => undefined);
    const onBeforeTopicSwitch = vi.fn();
    const props = createBaseProps({
      originalSwitchTopic,
      onBeforeTopicSwitch,
    });
    const mounted = renderHook(props);

    await act(async () => {
      await mounted.getValue().runTopicSwitch("session-3");
    });

    expect(onBeforeTopicSwitch).toHaveBeenCalledWith("session-3");
    expect(onBeforeTopicSwitch.mock.invocationCallOrder[0]).toBeLessThan(
      originalSwitchTopic.mock.invocationCallOrder[0],
    );
  });
});
