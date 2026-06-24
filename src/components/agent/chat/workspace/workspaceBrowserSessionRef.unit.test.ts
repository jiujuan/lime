import { describe, expect, it } from "vitest";
import { extractBrowserAssistSessionFromToolCall } from "../utils/browserAssistSession";
import {
  buildBrowserSessionRef,
  buildBrowserSessionRefFromBrowserAssistMetadata,
  buildBrowserSessionRefFromBrowserAssistSessionState,
  buildBrowserSessionRefFromCdpState,
} from "./workspaceBrowserSessionRef";

describe("workspaceBrowserSessionRef", () => {
  it("应从 Right Surface browser intent 字段生成最小 session ref", () => {
    expect(
      buildBrowserSessionRef({
        sourceRequestId: " right_surface_browser_1 ",
        browserSessionId: " browser-session-1 ",
        profileKey: " task-profile ",
        launchUrl: " https://example.com/editor ",
        title: " Example Editor ",
      }),
    ).toEqual({
      sourceRequestId: "right_surface_browser_1",
      browserSessionId: "browser-session-1",
      profileKey: "task-profile",
      adapterKind: "cdp",
      launchUrl: "https://example.com/editor",
      title: "Example Editor",
    });
  });

  it("只有 launchUrl 时默认映射为 embedded browser ref", () => {
    expect(
      buildBrowserSessionRef({
        sourceRequestId: "right_surface_browser_2",
        launchUrl: "https://example.com/dashboard",
      }),
    ).toEqual({
      sourceRequestId: "right_surface_browser_2",
      browserSessionId: null,
      profileKey: null,
      adapterKind: "embedded",
      launchUrl: "https://example.com/dashboard",
      title: null,
    });
  });

  it("应从 CDP browserSession state 生成 session ref", () => {
    expect(
      buildBrowserSessionRefFromCdpState(
        {
          sessionId: "browser-session-3",
          profileKey: "smoke-profile",
          targetId: "target-1",
          targetTitle: "Fallback Title",
          targetUrl: "https://fallback.example.com",
          lastPageInfo: {
            title: "Runtime Page",
            url: "https://example.com/runtime",
          },
        },
        { sourceRequestId: "right_surface_browser_3" },
      ),
    ).toEqual({
      sourceRequestId: "right_surface_browser_3",
      browserSessionId: "browser-session-3",
      profileKey: "smoke-profile",
      adapterKind: "cdp",
      launchUrl: "https://example.com/runtime",
      title: "Runtime Page",
    });
  });

  it("应从 Browser Assist harness metadata 生成 session ref", () => {
    expect(
      buildBrowserSessionRefFromBrowserAssistMetadata(
        {
          harness: {
            browser_assist: {
              session_id: " browser-session-4 ",
              profile_key: " general_browser_assist ",
              launch_url: " https://example.com/assist ",
              page_title: " Browser Assist Page ",
              target_id: " target-4 ",
              preferred_backend: "cdp_direct",
            },
          },
        },
        { sourceRequestId: "right_surface_browser_4" },
      ),
    ).toEqual({
      sourceRequestId: "right_surface_browser_4",
      browserSessionId: "browser-session-4",
      profileKey: "general_browser_assist",
      adapterKind: "cdp",
      launchUrl: "https://example.com/assist",
      title: "Browser Assist Page",
    });
  });

  it("应兼容 Browser Assist camelCase metadata", () => {
    expect(
      buildBrowserSessionRefFromBrowserAssistMetadata({
        browserAssist: {
          sessionId: "browser-session-5",
          profileKey: "attached-profile",
          targetUrl: "https://example.com/camel",
          targetTitle: "Camel Page",
          targetId: "target-5",
        },
      }),
    ).toEqual({
      sourceRequestId: null,
      browserSessionId: "browser-session-5",
      profileKey: "attached-profile",
      adapterKind: "cdp",
      launchUrl: "https://example.com/camel",
      title: "Camel Page",
    });
  });

  it("Browser Assist 显式未知 adapter 时不应推断为 cdp", () => {
    expect(
      buildBrowserSessionRefFromBrowserAssistMetadata({
        browserAssist: {
          sessionId: "browser-session-6",
          profileKey: "extension-profile",
          adapterKind: "extension_bridge",
        },
      }),
    ).toEqual({
      sourceRequestId: null,
      browserSessionId: "browser-session-6",
      profileKey: "extension-profile",
      adapterKind: "unknown",
      launchUrl: null,
      title: null,
    });
  });

  it("应从 Browser Assist runtime state 生成 current session ref", () => {
    expect(
      buildBrowserSessionRefFromBrowserAssistSessionState(
        {
          sessionId: "browser-session-7",
          profileKey: "general_browser_assist",
          url: "https://example.com/runtime-state",
          title: "Runtime State Page",
          targetId: "target-7",
          transportKind: "cdp_frames",
        },
        { sourceRequestId: "browser-assist:active::project-a" },
      ),
    ).toEqual({
      sourceRequestId: "browser-assist:active::project-a",
      browserSessionId: "browser-session-7",
      profileKey: "general_browser_assist",
      adapterKind: "cdp",
      launchUrl: "https://example.com/runtime-state",
      title: "Runtime State Page",
    });
  });

  it("Browser Assist existing_session 不应被 targetId 误判为 cdp", () => {
    expect(
      buildBrowserSessionRefFromBrowserAssistSessionState({
        sessionId: "browser-session-8",
        profileKey: "attached-profile",
        url: "https://example.com/attached",
        title: "Attached Page",
        targetId: "target-8",
        transportKind: "existing_session",
      }),
    ).toEqual({
      sourceRequestId: null,
      browserSessionId: "browser-session-8",
      profileKey: "attached-profile",
      adapterKind: "unknown",
      launchUrl: "https://example.com/attached",
      title: "Attached Page",
    });
  });

  it("应把 mcp__lime-browser__* 工具结果投影为 current BrowserSessionRef", () => {
    const sessionState = extractBrowserAssistSessionFromToolCall({
      id: "tool-browser-navigate-1",
      name: "mcp__lime-browser__browser_navigate",
      arguments: JSON.stringify({
        profile_key: "general_browser_assist",
        url: "https://example.com/from-tool",
      }),
      status: "completed",
      startTime: new Date("2026-06-24T00:00:01.000Z"),
      endTime: new Date("2026-06-24T00:00:02.000Z"),
      result: {
        success: true,
        output: "ok",
        metadata: {
          tool_family: "browser",
          result: {
            browser_session: {
              session_id: "browser-session-tool",
              target_id: "target-tool",
              transport_kind: "cdp_frames",
              lifecycle_state: "live",
            },
            page_info: {
              title: "Tool Page",
              url: "https://example.com/from-tool",
            },
          },
        },
      },
    });

    expect(
      buildBrowserSessionRefFromBrowserAssistSessionState(sessionState, {
        sourceRequestId: "tool-browser-navigate-1",
      }),
    ).toEqual({
      sourceRequestId: "tool-browser-navigate-1",
      browserSessionId: "browser-session-tool",
      profileKey: "general_browser_assist",
      adapterKind: "cdp",
      launchUrl: "https://example.com/from-tool",
      title: "Tool Page",
    });
  });

  it("缺少 Browser Assist session 线索时不生成 ref", () => {
    expect(
      buildBrowserSessionRefFromBrowserAssistMetadata({
        harness: {
          browser_assist: {
            enabled: true,
            stream_mode: "both",
          },
        },
      }),
    ).toBeNull();
  });
});
