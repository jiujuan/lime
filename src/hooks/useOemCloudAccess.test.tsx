import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { setStoredOemCloudSessionState } from "@/lib/oemCloudSession";
import { OEM_CLOUD_PAYMENT_RETURN_EVENT } from "@/lib/oemCloudPaymentReturn";
import {
  controlPlaneMocks,
  createDeferred,
  createOpenedWindow,
  desktopAuthMocks,
  flushEffects,
  latestState,
  mountHookHarness,
  shellOpenMock,
  systemBrowserMocks,
  desktopRuntimeMocks,
  useOemCloudAccessTestLifecycle,
} from "./useOemCloudAccess.testFixtures";

function createBootstrapPayload() {
  return {
    session: {
      tenant: {
        id: "tenant-0001",
        name: "JustAI Demo",
      },
      user: {
        id: "user-001",
        email: "operator@example.com",
        displayName: "Demo Operator",
      },
      session: {
        id: "session-001",
        tenantId: "tenant-0001",
        userId: "user-001",
        expiresAt: "2026-03-25T08:00:00.000Z",
      },
    },
    providerOffersSummary: [],
    providerPreference: null,
    serviceSkillCatalog: {
      items: [],
    },
    sceneCatalog: [],
    gateway: {
      basePath: "/gateway-api",
    },
  };
}

function restoreStoredSession() {
  setStoredOemCloudSessionState({
    token: "session-token-restore",
    tenant: {
      id: "tenant-0001",
    },
    user: {
      id: "user-001",
    },
    session: {
      id: "session-001",
    },
  });
}

