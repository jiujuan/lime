import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import contentFactoryFixture from "@/features/agent-app/fixtures/content-factory-app.json";
import { buildCloudReleasePackageIdentity } from "@/features/agent-app/install/cloudBootstrap";
import { buildAgentAppPackageCacheEntry } from "@/features/agent-app/install/packageCache";
import { buildWorkflowRuntimeCapabilityProfile } from "@/features/agent-app/runtime/workflowRuntimeCapabilityProfile";
import type {
  AppManifest,
  CloudBootstrapApp,
  CloudBootstrapReleaseDescriptor,
} from "@/features/agent-app/types";
import {
  getAgentAppCloudCatalog,
  installLocalAgentAppPackage,
  launchAgentAppShell,
  listInstalledAgentApps,
  reviewCloudAgentAppRelease,
  reviewLocalAgentAppPackage,
  selectAgentAppDirectory,
  selectLocalAgentAppDirectory,
  startAgentAppUiRuntime,
  stopAgentAppUiRuntime,
  submitAgentAppRegistrationCode,
} from "./agentApps";

const LOCAL_APP_DIR = "/tmp/lime/content-factory-app";

const appServerRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/appServer", () => ({
  AppServerClient: vi.fn(() => ({
    request: appServerRequestMock,
  })),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

const PACKAGE_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MANIFEST_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function buildCloudApp(
  overrides: Partial<CloudBootstrapApp> = {},
): CloudBootstrapApp {
  return {
    appId: "content-factory-app",
    displayName: "内容工厂",
    version: "0.3.0",
    releaseId: "release-001",
    tenantId: "tenant-0001",
    tenantEnablementRef: "enablement-001",
    channel: "stable",
    signatureRef: "sigstore:content-factory-app@0.3.0",
    licenseState: "active",
    registrationRequired: false,
    registrationState: "not_required",
    enabled: true,
    packageUrl:
      "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
    packageHash: PACKAGE_HASH,
    manifestHash: MANIFEST_HASH,
    capabilityRequirements: {
      "lime.ui": "^0.3.0",
      "lime.storage": "^0.3.0",
    },
    defaultEntries: ["dashboard"],
    policyDefaults: {},
    toolAvailability: [],
    ...overrides,
  };
}

