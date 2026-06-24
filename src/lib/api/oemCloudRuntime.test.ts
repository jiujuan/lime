import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setStoredOemCloudSessionState } from "@/lib/oemCloudSession";
import {
  resolveOemCloudAgentAppSignatureTrustRoots,
  resolveOemCloudRuntimeContext,
} from "./oemCloudRuntime";

const AGENT_APP_TRUST_ROOT = {
  publicKeyId: "agent-app-root-2026",
  algorithm: "RSASSA-PKCS1-v1_5-SHA256",
  publicKey: "public-key-spki-base64",
  appIds: ["content-factory-app"],
};

describe("oemCloudRuntime", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.__LIME_BOOTSTRAP__;
    delete window.__LIME_OEM_CLOUD__;
    delete window.__LIME_SESSION_TOKEN__;
  });

  afterEach(() => {
    window.localStorage.clear();
    delete window.__LIME_BOOTSTRAP__;
    delete window.__LIME_OEM_CLOUD__;
    delete window.__LIME_SESSION_TOKEN__;
  });

  it("应优先从运行时配置解析基础地址与 Lime Hub 元信息", () => {
    window.__LIME_OEM_CLOUD__ = {
      enabled: true,
      baseUrl: "https://user.limeai.run/",
      gatewayBaseUrl: "https://gateway-api.limeai.run/root/",
      tenantId: "tenant-0001",
      hubProviderName: "Acme Hub",
      sessionToken: "runtime-session-token",
      loginPath: "/login",
      desktopClientId: "limehub-desktop",
      desktopOauthRedirectUrl: "lime://oauth/callback",
      desktopOauthNextPath: "/welcome",
      agentAppSignatureTrustRoots: [AGENT_APP_TRUST_ROOT],
    };

    expect(resolveOemCloudRuntimeContext()).toEqual({
      baseUrl: "https://user.limeai.run",
      controlPlaneBaseUrl: "https://user.limeai.run/api",
      sceneBaseUrl: "https://user.limeai.run/scene-api",
      gatewayBaseUrl: "https://gateway-api.limeai.run/root",
      tenantId: "tenant-0001",
      sessionToken: "runtime-session-token",
      hubProviderName: "Acme Hub",
      loginPath: "/login",
      desktopClientId: "limehub-desktop",
      desktopOauthRedirectUrl: "lime://oauth/callback",
      desktopOauthNextPath: "/welcome",
      agentAppSignatureTrustRoots: [AGENT_APP_TRUST_ROOT],
    });
  });

  it("未显式提供 gatewayBaseUrl 时应回退到 baseUrl/gateway-api", () => {
    window.__LIME_OEM_CLOUD__ = {
      enabled: true,
      baseUrl: "https://user.limeai.run",
      tenantId: "tenant-0001",
    };

    expect(resolveOemCloudRuntimeContext()).toMatchObject({
      baseUrl: "https://user.limeai.run",
      gatewayBaseUrl: "https://user.limeai.run/gateway-api",
      tenantId: "tenant-0001",
      hubProviderName: null,
      loginPath: "/login",
      desktopClientId: "desktop-client",
      desktopOauthRedirectUrl: "lime://oauth/callback",
      desktopOauthNextPath: "/welcome",
      agentAppSignatureTrustRoots: [],
    });
  });

  it("运行时缺租户时应回退复用本地持久化会话", () => {
    setStoredOemCloudSessionState({
      token: "persisted-session-token",
      tenant: {
        id: "tenant-from-storage",
      },
      user: {
        id: "user-001",
      },
      session: {
        id: "session-001",
      },
    });

    window.__LIME_OEM_CLOUD__ = {
      enabled: true,
      baseUrl: "https://user.limeai.run",
    };

    expect(resolveOemCloudRuntimeContext()).toMatchObject({
      baseUrl: "https://user.limeai.run",
      gatewayBaseUrl: "https://user.limeai.run/gateway-api",
      tenantId: "tenant-from-storage",
      sessionToken: "persisted-session-token",
      loginPath: "/login",
      desktopClientId: "desktop-client",
      desktopOauthRedirectUrl: "lime://oauth/callback",
      desktopOauthNextPath: "/welcome",
      agentAppSignatureTrustRoots: [],
    });
  });

  it("应从 bootstrap 快照解析 Agent App 签名可信根", () => {
    window.__LIME_BOOTSTRAP__ = {
      tenantId: "tenant-0001",
      agentApps: {
        signatureTrustRoots: [AGENT_APP_TRUST_ROOT],
      },
    };

    window.__LIME_OEM_CLOUD__ = {
      enabled: true,
      baseUrl: "https://user.limeai.run",
    };

    expect(resolveOemCloudRuntimeContext()).toMatchObject({
      agentAppSignatureTrustRoots: [AGENT_APP_TRUST_ROOT],
    });
    expect(resolveOemCloudAgentAppSignatureTrustRoots()).toEqual([
      AGENT_APP_TRUST_ROOT,
    ]);
  });

  it("运行时可信根应优先于 bootstrap 快照可信根", () => {
    const runtimeTrustRoot = {
      ...AGENT_APP_TRUST_ROOT,
      publicKeyId: "agent-app-root-runtime",
      publicKey: "runtime-public-key-spki-base64",
    };
    window.__LIME_BOOTSTRAP__ = {
      tenantId: "tenant-0001",
      agentAppSignatureTrustRoots: [AGENT_APP_TRUST_ROOT],
    };
    window.__LIME_OEM_CLOUD__ = {
      enabled: true,
      baseUrl: "https://user.limeai.run",
      tenantId: "tenant-0001",
      agentAppSignatureTrustRoots: [runtimeTrustRoot],
    };

    expect(resolveOemCloudAgentAppSignatureTrustRoots()).toEqual([
      runtimeTrustRoot,
    ]);
  });

  it("应保留 Agent App 签名可信根的轮换字段", () => {
    const rotatingTrustRoot = {
      ...AGENT_APP_TRUST_ROOT,
      notBefore: "2026-01-01T00:00:00.000Z",
      notAfter: "2026-12-31T23:59:59.999Z",
      revoked: false,
    };
    window.__LIME_OEM_CLOUD__ = {
      agentAppSignatureTrustRoots: [rotatingTrustRoot],
    };

    expect(resolveOemCloudAgentAppSignatureTrustRoots()).toEqual([
      rotatingTrustRoot,
    ]);
  });

  it("可信根轮换字段格式错误时应丢弃 root", () => {
    window.__LIME_OEM_CLOUD__ = {
      agentAppSignatureTrustRoots: [
        {
          ...AGENT_APP_TRUST_ROOT,
          notBefore: "invalid-date",
        },
      ],
    };

    expect(resolveOemCloudAgentAppSignatureTrustRoots()).toEqual([]);
  });
});