describe("useOemCloudAccess", () => {
  useOemCloudAccessTestLifecycle();

  it("恢复本地会话时不应因重复 effect 触发而卡在初始化中", async () => {
    const bootstrapPayload = createBootstrapPayload();
    const bootstrapDeferred = createDeferred<typeof bootstrapPayload>();
    controlPlaneMocks.getClientBootstrap.mockImplementation(
      () => bootstrapDeferred.promise,
    );
    restoreStoredSession();

    mountHookHarness();
    await flushEffects();

    expect(controlPlaneMocks.getClientBootstrap).toHaveBeenCalledTimes(1);
    expect(latestState?.initializing).toBe(true);

    await act(async () => {
      bootstrapDeferred.resolve(bootstrapPayload);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latestState?.initializing).toBe(false);
    expect(latestState?.session?.session.id).toBe("session-001");
    expect(latestState?.session?.token).toBe("session-token-restore");
  });

  it("客户端不再创建购买订单，API Key 明文只临时保存", async () => {
    const accessToken = {
      id: "token-001",
      tenantId: "tenant-0001",
      userId: "user-001",
      name: "Desktop Key",
      tokenMasked: "sk-lime-***abcd",
      scopes: ["llm:invoke"],
      allowedModels: [],
      status: "active",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z",
      expiresAt: "2026-05-27T00:00:00.000Z",
    };
    controlPlaneMocks.getClientBootstrap.mockResolvedValue(
      createBootstrapPayload(),
    );
    controlPlaneMocks.createClientAccessToken.mockResolvedValue({
      token: accessToken,
      apiKey: "sk-lime-once",
    });
    restoreStoredSession();

    mountHookHarness();
    await flushEffects();

    expect("handlePurchasePlan" in (latestState ?? {})).toBe(false);
    expect("handleTopupCredits" in (latestState ?? {})).toBe(false);
    expect(controlPlaneMocks.createClientOrder).not.toHaveBeenCalled();
    expect(
      controlPlaneMocks.createClientCreditTopupOrder,
    ).not.toHaveBeenCalled();

    await act(async () => {
      await latestState?.handleCreateAccessToken({
        name: "Desktop Key",
      });
    });

    expect(controlPlaneMocks.createClientAccessToken).toHaveBeenCalledWith(
      "tenant-0001",
      {
        name: "Desktop Key",
        scopes: ["llm:invoke"],
        allowedModels: undefined,
        maxTokensPerRequest: undefined,
        requestsPerMinute: undefined,
        tokensPerMinute: undefined,
        monthlyCreditLimit: undefined,
      },
    );
    expect(latestState?.lastIssuedRawToken).toBe("sk-lime-once");
    expect(latestState?.infoMessage).toContain(
      "Lime API Key created. The secret is shown only once on this page.",
    );

    act(() => {
      latestState?.handleDismissIssuedToken();
    });
    expect(latestState?.lastIssuedRawToken).toBeNull();
  });

  it("发送邮箱验证码提示应来自 i18n 并保留服务端脱敏邮箱", async () => {
    controlPlaneMocks.sendClientAuthEmailCode.mockResolvedValue({
      maskedEmail: "op***@example.com",
      expiresInSeconds: 600,
    });

    mountHookHarness();
    await flushEffects();

    act(() => {
      latestState?.setEmailCodeForm({
        identifier: "operator@example.com",
        code: "",
        displayName: "",
        username: "",
      });
    });

    await act(async () => {
      await latestState?.handleSendEmailCode();
    });

    expect(controlPlaneMocks.sendClientAuthEmailCode).toHaveBeenCalledWith(
      "tenant-0001",
      {
        identifier: "operator@example.com",
      },
    );
    expect(latestState?.infoMessage).toContain(
      "Verification code sent to op***@example.com. It is valid for about 10 minutes.",
    );
  });

  it("支付回跳事件应刷新云端权益并接回订单 watcher", async () => {
    controlPlaneMocks.getClientBootstrap.mockResolvedValue(
      createBootstrapPayload(),
    );
    restoreStoredSession();

    mountHookHarness();
    await flushEffects();
    controlPlaneMocks.getClientBootstrap.mockClear();
    controlPlaneMocks.getClientCloudActivation.mockClear();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(OEM_CLOUD_PAYMENT_RETURN_EVENT, {
          detail: {
            tenantId: "tenant-0001",
            orderId: "order-001",
            kind: "plan_order",
            status: "success",
            sourceUrl:
              "lime://payment/return?tenantId=tenant-0001&orderId=order-001&kind=plan_order&status=success",
            receivedAt: Date.now(),
          },
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(controlPlaneMocks.getClientBootstrap).toHaveBeenCalledWith(
      "tenant-0001",
    );
    expect(controlPlaneMocks.getClientCloudActivation).toHaveBeenCalledWith(
      "tenant-0001",
    );
    expect(latestState?.paymentWatcher).toMatchObject({
      kind: "plan_order",
      orderId: "order-001",
      status: "waiting",
    });
    expect(latestState?.infoMessage).toContain(
      "Back in Lime. Syncing payment status, entitlements, and ledger.",
    );
  });

  it("Google 桌面登录应创建 desktop auth session、打开服务端授权页并轮询落地会话", async () => {
    controlPlaneMocks.createClientDesktopAuthSession.mockResolvedValue({
      authSessionId: "desktop-auth-001",
      deviceCode: "device-code-001",
      tenantId: "tenant-0001",
      clientId: "desktop-client",
      clientName: "Lime Desktop",
      provider: "google",
      desktopRedirectUri: "lime://oauth/callback",
      status: "pending_login",
      expiresInSeconds: 600,
      pollIntervalSeconds: 1,
      authorizeUrl:
        "https://user.limeai.run/oauth/desktop/device-code-001/signin",
    });
    controlPlaneMocks.pollClientDesktopAuthSession.mockResolvedValue({
      deviceCode: "device-code-001",
      tenantId: "tenant-0001",
      clientId: "desktop-client",
      clientName: "Lime Desktop",
      provider: "google",
      desktopRedirectUri: "lime://oauth/callback",
      status: "approved",
      expiresInSeconds: 590,
      pollIntervalSeconds: 1,
      sessionToken: "desktop-session-token",
      sessionExpiresAt: "2026-05-27T00:00:00.000Z",
    });
    desktopAuthMocks.completeOemCloudDesktopOAuthLogin.mockImplementation(
      async () => {
        setStoredOemCloudSessionState({
          token: "desktop-session-token",
          tenant: {
            id: "tenant-0001",
            slug: "tenant-0001",
          },
          user: {
            id: "user-001",
          },
          session: {
            id: "desktop-session-001",
            tenantId: "tenant-0001",
            userId: "user-001",
          },
        });
        return {};
      },
    );

    mountHookHarness();
    await flushEffects();

    await act(async () => {
      await latestState?.handleGoogleLogin();
    });

    expect(
      systemBrowserMocks.startOemCloudOAuthCallbackBridge,
    ).toHaveBeenCalledTimes(1);
    expect(
      controlPlaneMocks.createClientDesktopAuthSession,
    ).toHaveBeenCalledWith("tenant-0001", {
      clientId: "desktop-client",
      provider: "google",
      desktopRedirectUri: "http://127.0.0.1:18081/oauth/callback",
    });
    expect(
      systemBrowserMocks.openExternalUrlWithSystemBrowser,
    ).toHaveBeenCalledWith(
      "https://user.limeai.run/oauth/desktop/device-code-001/signin",
    );
    expect(
      controlPlaneMocks.createClientDesktopAuthSession,
    ).toHaveBeenCalledWith("tenant-0001", {
      clientId: "desktop-client",
      provider: "google",
      desktopRedirectUri: "http://127.0.0.1:18081/oauth/callback",
    });
    expect(shellOpenMock).not.toHaveBeenCalled();
    expect(controlPlaneMocks.pollClientDesktopAuthSession).toHaveBeenCalledWith(
      "device-code-001",
    );
    expect(
      desktopAuthMocks.completeOemCloudDesktopOAuthLogin,
    ).toHaveBeenCalledWith({
      tenantId: "tenant-0001",
      token: "desktop-session-token",
      nextPath: "/welcome",
      error: null,
    });
    expect(latestState?.infoMessage).toContain(
      "Google sign-in succeeded and the cloud catalog is synced.",
    );
  });

  it("Google 桌面登录打开系统浏览器失败时不应提示已打开", async () => {
    controlPlaneMocks.createClientDesktopAuthSession.mockResolvedValue({
      authSessionId: "desktop-auth-001",
      deviceCode: "device-code-001",
      tenantId: "tenant-0001",
      clientId: "desktop-client",
      clientName: "Lime Desktop",
      provider: "google",
      desktopRedirectUri: "lime://oauth/callback",
      status: "pending_login",
      expiresInSeconds: 600,
      pollIntervalSeconds: 1,
      authorizeUrl:
        "https://user.limeai.run/oauth/desktop/device-code-001/signin",
    });
    systemBrowserMocks.openExternalUrlWithSystemBrowser.mockRejectedValue(
      new Error("permission denied"),
    );
    shellOpenMock.mockRejectedValue(new Error("permission denied"));

    mountHookHarness();
    await flushEffects();

    await act(async () => {
      await latestState?.handleGoogleLogin();
    });

    expect(
      systemBrowserMocks.openExternalUrlWithSystemBrowser,
    ).toHaveBeenCalledWith(
      "https://user.limeai.run/oauth/desktop/device-code-001/signin",
    );
    expect(latestState?.errorMessage).toContain(
      "Failed to open the system browser: permission denied",
    );
    expect(latestState?.infoMessage).toBeNull();
    expect(
      controlPlaneMocks.pollClientDesktopAuthSession,
    ).not.toHaveBeenCalled();
  });

  it("桌面登录会话不可用时应打开带租户和回跳的用户中心登录页", async () => {
    controlPlaneMocks.createClientDesktopAuthSession.mockRejectedValue(
      new Error("tenant not found"),
    );

    mountHookHarness();
    await flushEffects();

    await act(async () => {
      await latestState?.handleGoogleLogin();
    });

    expect(
      systemBrowserMocks.openExternalUrlWithSystemBrowser,
    ).toHaveBeenCalledTimes(1);
    const openedUrl = systemBrowserMocks.openExternalUrlWithSystemBrowser.mock
      .calls[0]?.[0] as string;
    const parsedUrl = new URL(openedUrl);

    expect(parsedUrl.origin).toBe("https://user.limeai.run");
    expect(parsedUrl.pathname).toBe("/login");
    expect(parsedUrl.searchParams.get("tenant")).toBe("tenant-0001");
    expect(parsedUrl.searchParams.get("tenantId")).toBe("tenant-0001");
    expect(parsedUrl.searchParams.get("redirectUrl")).toBe(
      "http://127.0.0.1:18081/oauth/callback",
    );
    expect(parsedUrl.searchParams.get("redirect")).toBe("/welcome");
    expect(latestState?.errorMessage).toBeNull();
    expect(latestState?.infoMessage).toContain(
      "The Lime cloud sign-in page is open. Complete authorization in the browser and the desktop app will sync the result automatically.",
    );
  });

  it("浏览器场景桌面登录不可用时应复用预打开空白页导航到用户中心登录页", async () => {
    desktopRuntimeMocks.hasDesktopHostInvokeCapability.mockReturnValue(false);
    desktopRuntimeMocks.hasDesktopHostRuntimeMarkers.mockReturnValue(false);
    controlPlaneMocks.createClientDesktopAuthSession.mockRejectedValue(
      new Error("desktop client not found"),
    );
    shellOpenMock.mockRejectedValue(new Error("not in desktop host"));
    const openedWindow = createOpenedWindow();
    const windowOpenSpy = vi
      .spyOn(window, "open")
      .mockReturnValueOnce(openedWindow);

    mountHookHarness();
    await flushEffects();

    try {
      await act(async () => {
        await latestState?.handleGoogleLogin();
      });

      expect(windowOpenSpy).toHaveBeenCalledWith("about:blank", "_blank");
      expect(openedWindow.document.title).toBe("Opening sign-in page...");
      expect(openedWindow.document.body.innerHTML).toBe(
        "Opening the sign-in page. Please wait...",
      );
      expect(openedWindow.location.assign).toHaveBeenCalledTimes(1);
      const openedUrl = (
        openedWindow.location.assign as ReturnType<typeof vi.fn>
      ).mock.calls[0]?.[0] as string;
      const parsedUrl = new URL(openedUrl);
      expect(parsedUrl.pathname).toBe("/login");
      expect(parsedUrl.searchParams.get("tenant")).toBe("tenant-0001");
      expect(openedWindow.close).not.toHaveBeenCalled();
      expect(latestState?.errorMessage).toBeNull();
    } finally {
      windowOpenSpy.mockRestore();
    }
  });

  it("Desktop Host 桌面登录会用本机回调桥覆盖静态 localhost 回调配置", async () => {
    window.__LIME_OEM_CLOUD__ = {
      enabled: true,
      baseUrl: "https://user.limeai.run",
      tenantId: "tenant-0001",
      desktopOauthRedirectUrl: "http://localhost:17834/callback",
    };
    controlPlaneMocks.createClientDesktopAuthSession.mockRejectedValue(
      new Error("desktop client not found"),
    );

    mountHookHarness();
    await flushEffects();

    await act(async () => {
      await latestState?.handleGoogleLogin();
    });

    expect(
      systemBrowserMocks.startOemCloudOAuthCallbackBridge,
    ).toHaveBeenCalledTimes(1);
    expect(
      controlPlaneMocks.createClientDesktopAuthSession,
    ).toHaveBeenCalledWith("tenant-0001", {
      clientId: "desktop-client",
      provider: "google",
      desktopRedirectUri: "http://127.0.0.1:18081/oauth/callback",
    });
    const openedUrl = systemBrowserMocks.openExternalUrlWithSystemBrowser.mock
      .calls[0]?.[0] as string;
    const parsedUrl = new URL(openedUrl);
    expect(parsedUrl.searchParams.get("redirectUrl")).toBe(
      "http://127.0.0.1:18081/oauth/callback",
    );
    expect(latestState?.errorMessage).toBeNull();
  });
});
