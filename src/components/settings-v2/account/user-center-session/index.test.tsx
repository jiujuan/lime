import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

const { mockUseOemCloudAccess } = vi.hoisted(() => {
  return {
    mockUseOemCloudAccess: vi.fn(),
  };
});

vi.mock("@/hooks/useOemCloudAccess", () => ({
  useOemCloudAccess: () => mockUseOemCloudAccess(),
}));

import { UserCenterSessionSettings } from ".";

interface MountedPage {
  container: HTMLDivElement;
  root: Root;
}

const mounted: MountedPage[] = [];

function createAccessState(overrides: Record<string, unknown> = {}) {
  return {
    runtime: {
      baseUrl: "https://user.limeai.run",
      controlPlaneBaseUrl: "https://user.limeai.run/api",
      sceneBaseUrl: "https://user.limeai.run/scene-api",
      gatewayBaseUrl: "https://user.limeai.run/gateway-api",
      tenantId: "tenant-0001",
      sessionToken: null,
      hubProviderName: "Lime Hub",
      loginPath: "/login",
      desktopClientId: "desktop-client",
      desktopOauthRedirectUrl: "lime://oauth/callback",
      desktopOauthNextPath: "/welcome",
    },
    configuredTarget: {
      baseUrl: "https://user.limeai.run",
      tenantId: "tenant-0001",
    },
    hubProviderName: "Lime Hub",
    loginMode: "password",
    setLoginMode: vi.fn(),
    passwordForm: {
      identifier: "",
      password: "",
    },
    setPasswordForm: vi.fn(),
    emailCodeForm: {
      identifier: "",
      code: "",
      displayName: "",
      username: "",
    },
    setEmailCodeForm: vi.fn(),
    codeDelivery: null,
    session: null,
    bootstrap: null,
    initializing: false,
    refreshing: false,
    sendingCode: false,
    loggingIn: false,
    loggingOut: false,
    openingGoogleLogin: false,
    errorMessage: null,
    infoMessage: null,
    defaultProviderSummary: null,
    handleRefresh: vi.fn(),
    handleSendEmailCode: vi.fn(),
    handleEmailCodeLogin: vi.fn(),
    handlePasswordLogin: vi.fn(),
    handleGoogleLogin: vi.fn(),
    handleLogout: vi.fn(),
    openUserCenter: vi.fn(),
    ...overrides,
  };
}

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<UserCenterSessionSettings />);
  });

  const page = { container, root };
  mounted.push(page);
  return page;
}

function getBodyText() {
  return document.body.textContent ?? "";
}

async function hoverTip(ariaLabel: string) {
  const trigger = document.body.querySelector(
    `button[aria-label='${ariaLabel}']`,
  );
  expect(trigger).toBeInstanceOf(HTMLButtonElement);

  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await Promise.resolve();
  });

  return trigger as HTMLButtonElement;
}

async function leaveTip(trigger: HTMLButtonElement | null) {
  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    await Promise.resolve();
  });
}

function findButton(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );

  if (!button) {
    throw new Error(`未找到按钮: ${text}`);
  }
  return button as HTMLButtonElement;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await changeLimeLocale("en-US");
  mockUseOemCloudAccess.mockReturnValue(createAccessState());
});

afterEach(async () => {
  vi.clearAllMocks();

  while (mounted.length > 0) {
    const current = mounted.pop();
    if (!current) {
      break;
    }

    act(() => {
      current.root.unmount();
    });
    current.container.remove();
  }

  await changeLimeLocale("zh-CN");
});

