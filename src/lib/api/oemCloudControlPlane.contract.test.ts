import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClientAccessToken,
  createClientCreditTopupOrder,
  createClientCreditTopupOrderCheckout,
  createClientOrder,
  createClientOrderCheckout,
  createClientDesktopAuthSession,
  claimClientReferral,
  getClientActiveAccessToken,
  getClientAgentApps,
  getClientCloudActivation,
  getClientCreditTopupOrder,
  getClientOrder,
  getClientBootstrap,
  getClientCreditsDashboard,
  getClientPluginMarketplace,
  getClientSceneSkillPreferences,
  getPublicAuthCatalog,
  getClientProviderOffer,
  getClientReferralDashboard,
  listClientPaymentConfigs,
  listClientPlans,
  listClientProviderOfferModels,
  listClientProviderOffers,
  listClientTopupPackages,
  pollClientDesktopAuthSession,
  rotateClientAccessToken,
  reportClientPluginInstallState,
  submitClientAgentAppRegistrationCode,
  submitClientPluginRegistrationCode,
  updateClientSceneSkillPreferences,
} from "./oemCloudControlPlane";

const AGENT_APP_PACKAGE_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const AGENT_APP_MANIFEST_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("oemCloudControlPlane desktop auth", () => {
  beforeEach(() => {
    delete window.__LIME_BOOTSTRAP__;
    delete window.__LIME_SESSION_TOKEN__;
    window.__LIME_OEM_CLOUD__ = {
      enabled: true,
      baseUrl: "https://user.limeai.run",
      tenantId: "tenant-0001",
    };
  });

  afterEach(() => {
    delete window.__LIME_BOOTSTRAP__;
    delete window.__LIME_OEM_CLOUD__;
    delete window.__LIME_SESSION_TOKEN__;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("应创建桌面授权会话并返回浏览器授权地址", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        code: 201,
        message: "success",
        data: {
          authSessionId: "desktop-auth-0001",
          deviceCode: "device-code-001",
          tenantId: "tenant-0001",
          clientId: "desktop-client",
          clientName: "Desktop Client",
          provider: "google",
          desktopRedirectUri: "lime://oauth/callback",
          status: "pending_login",
          expiresInSeconds: 600,
          pollIntervalSeconds: 2,
          authorizeUrl:
            "https://user.limeai.run/oauth/desktop/device-code-001/authorize?provider=google",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createClientDesktopAuthSession("tenant-0001", {
      clientId: "desktop-client",
      provider: "google",
      desktopRedirectUri: "lime://oauth/callback",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/desktop/auth-sessions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          clientId: "desktop-client",
          provider: "google",
          desktopRedirectUri: "lime://oauth/callback",
        }),
      }),
    );
    expect(result).toEqual({
      authSessionId: "desktop-auth-0001",
      deviceCode: "device-code-001",
      tenantId: "tenant-0001",
      clientId: "desktop-client",
      clientName: "Desktop Client",
      provider: "google",
      desktopRedirectUri: "lime://oauth/callback",
      status: "pending_login",
      expiresInSeconds: 600,
      pollIntervalSeconds: 2,
      authorizeUrl:
        "https://user.limeai.run/oauth/desktop/device-code-001/authorize?provider=google",
    });
  });

  it("应轮询桌面授权结果并解析 session token", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: "success",
        data: {
          deviceCode: "device-code-001",
          tenantId: "tenant-0001",
          clientId: "desktop-client",
          clientName: "Desktop Client",
          provider: "google",
          status: "approved",
          expiresInSeconds: 388,
          pollIntervalSeconds: 2,
          sessionToken: "session-token-001",
          sessionExpiresAt: "2026-03-24T16:00:00.000Z",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await pollClientDesktopAuthSession("device-code-001");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/desktop/auth-sessions/device-code-001/poll",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Accept: "application/json",
        }),
      }),
    );
    expect(result).toEqual({
      deviceCode: "device-code-001",
      tenantId: "tenant-0001",
      clientId: "desktop-client",
      clientName: "Desktop Client",
      provider: "google",
      desktopRedirectUri: undefined,
      status: "approved",
      expiresInSeconds: 388,
      pollIntervalSeconds: 2,
      sessionToken: "session-token-001",
      sessionExpiresAt: "2026-03-24T16:00:00.000Z",
    });
  });

  it("应读取公开登录目录与启动策略", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: "success",
        data: {
          items: [
            {
              provider: "google",
              displayName: "Google",
              scopes: ["openid", "email"],
              enabled: true,
            },
          ],
          authPolicy: {
            required: true,
            startupTrigger: "oauth",
            primaryProvider: "google",
          },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await getPublicAuthCatalog("tenant-0001");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/auth-catalog",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
        }),
      }),
    );
    expect(catalog).toEqual({
      providers: [
        {
          provider: "google",
          displayName: "Google",
          authorizeUrl: undefined,
          redirectUri: undefined,
          scopes: ["openid", "email"],
          enabled: true,
          loginHint: undefined,
        },
      ],
      authPolicy: {
        required: true,
        startupTrigger: "oauth",
        primaryProvider: "google",
      },
    });
  });

  it("应解析 bootstrap 中缓存的邀请开关与分享事实源", async () => {
    window.__LIME_SESSION_TOKEN__ = "session-token-001";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: "success",
        data: {
          session: {
            token: "session-token-001",
            tenant: { id: "tenant-0001", name: "Lime" },
            user: { id: "user-001", displayName: "晚风" },
            session: { id: "session-001", provider: "google" },
          },
          app: {
            id: "app-001",
            key: "lime",
            name: "Lime",
            slug: "lime",
            category: "official",
            status: "active",
            distributionChannels: ["desktop"],
          },
          providerOffersSummary: [],
          providerPreference: {
            tenantId: "tenant-0001",
            userId: "user-001",
            providerSource: "local",
            providerKey: "local",
            needsValidation: false,
            updatedAt: "2026-04-28T00:00:00.000Z",
          },
          features: {
            referralEnabled: true,
          },
          agentAppCatalog: {
            schemaVersion: "agent-app-cloud-bootstrap/v1",
            tenantId: "tenant-0001",
            generatedAt: "2026-05-15T00:00:00.000Z",
            apps: [
              {
                appId: "content-factory-app",
                displayName: "内容工厂",
                version: "0.3.0",
                releaseId: "release-001",
                tenantId: "tenant-0001",
                tenantEnablementRef: "enablement-001",
                channel: "stable",
                signatureRef: "sigstore:content-factory-app@0.3.0",
                licenseState: "active",
                enabled: true,
                packageUrl:
                  "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
                packageHash: AGENT_APP_PACKAGE_HASH,
                manifestHash: AGENT_APP_MANIFEST_HASH,
                capabilityRequirements: {
                  "lime.ui": "^0.3.0",
                  "lime.storage": "^0.3.0",
                },
                defaultEntries: ["dashboard"],
                policyDefaults: {
                  allowServerAssisted: false,
                },
                toolAvailability: [
                  {
                    key: "document_parser",
                    status: "available",
                    required: true,
                  },
                ],
              },
            ],
          },
          referral: {
            code: {
              id: "refcode-001",
              tenantId: "tenant-0001",
              userId: "user-001",
              code: "LIME-2026",
              landingUrl: "https://limeai.run/invite?code=LIME-2026",
              status: "active",
              createdAt: "2026-04-28T00:00:00.000Z",
              updatedAt: "2026-04-28T00:00:00.000Z",
            },
            policy: {
              enabled: true,
              referrerRewardCredits: 480,
              inviteeRewardCredits: 120,
              claimWindowDays: 30,
              autoClaimEnabled: true,
              allowManualClaimFallback: true,
            },
            summary: {},
            events: [],
            rewards: [],
            invitedBy: {},
            share: {
              brandName: "Lime",
              code: "LIME-2026",
              landingUrl: "https://limeai.run/invite?code=LIME-2026",
              downloadUrl: "https://limeai.run",
              shareText: "邀请你体验Lime",
            },
          },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const bootstrap = await getClientBootstrap("tenant-0001");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/bootstrap",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer session-token-001",
        }),
      }),
    );
    expect(bootstrap.features.referralEnabled).toBe(true);
    expect(bootstrap.referral?.share).toMatchObject({
      brandName: "Lime",
      code: "LIME-2026",
      downloadUrl: "https://limeai.run",
    });
    expect(bootstrap.agentAppCatalog?.apps[0]).toMatchObject({
      appId: "content-factory-app",
      releaseId: "release-001",
      packageHash: AGENT_APP_PACKAGE_HASH,
      manifestHash: AGENT_APP_MANIFEST_HASH,
      enabled: true,
    });
  });

  it("应通过正式 client/agent-apps 接口读取 Agent App 云目录", async () => {
    window.__LIME_SESSION_TOKEN__ = "session-token-001";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: "success",
        data: {
          schemaVersion: "agent-app-cloud-bootstrap/v1",
          tenantId: "tenant-0001",
          generatedAt: "2026-05-15T00:00:00.000Z",
          fetchedAt: "2026-05-15T00:00:01.000Z",
          apps: [
            {
              appId: "content-factory-app",
              displayName: "内容工厂",
              version: "0.3.0",
              releaseId: "release-001",
              tenantId: "tenant-0001",
              tenantEnablementRef: "enablement-001",
              channel: "stable",
              signatureRef: "sigstore:content-factory-app@0.3.0",
              licenseState: "revoked",
              enabled: false,
              disabledReason: "license revoked",
              packageUrl:
                "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
              packageHash: AGENT_APP_PACKAGE_HASH,
              manifestHash: AGENT_APP_MANIFEST_HASH,
              capabilityRequirements: {
                "lime.ui": "^0.3.0",
                "lime.storage": "^0.3.0",
              },
              defaultEntries: ["dashboard"],
              policyDefaults: {
                allowServerAssisted: false,
              },
              toolAvailability: [
                {
                  key: "document_parser",
                  status: "available",
                  required: true,
                },
              ],
            },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await getClientAgentApps("tenant-0001");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/agent-apps",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer session-token-001",
        }),
      }),
    );
    expect(catalog).toMatchObject({
      schemaVersion: "agent-app-cloud-bootstrap/v1",
      tenantId: "tenant-0001",
      apps: [
        {
          appId: "content-factory-app",
          licenseState: "revoked",
          enabled: false,
          disabledReason: "license revoked",
        },
      ],
    });
  });

  it("应通过正式 client/plugins/marketplace 接口读取插件市场目录", async () => {
    window.__LIME_SESSION_TOKEN__ = "session-token-001";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: "success",
        data: {
          schemaVersion: "plugin-marketplace/v1",
          tenantId: "tenant-0001",
          generatedAt: "2026-06-25T00:00:00.000Z",
          marketplaceName: "limecloud",
          marketplaceDisplayName: "LimeCloud Marketplace",
          items: [
            {
              pluginKey: "research-kit@limecloud",
              pluginName: "research-kit",
              marketplaceName: "limecloud",
              marketplaceDisplayName: "LimeCloud Marketplace",
              displayName: "Research Kit",
              description: "Research plugin package",
              version: "1.2.3",
              category: "research",
              categories: ["research"],
              keywords: ["research", "research-style"],
              capabilities: ["lime.skills"],
              sourceKind: "agent_app_release",
              sourceRef: "release-001",
              appId: "research-kit",
              enabled: true,
              installState: "available",
              activationState: "activatable",
              policy: {
                installation: "AVAILABLE",
                authentication: "ON_USE",
              },
              package: {
                releaseId: "release-001",
                packageUrl:
                  "https://packages.limecloud.example/plugins/research-kit-1.2.3.lpkg",
                packageHash: AGENT_APP_PACKAGE_HASH,
                manifestHash: AGENT_APP_MANIFEST_HASH,
              },
              manifestSummary: {
                name: "research-kit",
              },
            },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const marketplace = await getClientPluginMarketplace("tenant-0001", {
      query: "research style",
      category: "research",
      sort: "name",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/plugins/marketplace?query=research+style&category=research&sort=name",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer session-token-001",
        }),
      }),
    );
    expect(marketplace).toMatchObject({
      schemaVersion: "plugin-marketplace/v1",
      tenantId: "tenant-0001",
      marketplaceName: "limecloud",
      items: [
        {
          pluginKey: "research-kit@limecloud",
          pluginName: "research-kit",
          sourceKind: "agent_app_release",
          installState: "available",
          activationState: "activatable",
          policy: {
            installation: "AVAILABLE",
            authentication: "ON_USE",
          },
          package: {
            releaseId: "release-001",
            packageHash: AGENT_APP_PACKAGE_HASH,
            manifestHash: AGENT_APP_MANIFEST_HASH,
          },
        },
      ],
    });
  });

  it("应提交 Agent App 注册码并解析刷新后的云目录", async () => {
    window.__LIME_SESSION_TOKEN__ = "session-token-001";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: "success",
        data: {
          schemaVersion: "agent-app-cloud-bootstrap/v1",
          tenantId: "tenant-0001",
          generatedAt: "2026-05-15T00:02:00.000Z",
          apps: [
            {
              appId: "content-factory-app",
              displayName: "内容工厂",
              version: "0.3.0",
              registrationRequired: true,
              registrationState: "active",
              enabled: true,
              packageUrl:
                "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
              packageHash: AGENT_APP_PACKAGE_HASH,
              manifestHash: AGENT_APP_MANIFEST_HASH,
              capabilityRequirements: {},
              defaultEntries: ["dashboard"],
              policyDefaults: {},
              toolAvailability: [],
            },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await submitClientAgentAppRegistrationCode(
      "tenant-0001",
      "content-factory-app",
      { code: "CF-REG-2026" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/agent-apps/content-factory-app/registration",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "CF-REG-2026" }),
        headers: expect.objectContaining({
          Authorization: "Bearer session-token-001",
        }),
      }),
    );
    expect(catalog.apps[0]).toMatchObject({
      appId: "content-factory-app",
      registrationRequired: true,
      registrationState: "active",
      packageHash: AGENT_APP_PACKAGE_HASH,
    });
  });

  it("应提交原生插件注册码并解析刷新后的插件市场目录", async () => {
    window.__LIME_SESSION_TOKEN__ = "session-token-001";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: "success",
        data: {
          schemaVersion: "plugin-marketplace/v1",
          tenantId: "tenant-0001",
          generatedAt: "2026-06-25T00:03:00.000Z",
          marketplaceName: "limecloud",
          items: [
            {
              pluginKey: "research-kit@limecloud",
              pluginName: "research-kit",
              marketplaceName: "limecloud",
              displayName: "Research Kit",
              description: "Research plugin package",
              version: "1.2.3",
              category: "research",
              categories: ["research"],
              sourceKind: "plugin_catalog",
              sourceRef: "release-001",
              enabled: true,
              installState: "available",
              activationState: "activatable",
              policy: {
                installation: "AVAILABLE",
                authentication: "ON_INSTALL",
              },
              package: {
                releaseId: "release-001",
                packageUrl:
                  "https://packages.limecloud.example/plugins/research-kit-1.2.3.lpkg",
                packageHash: AGENT_APP_PACKAGE_HASH,
                manifestHash: AGENT_APP_MANIFEST_HASH,
              },
            },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await submitClientPluginRegistrationCode(
      "tenant-0001",
      "research-kit",
      { code: "PLUGIN-REG-2026" },
      "limecloud",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/plugins/research-kit/registration?marketplaceName=limecloud",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "PLUGIN-REG-2026" }),
        headers: expect.objectContaining({
          Authorization: "Bearer session-token-001",
        }),
      }),
    );
    expect(catalog.items[0]).toMatchObject({
      pluginKey: "research-kit@limecloud",
      sourceKind: "plugin_catalog",
      installState: "available",
      activationState: "activatable",
      package: {
        releaseId: "release-001",
        packageHash: AGENT_APP_PACKAGE_HASH,
      },
    });
  });

  it("应上报客户端插件安装态并解析服务端记录", async () => {
    window.__LIME_SESSION_TOKEN__ = "session-token-001";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: "success",
        data: {
          tenantId: "tenant-0001",
          userId: "user-001",
          pluginName: "research-kit",
          marketplaceName: "limecloud",
          pluginKey: "research-kit@limecloud",
          sourceKind: "agent_app_release",
          sourceRef: "release-001",
          state: "enabled",
          releaseId: "release-001",
          packageHash: AGENT_APP_PACKAGE_HASH,
          manifestHash: AGENT_APP_MANIFEST_HASH,
          reportedAt: "2026-06-26T08:00:00.000Z",
          updatedAt: "2026-06-26T08:00:01.000Z",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const report = await reportClientPluginInstallState(
      "tenant-0001",
      "research-kit",
      {
        state: "enabled",
        releaseId: "release-001",
        packageHash: AGENT_APP_PACKAGE_HASH,
        manifestHash: AGENT_APP_MANIFEST_HASH,
        reportedAt: "2026-06-26T08:00:00.000Z",
      },
      "limecloud",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/plugins/research-kit/install-state?marketplaceName=limecloud",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          state: "enabled",
          releaseId: "release-001",
          packageHash: AGENT_APP_PACKAGE_HASH,
          manifestHash: AGENT_APP_MANIFEST_HASH,
          reportedAt: "2026-06-26T08:00:00.000Z",
        }),
        headers: expect.objectContaining({
          Authorization: "Bearer session-token-001",
        }),
      }),
    );
    expect(report).toMatchObject({
      pluginKey: "research-kit@limecloud",
      sourceKind: "agent_app_release",
      state: "enabled",
      packageHash: AGENT_APP_PACKAGE_HASH,
    });
  });

  it("应读取并更新首页场景技能偏好", async () => {
    window.__LIME_SESSION_TOKEN__ = "session-token-001";

    const preferencePayload = {
      tenantId: "tenant-0001",
      userId: "user-0001",
      orderedEntryIds: ["custom_scene:daily-review", "skill:trend"],
      hiddenEntryIds: ["skill:hidden"],
      customScenes: [
        {
          id: "custom_scene:daily-review",
          title: "每日复盘",
          linkedEntryId: "skill:trend",
          templates: [
            {
              id: "default",
              title: "开始复盘",
              prompt: "请帮我复盘今天的内容表现。",
            },
          ],
          enabled: true,
        },
      ],
      updatedAt: "2026-04-30T00:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          message: "success",
          data: preferencePayload,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          message: "success",
          data: preferencePayload,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const preference = await getClientSceneSkillPreferences("tenant-0001");
    expect(preference.customScenes[0]?.title).toBe("每日复盘");

    await updateClientSceneSkillPreferences("tenant-0001", {
      orderedEntryIds: preference.orderedEntryIds,
      hiddenEntryIds: preference.hiddenEntryIds,
      customScenes: preference.customScenes,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/scene-skill-preferences",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer session-token-001",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/scene-skill-preferences",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          orderedEntryIds: preference.orderedEntryIds,
          hiddenEntryIds: preference.hiddenEntryIds,
          customScenes: preference.customScenes,
        }),
      }),
    );
  });

  it("应解析服务端下发的云端治理字段", async () => {
    window.__LIME_SESSION_TOKEN__ = "session-token-001";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          message: "success",
          data: {
            items: [
              {
                providerKey: "lime-hub-main",
                displayName: "Lime Hub 主服务",
                source: "oem_cloud",
                state: "available_ready",
                visible: true,
                loggedIn: true,
                accountStatus: "logged_in",
                subscriptionStatus: "active",
                quotaStatus: "ok",
                canInvoke: true,
                defaultModel: "gpt-5.2-pro",
                effectiveAccessMode: "session",
                apiKeyModeEnabled: false,
                tenantOverrideApplied: true,
                configMode: "managed",
                modelsSource: "hub_catalog",
                developerAccessVisible: false,
                availableModelCount: 18,
                fallbackToLocalAllowed: true,
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          message: "success",
          data: {
            providerKey: "lime-hub-main",
            displayName: "Lime Hub 主服务",
            source: "oem_cloud",
            state: "available_ready",
            visible: true,
            loggedIn: true,
            accountStatus: "logged_in",
            subscriptionStatus: "active",
            quotaStatus: "ok",
            canInvoke: true,
            defaultModel: "gpt-5.2-pro",
            effectiveAccessMode: "session",
            apiKeyModeEnabled: true,
            tenantOverrideApplied: false,
            configMode: "hybrid",
            modelsSource: "manual",
            developerAccessVisible: true,
            availableModelCount: 6,
            fallbackToLocalAllowed: true,
            access: {
              offerId: "offer-001",
              accessMode: "api_key",
              hubTokenEnabled: true,
              hubTokenRef: "hub-token-ref",
            },
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const [offers, detail] = await Promise.all([
      listClientProviderOffers("tenant-0001"),
      getClientProviderOffer("tenant-0001", "lime-hub-main"),
    ]);

    expect(offers[0]).toMatchObject({
      effectiveAccessMode: "session",
      apiKeyModeEnabled: false,
      tenantOverrideApplied: true,
      configMode: "managed",
      modelsSource: "hub_catalog",
      developerAccessVisible: false,
    });
    expect(detail).toMatchObject({
      effectiveAccessMode: "session",
      apiKeyModeEnabled: true,
      configMode: "hybrid",
      modelsSource: "manual",
      developerAccessVisible: true,
      access: {
        offerId: "offer-001",
        accessMode: "api_key",
        hubTokenEnabled: true,
        hubTokenRef: "hub-token-ref",
      },
    });
  });

  it("应解析服务端直接下发的 OEM 模型 taxonomy 字段", async () => {
    window.__LIME_SESSION_TOKEN__ = "session-token-001";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: "success",
        data: {
          items: [
            {
              id: "model-001",
              offerId: "offer-001",
              modelId: "relay-gpt-images-2",
              displayName: "Relay GPT Images 2",
              abilities: ["image_generation"],
              task_families: ["image_generation"],
              input_modalities: ["text"],
              output_modalities: ["image"],
              runtime_features: ["images_api"],
              deployment_source: "oem_cloud",
              management_plane: "oem_control_plane",
              canonical_model_id: "openai/gpt-images-2",
              provider_model_id: "relay-gpt-images-2",
              alias_source: "oem",
              recommended: true,
              status: "active",
              sort: 10,
              createdAt: "2026-04-22T00:00:00.000Z",
              updatedAt: "2026-04-22T00:00:00.000Z",
            },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const models = await listClientProviderOfferModels(
      "tenant-0001",
      "lime-hub-main",
    );

    expect(models).toEqual([
      expect.objectContaining({
        modelId: "relay-gpt-images-2",
        task_families: ["image_generation"],
        input_modalities: ["text"],
        output_modalities: ["image"],
        runtime_features: ["images_api"],
        deployment_source: "oem_cloud",
        management_plane: "oem_control_plane",
        canonical_model_id: "openai/gpt-images-2",
        provider_model_id: "relay-gpt-images-2",
        alias_source: "oem",
      }),
    ]);
  });

  it("应读取客户端邀请看板并以云端 share 作为事实源", async () => {
    window.__LIME_SESSION_TOKEN__ = "session-token-001";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: "success",
        data: {
          code: {
            id: "refcode-001",
            tenantId: "tenant-0001",
            userId: "user-001",
            code: "LIME-2026",
            landingUrl: "https://limeai.run/invite?code=LIME-2026",
            status: "active",
            createdAt: "2026-04-28T00:00:00.000Z",
            updatedAt: "2026-04-28T00:00:00.000Z",
          },
          policy: {
            enabled: true,
            rewardCredits: 600,
            referrerRewardCredits: 480,
            inviteeRewardCredits: 120,
            claimWindowDays: 30,
            autoClaimEnabled: true,
            allowManualClaimFallback: true,
          },
          summary: {
            totalInvites: 2,
            successfulInvites: 1,
            totalRewardCredits: 480,
            referrerRewardCreditsTotal: 480,
            inviteeRewardCreditsTotal: 0,
          },
          events: [],
          rewards: [],
          invitedBy: {},
          share: {
            brandName: "Lime",
            code: "LIME-2026",
            landingUrl: "https://limeai.run/invite?code=LIME-2026",
            downloadUrl: "https://limeai.run",
            shareText:
              "邀请你体验Lime，让AI做牛做马，我们来做牛人！前往 https://limeai.run 下载客户端，复制邀请码 LIME-2026 激活并注册账号参与内测",
            headline: "登录后自动领取奖励",
            rules: "复制邀请码后完成注册即可参与内测。",
          },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const dashboard = await getClientReferralDashboard("tenant-0001");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/referral",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer session-token-001",
        }),
      }),
    );
    expect(dashboard.share).toEqual(
      expect.objectContaining({
        brandName: "Lime",
        code: "LIME-2026",
        downloadUrl: "https://limeai.run",
      }),
    );
    expect(dashboard.policy.referrerRewardCredits).toBe(480);
    expect(dashboard.policy.inviteeRewardCredits).toBe(120);
  });

  it("应调用客户端邀请码领取接口", async () => {
    window.__LIME_SESSION_TOKEN__ = "session-token-001";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        code: 201,
        message: "success",
        data: {
          event: { id: "refevent-001", code: "LIME-2026" },
          reward: { id: "refreward-001", rewardCredits: 120 },
          rewards: [{ id: "refreward-001" }],
          creditAccount: {
            tenantId: "tenant-0001",
            userId: "user-001",
            balance: 120,
            reserved: 0,
            currency: "credits",
            updatedAt: "2026-04-28T00:00:00.000Z",
          },
          accountLedgers: [{ id: "account-ledger-001" }],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await claimClientReferral("tenant-0001", {
      code: "LIME-2026",
      claimMethod: "manual",
      entrySource: "code_input",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/referrals/claim",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer session-token-001",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          code: "LIME-2026",
          claimMethod: "manual",
          entrySource: "code_input",
        }),
      }),
    );
    expect(result.creditAccount?.balance).toBe(120);
    expect(result.accountLedgers).toHaveLength(1);
  });

  it("应接入套餐、积分、订单和 API Key 控制面接口", async () => {
    window.__LIME_SESSION_TOKEN__ = "session-token-001";

    const accessToken = {
      id: "token-001",
      tenantId: "tenant-0001",
      userId: "user-001",
      name: "Desktop Key",
      tokenMasked: "sk-lime-***abcd",
      tokenPrefix: "sk-lime-abcd",
      scopes: ["llm:invoke"],
      allowedModels: ["glm-4.6"],
      status: "active",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z",
      expiresAt: "2026-05-27T00:00:00.000Z",
    };
    const plan = {
      id: "plan-pro",
      tenantId: "tenant-0001",
      key: "pro",
      name: "Pro",
      priceMonthly: 9900,
      creditsMonthly: 1000000,
      features: ["Anthropic-compatible coding"],
      status: "active",
      recommended: true,
      billingCycles: [
        {
          key: "monthly",
          label: "月付",
          priceCents: 9900,
          credits: 1000000,
          autoRenew: true,
        },
      ],
      quotaSummaries: [],
      featureSections: [],
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z",
    };
    const creditAccount = {
      tenantId: "tenant-0001",
      userId: "user-001",
      balance: 120000,
      reserved: 1000,
      currency: "credits",
      updatedAt: "2026-04-27T00:00:00.000Z",
    };
    const subscription = {
      id: "sub-001",
      tenantId: "tenant-0001",
      userId: "user-001",
      planId: "plan-pro",
      planKey: "pro",
      planName: "Pro",
      status: "active",
      billingCycle: "monthly",
      currentPeriodStart: "2026-04-01T00:00:00.000Z",
      currentPeriodEnd: "2026-05-01T00:00:00.000Z",
      autoRenew: true,
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z",
    };
    const topupPackage = {
      id: "topup-100k",
      tenantId: "tenant-0001",
      key: "100k",
      name: "10 万积分包",
      credits: 100000,
      priceCents: 1900,
      validDays: 365,
      recommended: true,
      status: "active",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z",
    };
    const order = {
      id: "order-001",
      tenantId: "tenant-0001",
      userId: "user-001",
      planId: "plan-pro",
      planKey: "pro",
      planName: "Pro",
      amountCents: 9900,
      creditsGranted: 1000000,
      paymentChannel: "epay",
      paymentMethod: "alipay",
      billingCycle: "monthly",
      status: "pending",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z",
    };
    const topupOrder = {
      id: "topup-order-001",
      tenantId: "tenant-0001",
      userId: "user-001",
      packageId: "topup-100k",
      packageName: "10 万积分包",
      creditsGranted: 100000,
      amountCents: 1900,
      paymentChannel: "epay",
      paymentMethod: "alipay",
      status: "pending",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z",
    };
    const response = (data: unknown, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({
        code: status,
        message: "success",
        data,
      }),
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          items: [
            {
              id: "pay-alipay",
              tenantId: "tenant-0001",
              provider: "epay",
              displayName: "易支付",
              notifyUrl: "https://user.limeai.run/pay/notify",
              returnUrl: "https://user.limeai.run/pay/return",
              enabled: true,
              methods: [
                {
                  key: "alipay",
                  displayName: "支付宝",
                  enabled: true,
                },
              ],
              providerOptions: {
                payAddress: "https://pay.example.com",
              },
              credentialMasks: {
                partnerId: "2088***0001",
              },
              createdAt: "2026-04-27T00:00:00.000Z",
              updatedAt: "2026-04-27T00:00:00.000Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(response({ items: [plan] }))
      .mockResolvedValueOnce(
        response({
          creditAccount,
          subscription,
          topupPackages: [topupPackage],
          creditWallets: [],
          creditOrders: [topupOrder],
        }),
      )
      .mockResolvedValueOnce(response({ items: [topupPackage] }))
      .mockResolvedValueOnce(response({ hasActive: true, token: accessToken }))
      .mockResolvedValueOnce(
        response({ token: accessToken, apiKey: "sk-lime-new" }, 201),
      )
      .mockResolvedValueOnce(
        response(
          {
            previousToken: { ...accessToken, status: "revoked" },
            newToken: { ...accessToken, id: "token-002" },
            apiKey: "sk-lime-rotated",
          },
          200,
        ),
      )
      .mockResolvedValueOnce(response(order, 201))
      .mockResolvedValueOnce(
        response({
          orderKind: "plan_order",
          orderId: "order-001",
          paymentChannel: "epay",
          paymentMethod: "alipay",
          checkoutUrl:
            "https://pay.example.com/submit.php?out_trade_no=order-001",
          paymentReference:
            "https://pay.example.com/submit.php?out_trade_no=order-001",
          status: "pending",
        }),
      )
      .mockResolvedValueOnce(response(topupOrder, 201))
      .mockResolvedValueOnce(
        response({
          orderKind: "credit_topup_order",
          orderId: "topup-order-001",
          paymentChannel: "epay",
          paymentMethod: "alipay",
          checkoutUrl:
            "https://pay.example.com/submit.php?out_trade_no=topup-order-001",
          paymentReference:
            "https://pay.example.com/submit.php?out_trade_no=topup-order-001",
          status: "pending",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listClientPaymentConfigs("tenant-0001")).resolves.toEqual([
      expect.objectContaining({
        provider: "epay",
        enabled: true,
        methods: [expect.objectContaining({ key: "alipay" })],
        providerOptions: { payAddress: "https://pay.example.com" },
        credentialMasks: { partnerId: "2088***0001" },
      }),
    ]);
    await expect(listClientPlans("tenant-0001")).resolves.toEqual([
      expect.objectContaining({
        name: "Pro",
        billingCycles: expect.any(Array),
      }),
    ]);
    await expect(
      getClientCreditsDashboard("tenant-0001"),
    ).resolves.toMatchObject({
      creditAccount: { balance: 120000 },
      subscription: { planName: "Pro" },
      topupPackages: [{ name: "10 万积分包" }],
    });
    await expect(listClientTopupPackages("tenant-0001")).resolves.toEqual([
      expect.objectContaining({ id: "topup-100k" }),
    ]);
    await expect(
      getClientActiveAccessToken("tenant-0001"),
    ).resolves.toMatchObject({
      hasActive: true,
      token: { tokenMasked: "sk-lime-***abcd" },
    });
    await expect(
      createClientAccessToken("tenant-0001", {
        name: "Desktop Key",
        scopes: ["llm:invoke"],
      }),
    ).resolves.toMatchObject({ apiKey: "sk-lime-new" });
    await expect(
      rotateClientAccessToken("tenant-0001", "token-001"),
    ).resolves.toMatchObject({ apiKey: "sk-lime-rotated" });
    await expect(
      createClientOrder("tenant-0001", {
        planId: "plan-pro",
        paymentChannel: "epay",
        paymentMethod: "alipay",
        billingCycle: "monthly",
      }),
    ).resolves.toMatchObject({ id: "order-001" });
    await expect(
      createClientOrderCheckout("tenant-0001", "order-001", {
        paymentMethod: "alipay",
      }),
    ).resolves.toMatchObject({
      orderKind: "plan_order",
      checkoutUrl: "https://pay.example.com/submit.php?out_trade_no=order-001",
    });
    await expect(
      createClientCreditTopupOrder("tenant-0001", {
        packageId: "topup-100k",
        paymentChannel: "epay",
        paymentMethod: "alipay",
      }),
    ).resolves.toMatchObject({ id: "topup-order-001" });
    await expect(
      createClientCreditTopupOrderCheckout("tenant-0001", "topup-order-001", {
        paymentMethod: "alipay",
      }),
    ).resolves.toMatchObject({
      orderKind: "credit_topup_order",
      checkoutUrl:
        "https://pay.example.com/submit.php?out_trade_no=topup-order-001",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/orders",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          planId: "plan-pro",
          paymentChannel: "epay",
          paymentMethod: "alipay",
          billingCycle: "monthly",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/orders/order-001/checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ paymentMethod: "alipay" }),
      }),
    );
  });

  it("应解析云端激活聚合状态和订单详情", async () => {
    window.__LIME_SESSION_TOKEN__ = "session-token-001";

    const paymentConfig = {
      id: "pay-alipay",
      tenantId: "tenant-0001",
      provider: "epay",
      displayName: "易支付",
      notifyUrl: "https://user.limeai.run/pay/notify",
      returnUrl: "https://user.limeai.run/pay/return",
      enabled: true,
      methods: [{ key: "alipay", displayName: "支付宝", enabled: true }],
      providerOptions: { payAddress: "https://pay.example.com" },
      credentialMasks: { partnerId: "2088***0001" },
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z",
    };
    const plan = {
      id: "plan-pro",
      tenantId: "tenant-0001",
      key: "pro",
      name: "Pro",
      priceMonthly: 9900,
      creditsMonthly: 1000000,
      features: ["Anthropic-compatible coding"],
      status: "active",
      recommended: true,
      billingCycles: [],
      quotaSummaries: [],
      featureSections: [],
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z",
    };
    const creditAccount = {
      tenantId: "tenant-0001",
      userId: "user-001",
      balance: 120000,
      reserved: 0,
      currency: "credits",
      updatedAt: "2026-04-27T00:00:00.000Z",
    };
    const subscription = {
      id: "sub-001",
      tenantId: "tenant-0001",
      userId: "user-001",
      planId: "plan-pro",
      planKey: "pro",
      planName: "Pro",
      status: "active",
      currentPeriodStart: "2026-04-01T00:00:00.000Z",
      currentPeriodEnd: "2026-05-01T00:00:00.000Z",
      autoRenew: true,
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z",
    };
    const order = {
      id: "order-001",
      tenantId: "tenant-0001",
      userId: "user-001",
      planId: "plan-pro",
      planKey: "pro",
      planName: "Pro",
      amountCents: 9900,
      creditsGranted: 1000000,
      paymentChannel: "epay",
      paymentMethod: "alipay",
      checkoutUrl: "https://pay.example.com/submit.php?out_trade_no=order-001",
      status: "pending",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z",
    };
    const topupOrder = {
      id: "topup-order-001",
      tenantId: "tenant-0001",
      userId: "user-001",
      packageId: "topup-100k",
      packageName: "10 万积分包",
      creditsGranted: 100000,
      amountCents: 1900,
      paymentChannel: "epay",
      paymentMethod: "alipay",
      checkoutUrl:
        "https://pay.example.com/submit.php?out_trade_no=topup-order-001",
      status: "pending",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z",
    };
    const model = {
      id: "model-kimi-coding",
      offerId: "offer-limehub",
      modelId: "kimi-coding-plan",
      displayName: "Kimi Coding Plan",
      abilities: ["Coding", "Anthropic 协议"],
      recommended: true,
      status: "active",
      sort: 10,
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z",
    };
    const response = (data: unknown) => ({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, message: "success", data }),
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          gateway: {
            basePath: "https://llm.limeai.run",
            openAIBaseUrl: "https://llm.limeai.run/v1",
            anthropicBaseUrl: "https://llm.limeai.run",
            chatCompletionsPath: "/v1/chat/completions",
            authorizationHeader: "Authorization",
            authorizationScheme: "Bearer",
            tenantHeader: "X-Lime-Tenant-ID",
          },
          llmBaseUrl: "https://llm.limeai.run",
          openAIBaseUrl: "https://llm.limeai.run/v1",
          anthropicBaseUrl: "https://llm.limeai.run",
          readiness: {
            status: "payment_pending",
            title: "存在待支付订单",
            canInvoke: false,
            blockers: ["payment"],
            steps: [{ key: "payment", label: "支付确认", done: false }],
          },
          pendingPayment: {
            kind: "plan_order",
            orderId: "order-001",
            title: "Pro",
            paymentChannel: "epay",
            paymentReference:
              "https://pay.example.com/submit.php?out_trade_no=order-001",
            amountCents: 9900,
            status: "pending",
            createdAt: "2026-04-27T00:00:00.000Z",
            updatedAt: "2026-04-27T00:00:00.000Z",
          },
          paymentConfigs: [paymentConfig],
          plans: [plan],
          subscription,
          creditAccount,
          creditsDashboard: {
            creditAccount,
            subscription,
            topupPackages: [],
            creditWallets: [],
            creditOrders: [topupOrder],
          },
          topupPackages: [],
          usageDashboard: {
            usageRecords: [],
            monthlySummary: {},
          },
          billingDashboard: {
            billingSummary: { currency: "CNY" },
            subscription,
            currentPlan: {},
            orders: [order],
          },
          providerOffers: [
            {
              providerKey: "limehub",
              displayName: "LimeHub",
              source: "oem_cloud",
              state: "available_ready",
              visible: true,
              loggedIn: true,
              accountStatus: "logged_in",
              subscriptionStatus: "active",
              quotaStatus: "ok",
              canInvoke: true,
              effectiveAccessMode: "session",
              apiKeyModeEnabled: true,
              tenantOverrideApplied: false,
              configMode: "managed",
              modelsSource: "hub_catalog",
              developerAccessVisible: true,
              availableModelCount: 1,
              fallbackToLocalAllowed: false,
            },
          ],
          selectedOffer: {
            providerKey: "limehub",
            displayName: "LimeHub",
            source: "oem_cloud",
            state: "available_ready",
            visible: true,
            loggedIn: true,
            accountStatus: "logged_in",
            subscriptionStatus: "active",
            quotaStatus: "ok",
            canInvoke: true,
            effectiveAccessMode: "session",
            apiKeyModeEnabled: true,
            tenantOverrideApplied: false,
            configMode: "managed",
            modelsSource: "hub_catalog",
            developerAccessVisible: true,
            availableModelCount: 1,
            fallbackToLocalAllowed: false,
            access: {
              offerId: "offer-limehub",
              accessMode: "session",
              hubTokenEnabled: true,
            },
          },
          providerModels: [model],
          providerPreference: {
            tenantId: "tenant-0001",
            userId: "user-001",
            providerSource: "oem_cloud",
            providerKey: "limehub",
            needsValidation: false,
            updatedAt: "2026-04-27T00:00:00.000Z",
          },
          accessTokens: [],
          activeAccessToken: { hasActive: false },
          orders: [order],
          creditTopupOrders: [topupOrder],
        }),
      )
      .mockResolvedValueOnce(response(order))
      .mockResolvedValueOnce(response(topupOrder));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getClientCloudActivation("tenant-0001"),
    ).resolves.toMatchObject({
      openAIBaseUrl: "https://llm.limeai.run/v1",
      gateway: { tenantHeader: "X-Lime-Tenant-ID" },
      readiness: { status: "payment_pending" },
      pendingPayment: { orderId: "order-001" },
      providerModels: [{ modelId: "kimi-coding-plan" }],
      billingDashboard: { currentPlan: null },
    });
    await expect(
      getClientOrder("tenant-0001", "order-001"),
    ).resolves.toMatchObject({
      id: "order-001",
    });
    await expect(
      getClientCreditTopupOrder("tenant-0001", "topup-order-001"),
    ).resolves.toMatchObject({ id: "topup-order-001" });
  });

  it("客户端激活应容忍未开通订阅只返回状态摘要", async () => {
    window.__LIME_SESSION_TOKEN__ = "session-token-001";
    const response = (data: unknown) => ({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, message: "success", data }),
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(
      response({
        gateway: {
          basePath: "https://llm.limeai.run",
          openAIBaseUrl: "https://llm.limeai.run/v1",
        },
        readiness: {
          status: "ready",
          title: "云端状态已同步",
          canInvoke: true,
        },
        subscription: {
          id: "sub-empty",
          tenantId: "tenant-0001",
          status: "none",
          planName: "未开通",
        },
        usageDashboard: {
          usageRecords: [],
          monthlySummary: {},
        },
        billingDashboard: {
          billingSummary: { currency: "CNY" },
          subscription: {
            id: "sub-billing-empty",
            tenantId: "tenant-0001",
            status: "none",
          },
          currentPlan: null,
          orders: [],
        },
        providerOffers: [],
        providerModels: [],
        accessTokens: [],
        activeAccessToken: { hasActive: false },
        orders: [],
        creditTopupOrders: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getClientCloudActivation("tenant-0001"),
    ).resolves.toMatchObject({
      subscription: null,
      billingDashboard: {
        subscription: null,
        currentPlan: null,
      },
      readiness: { status: "ready" },
    });
  });
});
