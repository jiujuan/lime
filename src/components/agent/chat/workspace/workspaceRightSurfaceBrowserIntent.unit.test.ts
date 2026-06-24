import { describe, expect, it } from "vitest";
import type { WorkspaceRightSurfacePendingRequest } from "@/lib/api/workspaceRightSurface";
import { buildWorkspaceRightSurfacePendingBrowserIntent } from "./workspaceRightSurfaceBrowserIntent";

const basePending: WorkspaceRightSurfacePendingRequest = {
  requestId: "right_surface_browser_1",
  surfaceKind: "browser",
  origin: "runtime",
  priority: "foreground",
  status: "pending",
  requestedAt: "2026-06-24T00:00:00.000Z",
};

describe("workspaceRightSurfaceBrowserIntent", () => {
  it("应从 browser pending metadata 中解析可见浏览器 intent", () => {
    expect(
      buildWorkspaceRightSurfacePendingBrowserIntent([
        {
          ...basePending,
          reason: "browser_requirement",
          metadata: {
            browser: {
              launch_url: "https://example.com/editor",
              page_title: "Example Editor",
              browser_session_id: "browser-session-1",
              profile_key: "task-profile",
              target_id: "target-1",
              lifecycle_state: "human_controlling",
              control_mode: "human",
            },
          },
        },
      ]),
    ).toEqual({
      source: "rightSurfacePending",
      sourceRequestId: "right_surface_browser_1",
      origin: "runtime",
      reason: "browser_requirement",
      priority: "foreground",
      browserSessionId: "browser-session-1",
      launchUrl: "https://example.com/editor",
      title: "Example Editor",
      profileKey: "task-profile",
      targetId: "target-1",
      lifecycleState: "human_controlling",
      controlMode: "human",
      sessionRef: {
        sourceRequestId: "right_surface_browser_1",
        browserSessionId: "browser-session-1",
        profileKey: "task-profile",
        adapterKind: "cdp",
        launchUrl: "https://example.com/editor",
        title: "Example Editor",
      },
    });
  });

  it("只在 candidateId 像可导航目标时才作为 launchUrl fallback", () => {
    expect(
      buildWorkspaceRightSurfacePendingBrowserIntent([
        {
          ...basePending,
          requestId: "right_surface_browser_2",
          priority: "normal",
          candidateId: "example.com/path",
          metadata: {
            title: "Candidate URL",
          },
        },
      ]),
    ).toMatchObject({
      sourceRequestId: "right_surface_browser_2",
      priority: "background",
      launchUrl: "example.com/path",
      title: "Candidate URL",
    });

    expect(
      buildWorkspaceRightSurfacePendingBrowserIntent([
        {
          ...basePending,
          candidateId: "browser-session-id",
          metadata: {
            title: "Session Only",
          },
        },
      ]),
    ).toMatchObject({
      launchUrl: null,
      title: "Session Only",
    });
  });

  it("应从 harness.browser_assist metadata 生成 session ref", () => {
    expect(
      buildWorkspaceRightSurfacePendingBrowserIntent([
        {
          ...basePending,
          requestId: "right_surface_browser_4",
          metadata: {
            harness: {
              browser_assist: {
                session_id: "browser-session-4",
                profile_key: "general_browser_assist",
                launch_url: "https://example.com/assist",
                page_title: "Browser Assist Page",
                preferred_backend: "cdp_direct",
                lifecycle_state: "waiting_for_human",
                control_mode: "shared",
              },
            },
          },
        },
      ]),
    ).toMatchObject({
      sourceRequestId: "right_surface_browser_4",
      browserSessionId: "browser-session-4",
      launchUrl: "https://example.com/assist",
      title: "Browser Assist Page",
      profileKey: "general_browser_assist",
      lifecycleState: "waiting_for_human",
      controlMode: "shared",
      sessionRef: {
        sourceRequestId: "right_surface_browser_4",
        browserSessionId: "browser-session-4",
        profileKey: "general_browser_assist",
        adapterKind: "cdp",
        launchUrl: "https://example.com/assist",
        title: "Browser Assist Page",
      },
    });
  });

  it("非 pending browser 请求不生成 intent", () => {
    expect(
      buildWorkspaceRightSurfacePendingBrowserIntent([
        {
          ...basePending,
          surfaceKind: "files",
        },
        {
          ...basePending,
          status: "consumed",
        },
      ]),
    ).toBeNull();
  });
});
