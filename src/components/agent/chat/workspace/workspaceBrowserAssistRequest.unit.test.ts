import { describe, expect, it } from "vitest";
import { GENERAL_BROWSER_ASSIST_PROFILE_KEY } from "./agentChatWorkspaceHelpers";
import { resolveWorkspaceBrowserAssistRequest } from "./workspaceBrowserAssistRequest";

type Input = Parameters<typeof resolveWorkspaceBrowserAssistRequest>[0];

function resolve(overrides: Partial<Input> = {}) {
  return resolveWorkspaceBrowserAssistRequest({
    mappedTheme: "general",
    ...overrides,
  });
}

describe("resolveWorkspaceBrowserAssistRequest", () => {
  it("general 主题默认使用通用浏览器协助 profile 并自动启动", () => {
    expect(resolve()).toMatchObject({
      browserAssistRequestProfileKey: GENERAL_BROWSER_ASSIST_PROFILE_KEY,
      browserAssistRequestPreferredBackend: undefined,
      browserAssistRequestAutoLaunch: true,
      shouldPreferExistingSessionBridgeForClaw: false,
    });
  });

  it("已有 attached session 时应优先使用现有 session bridge", () => {
    expect(
      resolve({
        browserAssistSessionState: {
          profileKey: " attached-profile ",
          transportKind: "existing_session",
        },
      }),
    ).toMatchObject({
      browserAssistRequestProfileKey: "attached-profile",
      browserAssistRequestPreferredBackend: "lime_extension_bridge",
      browserAssistRequestAutoLaunch: false,
      shouldPreferExistingSessionBridgeForClaw: true,
    });
  });

  it("harness browser_assist 元数据应提供 preferred backend 与 auto launch", () => {
    expect(
      resolve({
        initialAutoSendRequestMetadata: {
          harness: {
            browser_assist: {
              preferred_backend: "cdp_direct",
              auto_launch: false,
            },
          },
        },
      }),
    ).toMatchObject({
      browserAssistRequestPreferredBackend: "cdp_direct",
      browserAssistRequestAutoLaunch: false,
      shouldPreferExistingSessionBridgeForClaw: true,
    });
  });

  it("站点技能启动参数应覆盖 harness 默认值", () => {
    expect(
      resolve({
        initialAutoSendRequestMetadata: {
          harness: {
            browser_assist: {
              preferred_backend: "cdp_direct",
              auto_launch: false,
            },
          },
        },
        initialSiteSkillLaunch: {
          adapterName: "site-adapter",
          profileKey: "site-profile",
          preferredBackend: "lime_extension_bridge",
          autoLaunch: true,
        },
      }),
    ).toMatchObject({
      browserAssistRequestProfileKey: "site-profile",
      browserAssistRequestPreferredBackend: "lime_extension_bridge",
      browserAssistRequestAutoLaunch: true,
      shouldPreferExistingSessionBridgeForClaw: true,
    });
  });

  it("非 general 主题不应生成 profile 或强制 existing-session 偏好", () => {
    expect(
      resolve({
        mappedTheme: "image",
        browserAssistSessionState: {
          profileKey: "attached-profile",
          transportKind: "existing_session",
        },
      }),
    ).toMatchObject({
      browserAssistRequestProfileKey: undefined,
      browserAssistRequestPreferredBackend: undefined,
      browserAssistRequestAutoLaunch: true,
      shouldPreferExistingSessionBridgeForClaw: false,
    });
  });
});