describe("agentApps API", () => {
  beforeEach(() => {
    vi.mocked(safeInvoke).mockReset();
    appServerRequestMock.mockReset();
    delete window.__LIME_BOOTSTRAP__;
    delete window.__LIME_OEM_CLOUD__;
    delete window.__LIME_SESSION_TOKEN__;
  });

  afterEach(() => {
    delete window.__LIME_BOOTSTRAP__;
    delete window.__LIME_OEM_CLOUD__;
    delete window.__LIME_SESSION_TOKEN__;
    vi.unstubAllGlobals();
  });

  it("选择本地 Agent App 目录时应使用系统目录选择器", async () => {
    vi.mocked(safeInvoke).mockResolvedValue({
      path: LOCAL_APP_DIR,
      cancelled: false,
    });

    await expect(
      selectLocalAgentAppDirectory({ title: "选择 Agent App 目录" }),
    ).resolves.toBe(LOCAL_APP_DIR);
    expect(safeInvoke).toHaveBeenCalledWith("agent_app_select_directory", {
      request: { title: "选择 Agent App 目录" },
    });
  });

  it("已安装 Agent App 列表应通过 App Server agentAppInstalled/list 读取", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        states: [
          {
            appId: "content-factory-app",
            disabled: false,
          },
        ],
        issues: [],
      },
    });

    await expect(listInstalledAgentApps()).resolves.toEqual({
      states: [
        expect.objectContaining({
          appId: "content-factory-app",
          disabled: false,
        }),
      ],
      issues: [],
    });

    expect(appServerRequestMock).toHaveBeenCalledWith(
      "agentAppInstalled/list",
      {},
    );
    expect(safeInvoke).not.toHaveBeenCalledWith("agent_app_list_installed");
  });

  it("已安装 Agent App 列表缺少必需 result 时不应回退 legacy", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        issues: [],
      },
    });

    await expect(listInstalledAgentApps()).rejects.toThrow(
      "App Server agentAppInstalled/list did not return states",
    );

    appServerRequestMock.mockReset();
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        states: [],
      },
    });

    await expect(listInstalledAgentApps()).rejects.toThrow(
      "App Server agentAppInstalled/list did not return issues",
    );

    expect(safeInvoke).not.toHaveBeenCalledWith("agent_app_list_installed");
  });

  it("安装本地非企业定制 Agent App 时应保存 resolved setup 后的可启动 readiness", async () => {
    const manifest = {
      ...(contentFactoryFixture as AppManifest),
      name: "local-test-app",
      displayName: "本地测试 App",
    } satisfies AppManifest;
    const inspectedAt = "2026-05-15T00:00:00.000Z";
    vi.mocked(safeInvoke).mockImplementation(async (command, args) => {
      if (command === "agent_app_inspect_local_package") {
        return {
          sourceKind: "local_folder",
          sourceUri: LOCAL_APP_DIR,
          appDir: LOCAL_APP_DIR,
          appMarkdown: "",
          manifest,
          manifestHash: "manifest-local-1",
          packageHash: "package-local-1",
          inspectedAt,
        };
      }
      if (command === "agent_app_save_installed_state") {
        return (args as { request: { state: unknown } }).request.state;
      }
      throw new Error(`unexpected command ${command}`);
    });

    const state = await installLocalAgentAppPackage({
      appDir: LOCAL_APP_DIR,
      profile: buildWorkflowRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
        workerRuntimeEnabled: true,
      }),
    });

    expect(state).toMatchObject({
      appId: "local-test-app",
      disabled: false,
      identity: {
        packageHash: "package-local-1",
        manifestHash: "manifest-local-1",
      },
      readiness: {
        status: "degraded",
        blockers: [],
      },
    });
    expect(state.setup).toMatchObject({
      knowledgeBindings: {
        project_knowledge: true,
      },
      skills: {
        "article-writer": true,
      },
      tools: {
        document_parser: true,
      },
      workflows: {
        content_scenario_planning: true,
      },
    });
    expect(
      state.readiness.warnings.some((issue) => issue.required === true),
    ).toBe(false);
    expect(safeInvoke).toHaveBeenNthCalledWith(
      1,
      "agent_app_inspect_local_package",
      {
        appDir: LOCAL_APP_DIR,
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      2,
      "agent_app_save_installed_state",
      {
        request: {
          state: expect.objectContaining({
            appId: "local-test-app",
            readiness: expect.objectContaining({
              status: "degraded",
              blockers: [],
            }),
          }),
        },
      },
    );
  });

  it("本地安装 content-factory-app 时未激活注册码应阻断 sideload", async () => {
    const manifest = contentFactoryFixture as AppManifest;
    const inspectedAt = "2026-05-15T00:00:00.000Z";
    vi.mocked(safeInvoke).mockImplementation(async (command) => {
      if (command === "agent_app_inspect_local_package") {
        return {
          sourceKind: "local_folder",
          sourceUri: LOCAL_APP_DIR,
          appDir: LOCAL_APP_DIR,
          appMarkdown: "",
          manifest,
          manifestHash: "manifest-local-1",
          packageHash: "package-local-1",
          inspectedAt,
        };
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(
      installLocalAgentAppPackage({
        appDir: LOCAL_APP_DIR,
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    ).rejects.toMatchObject({
      name: "AgentAppRegistrationRequiredError",
    });
    expect(safeInvoke).toHaveBeenCalledTimes(1);
  });

  it("审查本地非企业定制 Agent App 时不应写入 installed state", async () => {
    const manifest = {
      ...(contentFactoryFixture as AppManifest),
      name: "local-review-app",
      displayName: "本地审查 App",
    } satisfies AppManifest;
    const inspectedAt = "2026-05-15T00:00:00.000Z";
    vi.mocked(safeInvoke).mockImplementation(async (command) => {
      if (command === "agent_app_inspect_local_package") {
        return {
          sourceKind: "local_folder",
          sourceUri: LOCAL_APP_DIR,
          appDir: LOCAL_APP_DIR,
          appMarkdown: "",
          manifest,
          manifestHash: "manifest-local-review",
          packageHash: "package-local-review",
          inspectedAt,
        };
      }
      throw new Error(`unexpected command ${command}`);
    });

    const result = await reviewLocalAgentAppPackage({
      appDir: LOCAL_APP_DIR,
      profile: buildWorkflowRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
        workerRuntimeEnabled: true,
      }),
    });

    expect(result.review).toMatchObject({
      appId: "local-review-app",
      sourceKind: "local_folder",
      sourceState: {
        kind: "local-selected",
        canReview: true,
      },
      packageHash: "package-local-review",
      manifestHash: "manifest-local-review",
      readinessStatus: "degraded",
    });
    expect(result.state).toMatchObject({
      appId: "local-review-app",
      identity: {
        packageHash: "package-local-review",
        manifestHash: "manifest-local-review",
      },
    });
    expect(safeInvoke).toHaveBeenCalledTimes(1);
  });

  it("审查 Cloud release 时缺少 verified package source 应阻断", async () => {
    await expect(
      reviewCloudAgentAppRelease({
        app: buildCloudApp(),
        skipPackageFetch: true,
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    ).rejects.toThrow("missing a verified package source");
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("审查 Cloud release 时应通过集中命令 fetch package 并生成 review", async () => {
    vi.mocked(safeInvoke).mockImplementation(async (command, args) => {
      if (command === "agent_app_fetch_cloud_package") {
        const descriptor = (
          args as {
            request: { descriptor: CloudBootstrapReleaseDescriptor };
          }
        ).request.descriptor;
        return buildAgentAppPackageCacheEntry({
          identity: descriptor.identity,
          manifestSnapshot: contentFactoryFixture,
          actualPackageHash: PACKAGE_HASH,
          actualManifestHash: MANIFEST_HASH,
          cachedAt: descriptor.loadedAt,
        });
      }
      throw new Error(`unexpected command ${command}`);
    });

    const result = await reviewCloudAgentAppRelease({
      app: buildCloudApp(),
      profile: buildWorkflowRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
        workerRuntimeEnabled: true,
      }),
      catalogSource: "remote",
    });

    expect(result.review).toMatchObject({
      appId: "content-factory-app",
      sourceKind: "cloud_release",
      packageVerificationStatus: "verified",
      sourceState: {
        kind: "cloud-discovered",
        canReview: true,
      },
    });
    expect(safeInvoke).toHaveBeenCalledWith("agent_app_fetch_cloud_package", {
      request: {
        descriptor: expect.objectContaining({
          appId: "content-factory-app",
          packageUrl:
            "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
          packageHash: PACKAGE_HASH,
          manifestHash: MANIFEST_HASH,
        }),
      },
    });
  });

  it("审查 Cloud release 时可从 verified package cache 生成 review", async () => {
    const app = buildCloudApp();
    const identity = buildCloudReleasePackageIdentity({
      app,
      loadedAt: "2026-05-15T00:00:00.000Z",
    });
    const packageCacheEntry = buildAgentAppPackageCacheEntry({
      identity,
      manifestSnapshot: contentFactoryFixture,
      actualPackageHash: PACKAGE_HASH,
      actualManifestHash: MANIFEST_HASH,
      cachedAt: "2026-05-15T00:00:00.000Z",
    });

    const result = await reviewCloudAgentAppRelease({
      app,
      packageCacheEntry,
      profile: buildWorkflowRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
        workerRuntimeEnabled: true,
      }),
      catalogSource: "remote",
    });

    expect(result.review).toMatchObject({
      appId: "content-factory-app",
      sourceKind: "cloud_release",
      packageVerificationStatus: "verified",
      sourceState: {
        kind: "cloud-discovered",
        canReview: true,
      },
    });
    expect(result.state.identity).toMatchObject({
      sourceKind: "cloud_release",
      packageHash: PACKAGE_HASH,
      manifestHash: MANIFEST_HASH,
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("审查 Cloud release 时应从 verified package 生成 review 而不是写入 repository", async () => {
    const result = await reviewCloudAgentAppRelease({
      app: buildCloudApp(),
      packageManifest: contentFactoryFixture,
      profile: buildWorkflowRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
        workerRuntimeEnabled: true,
      }),
      catalogSource: "remote",
    });

    expect(result.review).toMatchObject({
      appId: "content-factory-app",
      sourceKind: "cloud_release",
      sourceUri:
        "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
      packageUrl:
        "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
      releaseId: "release-001",
      releaseChannel: "stable",
      tenantEnablementRef: "enablement-001",
      signatureRef: "sigstore:content-factory-app@0.3.0",
      packageHash: PACKAGE_HASH,
      manifestHash: MANIFEST_HASH,
      packageVerificationStatus: "verified",
      sourceState: {
        kind: "cloud-discovered",
        canReview: true,
      },
    });
    expect(result.state).toMatchObject({
      appId: "content-factory-app",
      identity: {
        sourceKind: "cloud_release",
        releaseId: "release-001",
        packageHash: PACKAGE_HASH,
        manifestHash: MANIFEST_HASH,
      },
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("审查 Cloud release 时 verified cache hash mismatch 必须阻断", async () => {
    const app = buildCloudApp();
    const identity = buildCloudReleasePackageIdentity({
      app,
      loadedAt: "2026-05-15T00:00:00.000Z",
    });
    const packageCacheEntry = buildAgentAppPackageCacheEntry({
      identity,
      manifestSnapshot: contentFactoryFixture,
      actualPackageHash:
        "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      actualManifestHash: MANIFEST_HASH,
    });

    await expect(
      reviewCloudAgentAppRelease({
        app,
        packageCacheEntry,
      }),
    ).rejects.toThrow("Agent App package hash does not match package identity");
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("审查 Cloud release 时 hash mismatch 必须阻断安装审查", async () => {
    await expect(
      reviewCloudAgentAppRelease({
        app: buildCloudApp(),
        packageManifest: contentFactoryFixture,
        actualPackageHash:
          "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      }),
    ).rejects.toThrow("Agent App package hash does not match package identity");
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("应从 LimeCore client/agent-apps 读取真实云端目录", async () => {
    window.__LIME_OEM_CLOUD__ = {
      enabled: true,
      baseUrl: "https://user.limeai.run",
      tenantId: "tenant-0001",
    };
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
              packageHash: PACKAGE_HASH,
              manifestHash: MANIFEST_HASH,
              capabilityRequirements: {
                "lime.ui": "^0.3.0",
                "lime.storage": "^0.3.0",
              },
              defaultEntries: ["dashboard"],
              policyDefaults: {
                allowServerAssisted: false,
              },
              toolAvailability: [
                { key: "document_parser", status: "available", required: true },
              ],
            },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getAgentAppCloudCatalog();

    expect(result.source).toBe("remote");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/agent-apps",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer session-token-001",
        }),
      }),
    );
    expect(result.payload.apps[0]).toMatchObject({
      appId: "content-factory-app",
      releaseId: "release-001",
      packageHash: PACKAGE_HASH,
      manifestHash: MANIFEST_HASH,
    });
  });

  it("应通过 LimeCore 注册码接口激活企业定制 Agent App", async () => {
    window.__LIME_OEM_CLOUD__ = {
      enabled: true,
      baseUrl: "https://user.limeai.run",
      tenantId: "tenant-0001",
    };
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
          generatedAt: "2026-05-15T00:01:00.000Z",
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
              packageHash: PACKAGE_HASH,
              manifestHash: MANIFEST_HASH,
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

    const result = await submitAgentAppRegistrationCode(
      "content-factory-app",
      "CF-REG-2026",
    );

    expect(result.source).toBe("remote");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/agent-apps/content-factory-app/registration",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "CF-REG-2026" }),
      }),
    );
    expect(result.payload.apps[0]).toMatchObject({
      registrationRequired: true,
      registrationState: "active",
      packageHash: PACKAGE_HASH,
    });
  });

  it("无云端上下文时 seeded content-factory-app 也必须先注册码激活", async () => {
    const result = await getAgentAppCloudCatalog();

    expect(result.source).toBe("seeded");
    expect(result.payload.apps[0]).toMatchObject({
      appId: "content-factory-app",
      registrationRequired: true,
      registrationState: "required",
      enabled: false,
      packageUrl: "",
      packageHash: "",
      manifestHash: "",
    });
  });

  it("远端不可用时应使用 bootstrap 中缓存的 Agent App 目录", async () => {
    window.__LIME_OEM_CLOUD__ = {
      enabled: true,
      baseUrl: "https://user.limeai.run",
      tenantId: "tenant-0001",
    };
    window.__LIME_SESSION_TOKEN__ = "session-token-001";
    window.__LIME_BOOTSTRAP__ = {
      data: {
        agentAppCatalog: {
          schemaVersion: "agent-app-cloud-bootstrap/v1",
          tenantId: "tenant-0001",
          generatedAt: "2026-05-15T00:00:00.000Z",
          apps: [
            {
              appId: "content-factory-app",
              displayName: "内容工厂",
              version: "0.3.0",
              releaseId: "release-bootstrap",
              enabled: true,
              packageUrl:
                "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
              packageHash: PACKAGE_HASH,
              manifestHash: MANIFEST_HASH,
              capabilityRequirements: {},
              defaultEntries: ["dashboard"],
              policyDefaults: {},
              toolAvailability: [],
            },
          ],
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ message: "unavailable" }),
      })),
    );

    const result = await getAgentAppCloudCatalog();

    expect(result.source).toBe("bootstrap");
    expect(result.payload.apps[0]?.releaseId).toBe("release-bootstrap");
  });

  it("Agent App UI runtime 网关应使用嵌套 request 调用 current 命令", async () => {
    vi.mocked(safeInvoke).mockImplementation(async (command) => {
      if (command === "agent_app_start_ui_runtime") {
        return {
          appId: "content-factory-app",
          status: "running",
          baseUrl: "http://127.0.0.1:4199",
          entryUrl: "http://127.0.0.1:4199/dashboard",
          entryKey: "dashboard",
          route: "/dashboard",
        };
      }
      if (command === "agent_app_stop_ui_runtime") {
        return {
          appId: "content-factory-app",
          status: "stopped",
        };
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(
      startAgentAppUiRuntime({
        appId: "content-factory-app",
        entryKey: "dashboard",
      }),
    ).resolves.toMatchObject({
      status: "running",
      entryUrl: "http://127.0.0.1:4199/dashboard",
    });
    await expect(
      stopAgentAppUiRuntime({ appId: "content-factory-app" }),
    ).resolves.toMatchObject({ status: "stopped" });

    expect(safeInvoke).toHaveBeenNthCalledWith(
      1,
      "agent_app_start_ui_runtime",
      {
        request: {
          appId: "content-factory-app",
          entryKey: "dashboard",
        },
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(2, "agent_app_stop_ui_runtime", {
      request: {
        appId: "content-factory-app",
      },
    });
  });

  it("Agent App 宿主目录选择网关应走 current Desktop Host 命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValue({
      path: LOCAL_APP_DIR,
      cancelled: false,
    });

    await expect(
      selectAgentAppDirectory({ title: "选择应用目录" }),
    ).resolves.toMatchObject({
      path: LOCAL_APP_DIR,
      cancelled: false,
    });
    expect(safeInvoke).toHaveBeenCalledWith("agent_app_select_directory", {
      request: { title: "选择应用目录" },
    });
  });

  it("Agent App Shell launch 网关应通过 current 命令提交 descriptor", async () => {
    const descriptor = {
      descriptorVersion: 1,
      appId: "content-factory-app",
      packageHash: PACKAGE_HASH,
      manifestHash: MANIFEST_HASH,
      installMode: "standalone",
      runtimeProfile: {
        runtimeId: "lime-runtime-local",
        runtimeVersion: "0.8.0",
        shellKind: "app_shell",
        installMode: "standalone",
      },
      entry: {
        entryKey: "dashboard",
        kind: "page",
        title: "首页",
        route: "/dashboard",
      },
      isolation: {
        packageMount: "read-only",
        secrets: "refs-only",
        sideEffects: "runtime-broker",
        evidence: "runtime-provenance",
        storageNamespace: "content-factory-app",
      },
      branding: {
        name: "内容工厂",
        windowTitle: "内容工厂",
      },
      packageIdentity: {
        sourceKind: "local_folder",
        sourceUri: LOCAL_APP_DIR,
        appId: "content-factory-app",
        appVersion: "0.8.0",
        packageHash: PACKAGE_HASH,
        manifestHash: MANIFEST_HASH,
        loadedAt: "2026-05-15T00:00:00.000Z",
      },
    } as const;
    vi.mocked(safeInvoke).mockResolvedValue({
      appId: "content-factory-app",
      status: "launched",
      installMode: "standalone",
      shellKind: "app_shell",
      descriptorVersion: 1,
      devShell: true,
      blockerCodes: [],
      launchedAt: "2026-05-15T00:00:00.000Z",
    });

    await expect(launchAgentAppShell({ descriptor })).resolves.toMatchObject({
      status: "launched",
      devShell: true,
    });
    expect(safeInvoke).toHaveBeenCalledWith("agent_app_launch_shell", {
      request: { descriptor },
    });
  });
});
