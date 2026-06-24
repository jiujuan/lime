import { describe, expect, it } from "vitest";
import {
  buildBrowserAssistControlSessionRef,
  resolveBrowserAssistActionPolicy,
  resolveBrowserAssistNavigationControlPlan,
  resolveBrowserAssistObservationControlPlan,
} from "./workspaceBrowserAssistControl";

describe("workspaceBrowserAssistControl", () => {
  it("CDP BrowserSessionRef 应通过 App Server current action 导航和观察", () => {
    const ref = buildBrowserAssistControlSessionRef({
      sessionId: "browser-session-1",
      profileKey: "general_browser_assist",
      targetId: "target-1",
      transportKind: "cdp_frames",
      url: "https://example.com/old",
      title: "Old Page",
    });

    expect(
      resolveBrowserAssistNavigationControlPlan(
        ref,
        " https://example.com/new ",
      ),
    ).toEqual({
      channel: "app_server_browser_session",
      action: "navigate",
      sessionId: "browser-session-1",
      args: {
        action: "goto",
        url: "https://example.com/new",
        timeout_ms: 20000,
      },
    });
    expect(resolveBrowserAssistObservationControlPlan(ref)).toEqual({
      channel: "app_server_browser_session",
      action: "read_page",
      sessionId: "browser-session-1",
    });
  });

  it("attached Chrome session 应通过 extension bridge 导航和观察", () => {
    const ref = buildBrowserAssistControlSessionRef({
      sessionId: "browser-session-2",
      profileKey: "attached-profile",
      targetId: "target-2",
      transportKind: "existing_session",
      url: "https://example.com/attached",
      title: "Attached Page",
    });

    expect(
      resolveBrowserAssistNavigationControlPlan(
        ref,
        "https://example.com/next",
      ),
    ).toEqual({
      channel: "extension_bridge",
      action: "navigate",
      profileKey: "attached-profile",
      args: {
        url: "https://example.com/next",
        wait_for_page_info: true,
      },
    });
    expect(resolveBrowserAssistObservationControlPlan(ref)).toEqual({
      channel: "extension_bridge",
      action: "read_page",
      profileKey: "attached-profile",
    });
  });

  it("embedded browser ref 不应伪造自动化控制计划", () => {
    const ref = buildBrowserAssistControlSessionRef({
      profileKey: "display-only-profile",
      url: "https://example.com/display",
      title: "Display Only",
    });

    expect(
      resolveBrowserAssistNavigationControlPlan(
        ref,
        "https://example.com/next",
      ),
    ).toBeNull();
    expect(resolveBrowserAssistObservationControlPlan(ref)).toBeNull();
  });

  it("当前只读浏览器动作可自动执行", () => {
    const ref = buildBrowserAssistControlSessionRef({
      sessionId: "browser-session-1",
      profileKey: "general_browser_assist",
      transportKind: "cdp_frames",
      url: "https://example.com/page",
    });

    expect(
      resolveBrowserAssistActionPolicy({
        sessionRef: ref,
        action: "read_console_messages",
      }),
    ).toEqual({
      action: "read_console_messages",
      mode: "auto",
      reason: "current_read",
    });
  });

  it("点击和输入类浏览器动作必须转 tool_confirmation", () => {
    const ref = buildBrowserAssistControlSessionRef({
      sessionId: "browser-session-1",
      profileKey: "general_browser_assist",
      transportKind: "cdp_frames",
      url: "https://checkout.example/cart",
    });

    const decision = resolveBrowserAssistActionPolicy({
      sessionRef: ref,
      action: "click",
      args: {
        selector: "#pay",
        url: "https://checkout.example/pay",
      },
      requestId: "browser-confirm-1",
    });

    expect(decision).toEqual({
      action: "click",
      mode: "requires_confirmation",
      reason: "browser_mutation",
      confirmationRequest: {
        requestId: "browser-confirm-1",
        actionType: "tool_confirmation",
        toolName: "browserSession/action/execute",
        arguments: {
          action: "click",
          sessionId: "browser-session-1",
          profileKey: "general_browser_assist",
          url: "https://checkout.example/pay",
          args: {
            selector: "#pay",
            url: "https://checkout.example/pay",
          },
          permission_facts: {
            risk_level: "medium",
            risk_reason: "browser",
            scope_kind: "url",
            scope_value: "https://checkout.example/pay",
          },
        },
      },
    });
  });

  it("脚本和未知浏览器动作应 fail closed 为高风险确认", () => {
    const ref = buildBrowserAssistControlSessionRef({
      sessionId: "browser-session-1",
      profileKey: "general_browser_assist",
      transportKind: "cdp_frames",
      url: "https://example.com/app",
    });

    expect(
      resolveBrowserAssistActionPolicy({
        sessionRef: ref,
        action: "javascript",
        args: { code: "document.querySelector('form')?.submit()" },
      }),
    ).toMatchObject({
      action: "javascript",
      mode: "requires_confirmation",
      reason: "browser_script",
      confirmationRequest: {
        actionType: "tool_confirmation",
        arguments: {
          permission_facts: {
            risk_level: "high",
            risk_reason: "browser",
            scope_kind: "url",
            scope_value: "https://example.com/app",
          },
        },
      },
    });

    expect(
      resolveBrowserAssistActionPolicy({
        sessionRef: ref,
        action: " custom-browser-action ",
        requestId: "browser-confirm-unknown",
      }),
    ).toMatchObject({
      action: "custom_browser_action",
      mode: "requires_confirmation",
      reason: "unknown_browser_action",
      confirmationRequest: {
        requestId: "browser-confirm-unknown",
        actionType: "tool_confirmation",
        arguments: {
          permission_facts: {
            risk_level: "high",
            risk_reason: "browser",
            scope_kind: "url",
            scope_value: "https://example.com/app",
          },
        },
      },
    });
  });
});
