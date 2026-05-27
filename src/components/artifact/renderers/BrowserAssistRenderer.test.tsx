import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { Artifact } from "@/lib/artifact/types";
import { BrowserAssistRenderer } from "./BrowserAssistRenderer";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function createArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: overrides.id ?? "browser-assist:general",
    type: "browser_assist",
    title: overrides.title ?? "浏览器协助",
    content: overrides.content ?? "",
    status: overrides.status ?? "complete",
    meta: {
      browserAssistScopeKey: "project:session",
      ...(overrides.meta || {}),
    },
    position: overrides.position ?? { start: 0, end: 0 },
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    error: overrides.error,
  };
}

async function renderArtifact(artifact: Artifact) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });

  await act(async () => {
    root.render(<BrowserAssistRenderer artifact={artifact} />);
  });

  await act(async () => {
    await Promise.resolve();
  });

  return container;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await changeLimeLocale("zh-CN");
});

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
  await changeLimeLocale("zh-CN");
});

describe("BrowserAssistRenderer", () => {
  it("pending Artifact 应展示启动提示", async () => {
    const container = await renderArtifact(
      createArtifact({
        status: "pending",
        meta: {
          profileKey: "general_browser_assist",
          url: "https://example.com",
          launchState: "launching",
        },
      }),
    );

    expect(container.textContent).toContain("正在连接浏览器协助");
    expect(container.textContent).toContain("正在连接已附着的 Chrome / CDP 会话");
    expect(container.textContent).toContain("https://example.com");
  });

  it("应通过 workspace namespace 渲染英文浏览器协助 chrome", async () => {
    await changeLimeLocale("en-US");

    const launching = await renderArtifact(
      createArtifact({
        status: "pending",
        meta: {
          profileKey: "general_browser_assist",
          url: "https://example.com",
          launchState: "launching",
        },
      }),
    );

    expect(launching.textContent).toContain("Connecting browser assist");
    expect(launching.textContent).toContain(
      "Connecting an attached Chrome / CDP session",
    );
    expect(launching.textContent).not.toContain("正在连接浏览器协助");

    const replay = await renderArtifact(
      createArtifact({
        meta: {
          browserActionIndex: {
            actionCount: 1,
            sessionCount: 1,
            observationCount: 1,
            screenshotCount: 1,
            items: [
              {
                action: "navigate",
                status: "completed",
                screenshotAvailable: true,
              },
            ],
          },
        },
      }),
    );

    expect(replay.textContent).toContain("Browser Assist replay");
    expect(replay.textContent).toContain("Browser actions");
    expect(replay.textContent).toContain("Recent browser actions");
    expect(replay.textContent).toContain("Screenshot");
    expect(replay.textContent).not.toContain("Browser Assist 复盘");

    const migrated = await renderArtifact(
      createArtifact({
        status: "complete",
        meta: {
          profileKey: "general_browser_assist",
          sessionId: "session-1",
        },
      }),
    );

    expect(migrated.textContent).toContain(
      "Browser assist has moved to Browser Workspace",
    );
    expect(migrated.textContent).toContain(
      "Session session-1 is ready for Browser Workspace takeover.",
    );
    expect(migrated.textContent).not.toContain(
      "浏览器协助已迁移到浏览器工作台",
    );
  });

  it("完整会话 Artifact 也不应再在 Claw 画布内渲染浏览器工作区", async () => {
    const container = await renderArtifact(
      createArtifact({
        status: "complete",
        meta: {
          profileKey: "general_browser_assist",
          sessionId: "session-1",
          targetId: "target-1",
        },
      }),
    );

    expect(container.textContent).toContain("浏览器协助已迁移到浏览器工作台");
    expect(container.textContent).toContain("session-1");
    expect(
      container.querySelector('[data-testid="browser-runtime-workspace"]'),
    ).toBeNull();
  });

  it("带 browserActionIndex 的 Artifact 应展示 Browser Assist 复盘", async () => {
    const container = await renderArtifact(
      createArtifact({
        meta: {
          browserActionIndex: {
            actionCount: 2,
            sessionCount: 1,
            observationCount: 1,
            screenshotCount: 1,
            lastUrl: "https://example.com/",
            sessionIds: ["browser-session-1"],
            targetIds: ["target-1"],
            profileKeys: ["general_browser_assist"],
            items: [
              {
                artifactKind: "browser_session",
                action: "navigate",
                status: "completed",
                success: true,
                sessionId: "browser-session-1",
                targetId: "target-1",
                backend: "cdp_direct",
                lastUrl: "https://example.com/",
              },
              {
                artifactKind: "browser_snapshot",
                action: "get_page_info",
                status: "completed",
                success: true,
                sessionId: "browser-session-1",
                targetId: "target-1",
                entrySource: "at_browser_agent_command",
                backend: "lime_extension_bridge",
                lastUrl: "https://example.com/",
                observationAvailable: true,
                screenshotAvailable: true,
              },
            ],
          },
        },
      }),
    );

    expect(container.textContent).toContain("browser_replay_viewer");
    expect(container.textContent).toContain("Browser Assist 复盘");
    expect(container.textContent).toContain("get_page_info");
    expect(container.textContent).toContain("browser_snapshot");
    expect(container.textContent).toContain("https://example.com/");
    expect(container.textContent).toContain("观察 / 截图");
  });
});
