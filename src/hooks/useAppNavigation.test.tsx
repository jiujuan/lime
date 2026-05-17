import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildClawAgentParams } from "@/lib/workspace/navigation";
import { useAppNavigation } from "./useAppNavigation";

const NAVIGATION_RESTORE_STORAGE_KEY = "lime.appNavigation.restore.v1";

interface ProbeProps {
  onReady: (value: ReturnType<typeof useAppNavigation>) => void;
}

function HookProbe({ onReady }: ProbeProps) {
  const navigation = useAppNavigation();

  useEffect(() => {
    onReady(navigation);
  }, [navigation, onReady]);

  return null;
}

describe("useAppNavigation", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latestNavigation: ReturnType<typeof useAppNavigation> | null;
  let readyCallCount: number;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    window.localStorage.clear();
    window.sessionStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    latestNavigation = null;
    readyCallCount = 0;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  async function flushEffects() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  async function renderProbe() {
    await act(async () => {
      root.render(
        <HookProbe
          onReady={(value) => {
            latestNavigation = value;
            readyCallCount += 1;
          }}
        />,
      );
    });
    await flushEffects();
  }

  async function remountProbe() {
    await act(async () => {
      root.unmount();
    });
    latestNavigation = null;
    readyCallCount = 0;
    root = createRoot(container);
    await renderProbe();
  }

  it("初始化时应落在新建任务主链", async () => {
    await renderProbe();

    expect(latestNavigation?.currentPage).toBe("agent");
    expect(latestNavigation?.requestedPage).toBe("agent");
    expect(latestNavigation?.navigationRequestId).toBe(0);
    expect(latestNavigation?.isNavigating).toBe(false);
    expect(latestNavigation?.pageParams).toMatchObject({
      agentEntry: "new-task",
      immersiveHome: false,
      theme: "general",
      lockTheme: false,
    });
  });

  it("agent 跳转应直接保留现役参数", async () => {
    await renderProbe();

    await act(async () => {
      latestNavigation?.handleNavigate(
        "agent",
        buildClawAgentParams({
          projectId: "project-2",
          initialUserPrompt: "继续整理当前项目",
        }),
      );
    });

    expect(latestNavigation?.currentPage).toBe("agent");
    expect(latestNavigation?.pageParams).toEqual({
      projectId: "project-2",
      initialUserPrompt: "继续整理当前项目",
      agentEntry: "claw",
      immersiveHome: false,
      theme: "general",
      lockTheme: false,
    });
  });

  it("skills 跳转应直接进入技能主页面", async () => {
    await renderProbe();

    await act(async () => {
      latestNavigation?.handleNavigate("skills");
    });

    expect(latestNavigation?.currentPage).toBe("skills");
    expect(latestNavigation?.requestedPage).toBe("skills");
    expect(latestNavigation?.navigationRequestId).toBe(1);
    expect(latestNavigation?.pageParams).toEqual({});
  });

  it("agent-app-lab 跳转应保留页面参数", async () => {
    await renderProbe();

    await act(async () => {
      latestNavigation?.handleNavigate("agent-app-lab", { source: "fixture" });
    });

    expect(latestNavigation?.currentPage).toBe("agent-app-lab");
    expect(latestNavigation?.pageParams).toEqual({
      source: "fixture",
    });
  });

  it("agent-app 跳转应写入可恢复的最小页面状态", async () => {
    await renderProbe();

    await act(async () => {
      latestNavigation?.handleNavigate("agent-app", {
        appId: "content-factory-app",
        entryKey: "content_factory",
        launchRequestKey: 42,
      });
    });
    await flushEffects();

    expect(latestNavigation?.currentPage).toBe("agent-app");
    expect(latestNavigation?.pageParams).toEqual({
      appId: "content-factory-app",
      entryKey: "content_factory",
      launchRequestKey: 42,
    });
    expect(
      JSON.parse(
        window.sessionStorage.getItem(NAVIGATION_RESTORE_STORAGE_KEY) ?? "{}",
      ),
    ).toEqual({
      page: "agent-app",
      params: {
        appId: "content-factory-app",
        entryKey: "content_factory",
        launchRequestKey: 42,
      },
    });
  });

  it("重新挂载时应恢复 agent-app 页面和白名单参数", async () => {
    window.sessionStorage.setItem(
      NAVIGATION_RESTORE_STORAGE_KEY,
      JSON.stringify({
        page: "agent-app",
        params: {
          appId: "content-factory-app",
          entryKey: "content_factory",
          launchRequestKey: 1001,
          initialRequestMetadata: { shouldNotRestore: true },
        },
      }),
    );

    await renderProbe();

    expect(latestNavigation?.currentPage).toBe("agent-app");
    expect(latestNavigation?.requestedPage).toBe("agent-app");
    expect(latestNavigation?.navigationRequestId).toBe(0);
    expect(latestNavigation?.isNavigating).toBe(false);
    expect(latestNavigation?.pageParams).toEqual({
      appId: "content-factory-app",
      entryKey: "content_factory",
      launchRequestKey: 1001,
    });

    await remountProbe();

    expect(latestNavigation?.currentPage).toBe("agent-app");
    expect(latestNavigation?.pageParams).toEqual({
      appId: "content-factory-app",
      entryKey: "content_factory",
      launchRequestKey: 1001,
    });
  });

  it("非法恢复状态应回退新建任务主链并清理存储", async () => {
    window.sessionStorage.setItem(
      NAVIGATION_RESTORE_STORAGE_KEY,
      JSON.stringify({
        page: "skills",
        params: { appId: "content-factory-app" },
      }),
    );

    await renderProbe();

    expect(latestNavigation?.currentPage).toBe("agent");
    expect(latestNavigation?.pageParams).toMatchObject({
      agentEntry: "new-task",
      immersiveHome: false,
    });
    expect(window.sessionStorage.getItem(NAVIGATION_RESTORE_STORAGE_KEY)).toBe(
      null,
    );
  });

  it("离开 agent-app 时应清理恢复状态", async () => {
    await renderProbe();

    await act(async () => {
      latestNavigation?.handleNavigate("agent-app", {
        appId: "content-factory-app",
        entryKey: "content_factory",
      });
    });
    await flushEffects();

    const storedRestore = window.sessionStorage.getItem(
      NAVIGATION_RESTORE_STORAGE_KEY,
    );
    expect(storedRestore).not.toBe(null);

    await act(async () => {
      latestNavigation?.handleNavigate("skills");
    });
    await flushEffects();

    expect(latestNavigation?.currentPage).toBe("skills");
    expect(window.sessionStorage.getItem(NAVIGATION_RESTORE_STORAGE_KEY)).toBe(
      null,
    );
  });

  it("同页同参数重复跳转时不应再次更新导航状态", async () => {
    await renderProbe();

    await act(async () => {
      latestNavigation?.handleNavigate("agent-app-lab", { source: "fixture" });
    });
    await flushEffects();

    const readyCallsAfterFirstNavigation = readyCallCount;

    await act(async () => {
      latestNavigation?.handleNavigate("agent-app-lab", { source: "fixture" });
    });
    await flushEffects();

    expect(readyCallCount).toBe(readyCallsAfterFirstNavigation);
    expect(latestNavigation?.currentPage).toBe("agent-app-lab");
    expect(latestNavigation?.pageParams).toEqual({
      source: "fixture",
    });
  });

  it("同一轮连续导航时应以最后一次请求为准", async () => {
    await renderProbe();

    await act(async () => {
      latestNavigation?.handleNavigate("automation");
      latestNavigation?.handleNavigate("agent-app-lab", { source: "fixture" });
    });
    await flushEffects();

    expect(latestNavigation?.currentPage).toBe("agent-app-lab");
    expect(latestNavigation?.requestedPage).toBe("agent-app-lab");
    expect(latestNavigation?.pageParams).toEqual({
      source: "fixture",
    });
    expect(latestNavigation?.requestedPageParams).toEqual({
      source: "fixture",
    });
    expect(latestNavigation?.navigationRequestId).toBe(2);
    expect(latestNavigation?.isNavigating).toBe(false);
  });
});
