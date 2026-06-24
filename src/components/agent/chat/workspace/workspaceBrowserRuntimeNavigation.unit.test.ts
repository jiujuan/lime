import { describe, expect, it } from "vitest";
import type { Artifact } from "@/lib/artifact/types";
import {
  resolveBrowserRuntimeNavigationFromBrowserAssist,
  resolveBrowserRuntimeNavigationFromSiteSkill,
} from "./workspaceBrowserRuntimeNavigation";

function artifact(meta: Artifact["meta"]): Artifact {
  return {
    id: "artifact-1",
    type: "browser_assist",
    title: "Browser Assist",
    content: "",
    status: "complete",
    meta,
    position: { start: 0, end: 0 },
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("workspaceBrowserRuntimeNavigation", () => {
  it("Browser Assist 导航应优先使用 artifact meta", () => {
    expect(
      resolveBrowserRuntimeNavigationFromBrowserAssist({
        artifact: artifact({
          profile_key: "profile-from-artifact",
          session_id: "session-from-artifact",
          target_id: "target-from-artifact",
        }),
        browserAssistSessionState: {
          profileKey: "profile-from-session",
          sessionId: "session-from-session",
          targetId: "target-from-session",
        },
        projectId: "project-1",
        contentId: "content-1",
        generalBrowserAssistProfileKey: "default-profile",
      }),
    ).toEqual({
      projectId: "project-1",
      contentId: "content-1",
      initialProfileKey: "profile-from-artifact",
      initialSessionId: "session-from-artifact",
      initialTargetId: "target-from-artifact",
    });
  });

  it("Browser Assist 导航没有 artifact meta 时应回退到 session state 和默认 profile", () => {
    expect(
      resolveBrowserRuntimeNavigationFromBrowserAssist({
        browserAssistSessionState: {
          sessionId: "session-from-state",
        },
        generalBrowserAssistProfileKey: "default-profile",
      }),
    ).toEqual({
      projectId: undefined,
      contentId: undefined,
      initialProfileKey: "default-profile",
      initialSessionId: "session-from-state",
      initialTargetId: undefined,
    });
  });

  it("Browser Assist 导航没有 artifact meta 时应优先使用 BrowserSessionRef", () => {
    expect(
      resolveBrowserRuntimeNavigationFromBrowserAssist({
        browserSessionRef: {
          browserSessionId: "session-from-ref",
          profileKey: "profile-from-ref",
        },
        browserAssistSessionState: {
          profileKey: "profile-from-state",
          sessionId: "session-from-state",
        },
        generalBrowserAssistProfileKey: "default-profile",
      }),
    ).toEqual({
      projectId: undefined,
      contentId: undefined,
      initialProfileKey: "profile-from-ref",
      initialSessionId: "session-from-ref",
      initialTargetId: undefined,
    });
  });

  it("Browser Assist 导航仍应让 artifact meta 覆盖 BrowserSessionRef", () => {
    expect(
      resolveBrowserRuntimeNavigationFromBrowserAssist({
        artifact: artifact({
          profile_key: "profile-from-artifact",
          session_id: "session-from-artifact",
          target_id: "target-from-artifact",
        }),
        browserSessionRef: {
          browserSessionId: "session-from-ref",
          profileKey: "profile-from-ref",
        },
        generalBrowserAssistProfileKey: "default-profile",
      }),
    ).toEqual({
      projectId: undefined,
      contentId: undefined,
      initialProfileKey: "profile-from-artifact",
      initialSessionId: "session-from-artifact",
      initialTargetId: "target-from-artifact",
    });
  });

  it("站点技能导航应优先使用执行态 profile / target 并保留启动参数", () => {
    expect(
      resolveBrowserRuntimeNavigationFromSiteSkill({
        projectId: "project-1",
        contentId: "content-1",
        initialSiteSkillLaunch: {
          adapterName: "zhihu",
          profileKey: "launch-profile",
          targetId: "launch-target",
          args: { url: "https://example.com" },
          saveTitle: "保存标题",
        },
        siteSkillExecutionState: {
          profileKey: "runtime-profile",
          targetId: "runtime-target",
        },
      }),
    ).toEqual({
      projectId: "project-1",
      contentId: "content-1",
      initialProfileKey: "runtime-profile",
      initialTargetId: "runtime-target",
      initialAdapterName: "zhihu",
      initialArgs: { url: "https://example.com" },
      initialAutoRun: false,
      initialRequireAttachedSession: true,
      initialSaveTitle: "保存标题",
    });
  });
});