describe("UserCenterSessionSettings", () => {
  it("未登录时应展示个人中心登录面板", () => {
    const { container } = renderPage();
    const text = container.textContent ?? "";

    expect(text).toContain("Account Profile");
    expect(text).toContain(
      "Review sign-in status, default service, and account sync results.",
    );
    expect(text).toContain("Status: Signed out");
    expect(text).toContain("Default service: Syncs after sign-in");
    expect(text).toContain("Sign in with Google");
    expect(text).toContain("Auto-sync after browser sign-in");
    expect(text).not.toContain("账户资料");
    expect(text).not.toContain("settings.userCenterSession");
  });

  it("点击 Google 一键登录时应调用 hook 的 handleGoogleLogin", async () => {
    const handleGoogleLogin = vi.fn();
    mockUseOemCloudAccess.mockReturnValue(
      createAccessState({
        handleGoogleLogin,
      }),
    );

    const { container } = renderPage();

    await act(async () => {
      findButton(container, "Sign in with Google").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(handleGoogleLogin).toHaveBeenCalledTimes(1);
  });

  it("展开备用登录方式后点击验证码模式切换时应调用 hook 的 setLoginMode", async () => {
    const setLoginMode = vi.fn();
    mockUseOemCloudAccess.mockReturnValue(
      createAccessState({
        setLoginMode,
      }),
    );

    const { container } = renderPage();

    await act(async () => {
      findButton(container, "Use email code / account password").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    await act(async () => {
      findButton(container, "Email code").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(setLoginMode).toHaveBeenCalledWith("email_code");
  });

  it("已登录时应展示会话摘要并允许退出", async () => {
    const handleLogout = vi.fn();
    const openUserCenter = vi.fn();
    mockUseOemCloudAccess.mockReturnValue(
      createAccessState({
        session: {
          tenant: { id: "tenant-0001" },
          user: {
            id: "user-001",
            email: "operator@example.com",
            displayName: "Demo Operator",
          },
          session: {
            id: "session-001",
            expiresAt: "2026-03-25T08:00:00.000Z",
          },
        },
        bootstrap: {
          serviceSkillCatalog: {
            items: [{ id: "skill-001" }, { id: "skill-002" }],
          },
          sceneCatalog: [{ id: "scene-001" }],
          features: {
            profileEditable: true,
          },
          gateway: {
            basePath: "/gateway-api",
          },
        },
        defaultProviderSummary: "Lime Hub primary service · gpt-5.2-pro",
        handleLogout,
        openUserCenter,
      }),
    );

    const { container } = renderPage();
    const text = container.textContent ?? "";
    const expectedExpiry = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(Date.parse("2026-03-25T08:00:00.000Z"));

    expect(text).toContain("Demo Operator");
    expect(text).toContain(expectedExpiry);
    expect(text).toContain("2 skills / 1 entries");
    expect(text).toContain("Status: Signed in");
    expect(text).toContain(
      "Default service: Lime Hub primary service · gpt-5.2-pro",
    );
    expect(text).toContain("Lime Hub primary service · gpt-5.2-pro");
    expect(text).toContain("Profile editing is unified in Account Center");
    expect(text).toContain("Edit profile in Account Center");
    expect(text).not.toContain("会话说明");
    expect(text).not.toContain("settings.userCenterSession");

    await act(async () => {
      findButton(container, "Edit profile in Account Center").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(openUserCenter).toHaveBeenCalledWith("");

    await act(async () => {
      findButton(container, "Sign out of this account").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(handleLogout).toHaveBeenCalledTimes(1);
  });

  it("应按当前 locale 格式化会话时间与能力数量", () => {
    mockUseOemCloudAccess.mockReturnValue(
      createAccessState({
        session: {
          tenant: { id: "tenant-0001" },
          user: {
            id: "user-001",
            email: "operator@example.com",
            displayName: "Demo Operator",
          },
          session: {
            id: "session-001",
            expiresAt: "2026-03-25T08:00:00.000Z",
          },
        },
        bootstrap: {
          serviceSkillCatalog: {
            items: Array.from({ length: 1000 }, (_, index) => ({
              id: `skill-${index}`,
            })),
          },
          sceneCatalog: Array.from({ length: 1234 }, (_, index) => ({
            id: `scene-${index}`,
          })),
          features: {
            profileEditable: true,
          },
        },
      }),
    );

    const { container } = renderPage();
    const expectedExpiry = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(Date.parse("2026-03-25T08:00:00.000Z"));
    const text = container.textContent ?? "";

    expect(text).toContain(expectedExpiry);
    expect(text).toContain("1,000 skills / 1,234 entries");
    expect(text).not.toContain("1000 skills / 1234 entries");
    expect(text).not.toContain("1,000 项技能 / 1,234 个入口");
  });

  it("应把账户总览和登录结果说明收进 tips", async () => {
    renderPage();

    expect(getBodyText()).not.toContain(
      "Nickname, avatar, email, and default service are maintained in Account Center",
    );

    const accountTip = await hoverTip("Account profile help");
    expect(getBodyText()).toContain(
      "Nickname, avatar, email, and default service are maintained in Account Center",
    );
    await leaveTip(accountTip);

    const loginTip = await hoverTip("Post sign-in auto-sync help");
    expect(getBodyText()).toContain(
      "Sync the default AI service, model catalog, and enabled capabilities.",
    );
    await leaveTip(loginTip);
  });
});
