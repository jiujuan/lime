import { Buffer } from "node:buffer";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import contentFactoryFixture from "@/features/agent-app/fixtures/content-factory-app.json";
import seededAgentAppsFixture from "@/features/agent-app/fixtures/seeded-agent-apps.json";
import { buildCloudReleasePackageIdentity } from "@/features/agent-app/install/cloudBootstrap";
import {
  buildCloudReleaseSignaturePayload,
  verifyCloudReleaseSignature,
} from "@/features/agent-app/install/cloudReleaseSignature";
import { buildAgentAppPackageCacheEntry } from "@/features/agent-app/install/packageCache";
import { buildWorkflowRuntimeCapabilityProfile } from "@/features/agent-app/runtime/workflowRuntimeCapabilityProfile";
import type { ShellDescriptor } from "@/features/agent-app/shell";
import type {
  AgentAppCloudReleaseSignatureProof,
  AgentAppCloudReleaseSignatureTrustRoot,
  AppManifest,
  CloudBootstrapApp,
  CloudBootstrapReleaseDescriptor,
} from "@/features/agent-app/types";
import {
  getAgentAppCloudCatalog,
  installCloudAgentAppRelease,
  installLocalAgentAppPackage,
  launchAgentAppShell,
  listAgentAppHostLifecycleSnapshots,
  listInstalledAgentApps,
  prepareAgentAppShellForAppServerTestOnly,
  previewAgentAppUninstall,
  reviewCloudAgentAppRelease,
  reviewLocalAgentAppPackage,
  saveInstalledAgentAppState,
  selectAgentAppDirectory,
  selectLocalAgentAppDirectory,
  setAgentAppDisabled,
  getAgentAppUiRuntimeStatus,
  startAgentAppUiRuntime,
  stopAgentAppUiRuntime,
  submitAgentAppRegistrationCode,
  uninstallAgentApp,
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
const LOCAL_PLUGIN_MANIFEST = {
  schemaVersion: "lime.plugin.package.v1",
  id: "content-factory-app",
  version: "2.0.0",
  contributions: {
    runtime: "./app.runtime.yaml",
  },
};

function buildCloudApp(
  overrides: Partial<CloudBootstrapApp> = {},
): CloudBootstrapApp {
  return {
    appId: "content-factory-app",
    displayName: "内容工厂",
    version: "2.0.0",
    releaseId: "release-001",
    tenantId: "tenant-0001",
    tenantEnablementRef: "enablement-001",
    channel: "stable",
    signatureRef: "sigstore:content-factory-app@2.0.0",
    licenseState: "active",
    registrationRequired: false,
    registrationState: "not_required",
    enabled: true,
    packageUrl:
      "https://packages.limecloud.example/apps/content-factory-app-2.0.0.lapp",
    packageHash: PACKAGE_HASH,
    manifestHash: MANIFEST_HASH,
    capabilityRequirements: {
      "lime.ui": "^0.11.0",
      "lime.storage": "^0.11.0",
    },
    defaultEntries: ["content_factory"],
    policyDefaults: {},
    toolAvailability: [],
    ...overrides,
  };
}

function buildShellDescriptor(): ShellDescriptor {
  return {
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
  };
}

async function buildSignedCloudApp(): Promise<{
  app: CloudBootstrapApp;
  trustRoot: AgentAppCloudReleaseSignatureTrustRoot;
}> {
  const app = buildCloudApp();
  const keyPair = await webcrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  if (!("privateKey" in keyPair) || !("publicKey" in keyPair)) {
    throw new Error("RSA key generation did not return a key pair");
  }
  const proofDraft: AgentAppCloudReleaseSignatureProof = {
    schemaVersion: "agent-app-cloud-release-signature/v1",
    publicKeyId: "agent-app-root-2026",
    algorithm: "RSASSA-PKCS1-v1_5-SHA256",
    signature: "",
    signedAt: "2026-06-24T00:00:00.000Z",
  };
  const signature = await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(
      buildCloudReleaseSignaturePayload({
        ...app,
        signatureProof: proofDraft,
      }),
    ),
  );
  const publicKey = await webcrypto.subtle.exportKey("spki", keyPair.publicKey);

  return {
    app: {
      ...app,
      signatureProof: {
        ...proofDraft,
        signature: Buffer.from(new Uint8Array(signature)).toString("base64"),
      },
    },
    trustRoot: {
      publicKeyId: "agent-app-root-2026",
      algorithm: "RSASSA-PKCS1-v1_5-SHA256",
      publicKey: Buffer.from(new Uint8Array(publicKey)).toString("base64"),
      appIds: [app.appId],
    },
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

  it("宿主生命周期 snapshot 应通过 App Server current 方法读取", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        snapshots: [
          {
            appId: "content-factory-app",
            displayName: "内容工厂",
            profiles: ["workbench"],
            appCenterStatus: "ready",
            readinessStatus: "ready",
            rightSurface: {
              dock: "right",
              physicalDockCount: 1,
              defaultActiveTab: "articleWorkspace",
              supportedTabs: ["articleWorkspace"],
              articleWorkspace: {
                enabled: true,
                objects: [],
                panes: [],
                rendererKinds: [],
              },
              historyRestore: {
                enabled: true,
                defaultTab: "articleWorkspace",
                defaultPane: "artifact",
                restoreSelection: true,
                restoreLayout: true,
                fallback: "artifactPreview",
              },
            },
            functions: [],
            taskRuntime: {
              enabled: true,
              workerEntrypoint: "./src/runtime/content-factory-worker.mjs",
              contractPath: "./app.runtime.yaml",
              sampleRequestPath: "./examples/runtime-request.sample.json",
              outputArtifactKind: "content_factory.workspace_patch",
              taskKinds: ["content.factory.generate"],
              directProviderAccess: false,
              directFilesystemAccess: false,
              blockers: [],
              followUps: [],
            },
            blockers: [],
            followUps: [],
            generatedAt: "2026-06-23T00:00:00.000Z",
          },
        ],
        issues: [],
      },
    });

    await expect(listAgentAppHostLifecycleSnapshots()).resolves.toEqual({
      snapshots: [
        expect.objectContaining({
          appId: "content-factory-app",
          appCenterStatus: "ready",
        }),
      ],
      issues: [],
    });

    expect(appServerRequestMock).toHaveBeenCalledWith(
      "agentAppHostLifecycle/list",
      {},
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "agent_app_list_installed",
      expect.anything(),
    );
  });

  it("宿主生命周期 snapshot 返回格式非法时不应回退 legacy", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        issues: [],
      },
    });

    await expect(listAgentAppHostLifecycleSnapshots()).rejects.toThrow(
      "App Server agentAppHostLifecycle/list did not return snapshots",
    );
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("安装本地非企业定制 Agent App 时应保存 resolved setup 后的可启动 readiness", async () => {
    const manifest = {
      ...(contentFactoryFixture as AppManifest),
      name: "local-test-app",
      displayName: "本地测试 App",
    } satisfies AppManifest;
    const inspectedAt = "2026-05-15T00:00:00.000Z";
    appServerRequestMock.mockImplementation(async (method, args) => {
      if (method === "agentAppLocalPackage/inspect") {
        return {
          result: {
            sourceKind: "local_folder",
            sourceUri: LOCAL_APP_DIR,
            appDir: LOCAL_APP_DIR,
            manifestSource: "plugin_json",
            pluginManifest: LOCAL_PLUGIN_MANIFEST,
            manifest,
            manifestHash: "manifest-local-1",
            packageHash: "package-local-1",
            inspectedAt,
          },
        };
      }
      if (method === "agentAppInstalled/save") {
        return { result: (args as { state: unknown }).state };
      }
      throw new Error(`unexpected method ${method}`);
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
      knowledgeBindings: {},
      skills: {},
      tools: {},
      workflows: {},
    });
    expect(
      state.readiness.warnings.some((issue) => issue.required === true),
    ).toBe(false);
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      1,
      "agentAppLocalPackage/inspect",
      {
        appDir: LOCAL_APP_DIR,
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      2,
      "agentAppInstalled/save",
      {
        state: expect.objectContaining({
          appId: "local-test-app",
          readiness: expect.objectContaining({
            status: "degraded",
            blockers: [],
          }),
        }),
      },
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "agent_app_inspect_local_package",
      expect.anything(),
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "agent_app_save_installed_state",
      expect.anything(),
    );
  });

  it("本地安装 content-factory-app 开发仓不再要求云端注册码", async () => {
    const manifest = contentFactoryFixture as AppManifest;
    const inspectedAt = "2026-05-15T00:00:00.000Z";
    appServerRequestMock.mockImplementation(async (method, params) => {
      if (method === "agentAppLocalPackage/inspect") {
        return {
          result: {
            sourceKind: "local_folder",
            sourceUri: LOCAL_APP_DIR,
            appDir: LOCAL_APP_DIR,
            manifestSource: "plugin_json",
            pluginManifest: LOCAL_PLUGIN_MANIFEST,
            manifest,
            manifestHash: "manifest-local-1",
            packageHash: "package-local-1",
            inspectedAt,
          },
        };
      }
      if (method === "agentAppInstalled/save") {
        return {
          result: (params as { state: unknown }).state,
        };
      }
      throw new Error(`unexpected method ${method}`);
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
    ).resolves.toMatchObject({
      appId: "content-factory-app",
      disabled: false,
    });
    expect(appServerRequestMock).toHaveBeenCalledWith(
      "agentAppLocalPackage/inspect",
      { appDir: LOCAL_APP_DIR },
    );
    expect(appServerRequestMock).toHaveBeenCalledWith(
      "agentAppInstalled/save",
      {
        state: expect.objectContaining({
          appId: "content-factory-app",
        }),
      },
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "agent_app_inspect_local_package",
      expect.anything(),
    );
  });

  it("本地企业定制 Agent App 未激活注册码时应阻断 sideload", async () => {
    const manifest: AppManifest & {
      metadata: { distribution: "enterprise_custom" };
    } = {
      ...(contentFactoryFixture as AppManifest),
      name: "enterprise-custom-app",
      displayName: "企业定制 App",
      metadata: {
        distribution: "enterprise_custom",
      },
    };
    const inspectedAt = "2026-05-15T00:00:00.000Z";
    appServerRequestMock.mockImplementation(async (method) => {
      if (method === "agentAppLocalPackage/inspect") {
        return {
          result: {
            sourceKind: "local_folder",
            sourceUri: LOCAL_APP_DIR,
            appDir: LOCAL_APP_DIR,
            manifestSource: "plugin_json",
            pluginManifest: LOCAL_PLUGIN_MANIFEST,
            manifest,
            manifestHash: "manifest-local-1",
            packageHash: "package-local-1",
            inspectedAt,
          },
        };
      }
      throw new Error(`unexpected method ${method}`);
    });

    await expect(
      reviewLocalAgentAppPackage({
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
    expect(appServerRequestMock).toHaveBeenCalledTimes(1);
  });

  it("审查本地非企业定制 Agent App 时不应写入 installed state", async () => {
    const manifest = {
      ...(contentFactoryFixture as AppManifest),
      name: "local-review-app",
      displayName: "本地审查 App",
    } satisfies AppManifest;
    const inspectedAt = "2026-05-15T00:00:00.000Z";
    appServerRequestMock.mockImplementation(async (method) => {
      if (method === "agentAppLocalPackage/inspect") {
        return {
          result: {
            sourceKind: "local_folder",
            sourceUri: LOCAL_APP_DIR,
            appDir: LOCAL_APP_DIR,
            manifestSource: "plugin_json",
            pluginManifest: LOCAL_PLUGIN_MANIFEST,
            manifest,
            manifestHash: "manifest-local-review",
            packageHash: "package-local-review",
            inspectedAt,
          },
        };
      }
      throw new Error(`unexpected method ${method}`);
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
    expect(appServerRequestMock).toHaveBeenCalledTimes(1);
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "agent_app_inspect_local_package",
      expect.anything(),
    );
  });

  it("Agent App package / install 命令遇到 diagnostic facade 时应 fail closed", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      diagnostic: {
        source: "electron-host-diagnostic",
        command: "agentAppLocalPackage/inspect",
        status: "degraded",
      },
    });

    await expect(
      reviewLocalAgentAppPackage({
        appDir: LOCAL_APP_DIR,
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    ).rejects.toThrow("agentAppLocalPackage/inspect did not return appDir");
    expect(appServerRequestMock).toHaveBeenCalledTimes(1);
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "agent_app_inspect_local_package",
      expect.anything(),
    );
  });

  it("审查本地 Agent App 时 inspect 返回非 package inspection 应 fail closed", async () => {
    appServerRequestMock.mockResolvedValueOnce({ result: { success: true } });

    await expect(
      reviewLocalAgentAppPackage({
        appDir: LOCAL_APP_DIR,
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    ).rejects.toThrow("agentAppLocalPackage/inspect did not return appDir");
    expect(appServerRequestMock).toHaveBeenCalledTimes(1);
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "agent_app_inspect_local_package",
      expect.anything(),
    );
  });

  it("安装本地 Agent App 时 save installed state 返回非 state 应 fail closed", async () => {
    const state = (
      await reviewCloudAgentAppRelease({
        app: buildCloudApp(),
        packageManifest: contentFactoryFixture,
      })
    ).state;
    appServerRequestMock.mockResolvedValueOnce({ result: { success: true } });

    await expect(saveInstalledAgentAppState({ state })).rejects.toThrow(
      "agentAppInstalled/save did not return appId",
    );
    expect(appServerRequestMock).toHaveBeenCalledWith(
      "agentAppInstalled/save",
      {
        state,
      },
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "agent_app_save_installed_state",
      expect.anything(),
    );
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

  it("审查 Cloud release 时 fetch package 返回非 cache entry 应 fail closed", async () => {
    appServerRequestMock.mockResolvedValueOnce({ result: { success: true } });

    await expect(
      reviewCloudAgentAppRelease({
        app: buildCloudApp(),
        profile: buildWorkflowRuntimeCapabilityProfile({
          realAdapterEnabled: true,
          uiRuntimeEnabled: true,
          workerRuntimeEnabled: true,
        }),
      }),
    ).rejects.toThrow("agentAppPackage/fetchCloud did not return appId");
  });

  it("审查 Cloud release 时应通过集中命令 fetch package 并生成 review", async () => {
    appServerRequestMock.mockImplementation(async (method, args) => {
      if (method === "agentAppPackage/fetchCloud") {
        const descriptor = (
          args as {
            descriptor: CloudBootstrapReleaseDescriptor;
          }
        ).descriptor;
        return {
          result: buildAgentAppPackageCacheEntry({
            identity: descriptor.identity,
            manifestSnapshot: contentFactoryFixture,
            actualPackageHash: PACKAGE_HASH,
            actualManifestHash: MANIFEST_HASH,
            cachedAt: descriptor.loadedAt,
          }),
        };
      }
      throw new Error(`unexpected method ${method}`);
    });

    const result = await reviewCloudAgentAppRelease({
      app: buildCloudApp(),
      profile: buildWorkflowRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
        workerRuntimeEnabled: true,
      }),
      catalogSource: "remote",
      signatureVerificationStatus: "verified",
    });

    expect(result.review).toMatchObject({
      appId: "content-factory-app",
      sourceKind: "cloud_release",
      packageVerificationStatus: "verified",
      releaseEvidence: {
        status: "ready",
        sourceKind: "fetched_package",
        catalogSource: "remote",
        packageHashMatched: true,
        manifestHashMatched: true,
        blockerCodes: [],
        warningCodes: [],
      },
      sourceState: {
        kind: "cloud-discovered",
        canReview: true,
      },
    });
    expect(appServerRequestMock).toHaveBeenCalledWith(
      "agentAppPackage/fetchCloud",
      {
        descriptor: expect.objectContaining({
          appId: "content-factory-app",
          packageUrl:
            "https://packages.limecloud.example/apps/content-factory-app-2.0.0.lapp",
          packageHash: PACKAGE_HASH,
          manifestHash: MANIFEST_HASH,
        }),
      },
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "agent_app_fetch_cloud_package",
      expect.anything(),
    );
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
      signatureVerificationStatus: "verified",
    });

    expect(result.review).toMatchObject({
      appId: "content-factory-app",
      sourceKind: "cloud_release",
      packageVerificationStatus: "verified",
      releaseEvidence: {
        status: "ready",
        sourceKind: "verified_cache",
        catalogSource: "remote",
        packageHashMatched: true,
        manifestHashMatched: true,
      },
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
      signatureVerificationStatus: "verified",
    });

    expect(result.review).toMatchObject({
      appId: "content-factory-app",
      sourceKind: "cloud_release",
      sourceUri:
        "https://packages.limecloud.example/apps/content-factory-app-2.0.0.lapp",
      packageUrl:
        "https://packages.limecloud.example/apps/content-factory-app-2.0.0.lapp",
      releaseId: "release-001",
      releaseChannel: "stable",
      tenantEnablementRef: "enablement-001",
      signatureRef: "sigstore:content-factory-app@2.0.0",
      packageHash: PACKAGE_HASH,
      manifestHash: MANIFEST_HASH,
      packageVerificationStatus: "verified",
      releaseEvidence: {
        status: "warning",
        sourceKind: "explicit_manifest",
        catalogSource: "remote",
        packageHashMatched: null,
        manifestHashMatched: null,
        signatureVerificationStatus: "verified",
        warningCodes: ["package_hash_unverified", "manifest_hash_unverified"],
      },
      sourceState: {
        kind: "release-evidence-warning",
        canReview: true,
        reason: "MANIFEST_HASH_UNVERIFIED, PACKAGE_HASH_UNVERIFIED",
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

  it("审查 remote Cloud release 时应由可信根验证 signatureProof", async () => {
    const { app, trustRoot } = await buildSignedCloudApp();
    await expect(
      verifyCloudReleaseSignature({
        app,
        trustRoots: [trustRoot],
        crypto: webcrypto as unknown as Crypto,
      }),
    ).resolves.toBe("verified");

    const result = await reviewCloudAgentAppRelease({
      app,
      packageManifest: contentFactoryFixture,
      actualPackageHash: PACKAGE_HASH,
      actualManifestHash: MANIFEST_HASH,
      profile: buildWorkflowRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
        workerRuntimeEnabled: true,
      }),
      catalogSource: "remote",
      signatureTrustRoots: [trustRoot],
      signatureCrypto: webcrypto as unknown as Crypto,
    });

    expect(result.review.releaseEvidence).toMatchObject({
      status: "ready",
      catalogSource: "remote",
      signaturePolicy: "required",
      signatureVerificationStatus: "verified",
      packageHashMatched: true,
      manifestHashMatched: true,
      blockerCodes: [],
      warningCodes: [],
    });
    expect(result.state.setup).toMatchObject({
      cloudReleaseEvidence: {
        status: "ready",
        signaturePolicy: "required",
        signatureVerificationStatus: "verified",
        packageHashMatched: true,
        manifestHashMatched: true,
        packageVerificationStatus: "verified",
      },
    });
  });

  it("审查 remote Cloud release 时应默认读取宿主运行时可信根", async () => {
    const { app, trustRoot } = await buildSignedCloudApp();
    window.__LIME_OEM_CLOUD__ = {
      agentAppSignatureTrustRoots: [trustRoot],
    };

    const result = await reviewCloudAgentAppRelease({
      app,
      packageManifest: contentFactoryFixture,
      actualPackageHash: PACKAGE_HASH,
      actualManifestHash: MANIFEST_HASH,
      catalogSource: "remote",
      signatureCrypto: webcrypto as unknown as Crypto,
    });

    expect(result.review.releaseEvidence).toMatchObject({
      status: "ready",
      signaturePolicy: "required",
      signatureVerificationStatus: "verified",
      blockerCodes: [],
      warningCodes: [],
    });
  });

  it("审查 remote Cloud release 时签名未验证应进入 blocked evidence", async () => {
    appServerRequestMock.mockImplementation(async (method, args) => {
      if (method === "agentAppPackage/fetchCloud") {
        const descriptor = (
          args as {
            descriptor: CloudBootstrapReleaseDescriptor;
          }
        ).descriptor;
        return {
          result: buildAgentAppPackageCacheEntry({
            identity: descriptor.identity,
            manifestSnapshot: contentFactoryFixture,
            actualPackageHash: PACKAGE_HASH,
            actualManifestHash: MANIFEST_HASH,
            cachedAt: descriptor.loadedAt,
          }),
        };
      }
      throw new Error(`unexpected method ${method}`);
    });

    const result = await reviewCloudAgentAppRelease({
      app: buildCloudApp(),
      catalogSource: "remote",
    });

    expect(result.review.releaseEvidence).toMatchObject({
      status: "blocked",
      signaturePolicy: "required",
      signatureVerificationStatus: "declared",
      blockerCodes: ["signature_unverified"],
    });
    expect(result.review.sourceState).toMatchObject({
      kind: "release-evidence-blocked",
      canReview: false,
      reason: "CLOUD_SIGNATURE_UNVERIFIED",
    });
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "agent_app_fetch_cloud_package",
      expect.anything(),
    );
  });

  it("审查 remote Cloud release 时 signatureProof 缺少可信根应进入 blocked evidence", async () => {
    const { app } = await buildSignedCloudApp();

    const result = await reviewCloudAgentAppRelease({
      app,
      packageManifest: contentFactoryFixture,
      actualPackageHash: PACKAGE_HASH,
      actualManifestHash: MANIFEST_HASH,
      catalogSource: "remote",
      signatureTrustRoots: [],
      signatureCrypto: webcrypto as unknown as Crypto,
    });

    expect(result.review.releaseEvidence).toMatchObject({
      status: "blocked",
      signaturePolicy: "required",
      signatureVerificationStatus: "failed",
      blockerCodes: ["signature_verification_failed"],
    });
    expect(result.review.sourceState).toMatchObject({
      kind: "release-evidence-blocked",
      canReview: false,
      reason: "CLOUD_SIGNATURE_VERIFICATION_FAILED",
    });
  });

  it("直接安装 remote Cloud release 时签名门禁未通过必须 fail closed", async () => {
    appServerRequestMock.mockImplementation(async (method, args) => {
      if (method === "agentAppPackage/fetchCloud") {
        const descriptor = (
          args as {
            descriptor: CloudBootstrapReleaseDescriptor;
          }
        ).descriptor;
        return {
          result: buildAgentAppPackageCacheEntry({
            identity: descriptor.identity,
            manifestSnapshot: contentFactoryFixture,
            actualPackageHash: PACKAGE_HASH,
            actualManifestHash: MANIFEST_HASH,
            cachedAt: descriptor.loadedAt,
          }),
        };
      }
      throw new Error(`unexpected method ${method}`);
    });

    await expect(
      installCloudAgentAppRelease({
        app: buildCloudApp(),
        catalogSource: "remote",
      }),
    ).rejects.toThrow("did not pass release evidence gates");
    expect(appServerRequestMock).not.toHaveBeenCalledWith(
      "agentAppInstalled/save",
      expect.anything(),
    );
  });

  it("直接安装 seeded content-factory-app 应使用本地 fixture 包并写入 installed state", async () => {
    const catalog = await getAgentAppCloudCatalog();
    const app = catalog.payload.apps[0]!;
    appServerRequestMock.mockImplementation(async (method, args) => {
      if (method === "agentAppInstalled/save") {
        return { result: (args as { state: unknown }).state };
      }
      throw new Error(`unexpected method ${method}`);
    });

    const state = await installCloudAgentAppRelease({
      app,
      catalogSource: catalog.source,
    });

    expect(state).toMatchObject({
      appId: "content-factory-app",
      manifest: {
        version: (contentFactoryFixture as AppManifest).version,
        agentRuntime: {
          intents: expect.arrayContaining([
            expect.objectContaining({
              key: "content_article_generate",
              aliases: expect.arrayContaining(["@写文章"]),
            }),
          ]),
        },
      },
      identity: {
        sourceKind: "cloud_release",
        sourceUri: app.packageUrl,
        appVersion: app.version,
        packageHash: app.packageHash,
        manifestHash: app.manifestHash,
      },
      setup: {
        cloudReleaseEvidence: {
          status: "warning",
          signaturePolicy: "optional",
          signatureVerificationStatus: "not_configured",
          packageHashMatched: true,
          manifestHashMatched: true,
          packageVerificationStatus: "verified",
        },
      },
    });
    expect(appServerRequestMock).toHaveBeenCalledTimes(1);
    expect(appServerRequestMock).toHaveBeenCalledWith(
      "agentAppInstalled/save",
      {
        state: expect.objectContaining({
          appId: "content-factory-app",
          setup: expect.objectContaining({
            cloudReleaseEvidence: expect.objectContaining({
              signaturePolicy: "optional",
              packageVerificationStatus: "verified",
            }),
          }),
        }),
      },
    );
    expect(appServerRequestMock).not.toHaveBeenCalledWith(
      "agentAppPackage/fetchCloud",
      expect.anything(),
    );
  });

  it("审查 seeded content-factory-app 应使用本地 fixture 包且不拉远端", async () => {
    const catalog = await getAgentAppCloudCatalog();
    const app = catalog.payload.apps[0]!;

    const result = await reviewCloudAgentAppRelease({
      app,
      catalogSource: catalog.source,
    });

    expect(result.review.releaseEvidence).toMatchObject({
      status: "warning",
      sourceKind: "explicit_manifest",
      packageVerificationStatus: "verified",
      signaturePolicy: "optional",
      signatureVerificationStatus: "not_configured",
      packageHashMatched: true,
      manifestHashMatched: true,
      blockerCodes: [],
    });
    expect(result.state).toMatchObject({
      appId: "content-factory-app",
      setup: {
        cloudReleaseEvidence: expect.objectContaining({
          status: "warning",
          signaturePolicy: "optional",
          signatureVerificationStatus: "not_configured",
          packageVerificationStatus: "verified",
        }),
      },
      manifest: {
        version: (contentFactoryFixture as AppManifest).version,
        agentRuntime: {
          intents: expect.arrayContaining([
            expect.objectContaining({
              key: "content_article_generate",
              aliases: expect.arrayContaining(["@写文章"]),
            }),
          ]),
        },
      },
    });
    expect(appServerRequestMock).not.toHaveBeenCalled();
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
              version: "2.0.0",
              releaseId: "release-001",
              tenantId: "tenant-0001",
              tenantEnablementRef: "enablement-001",
              channel: "stable",
              signatureRef: "sigstore:content-factory-app@2.0.0",
              licenseState: "active",
              enabled: true,
              packageUrl:
                "https://packages.limecloud.example/apps/content-factory-app-2.0.0.lapp",
              packageHash: PACKAGE_HASH,
              manifestHash: MANIFEST_HASH,
              capabilityRequirements: {
                "lime.ui": "^0.11.0",
                "lime.storage": "^0.11.0",
              },
              defaultEntries: ["content_factory"],
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
              version: "2.0.0",
              registrationRequired: true,
              registrationState: "active",
              enabled: true,
              packageUrl:
                "https://packages.limecloud.example/apps/content-factory-app-2.0.0.lapp",
              packageHash: PACKAGE_HASH,
              manifestHash: MANIFEST_HASH,
              capabilityRequirements: {},
              defaultEntries: ["content_factory"],
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

  it("无云端上下文时 seeded content-factory-app 不应要求注册码", async () => {
    const result = await getAgentAppCloudCatalog();
    const manifest = contentFactoryFixture as AppManifest;
    const seededApp = seededAgentAppsFixture.apps[0];

    expect(result.source).toBe("seeded");
    expect(result.payload.apps[0]).toMatchObject({
      appId: "content-factory-app",
      version: manifest.version,
      releaseId: `seeded-content-factory-app-${manifest.version}`,
      registrationRequired: false,
      registrationState: "not_required",
      enabled: true,
      packageUrl: `https://seeded.local/agent-apps/content-factory-app/${manifest.version}.lapp`,
      packageHash: seededApp.packageHash,
      manifestHash: seededApp.manifestHash,
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
              version: "2.0.0",
              releaseId: "release-bootstrap",
              enabled: true,
              packageUrl:
                "https://packages.limecloud.example/apps/content-factory-app-2.0.0.lapp",
              packageHash: PACKAGE_HASH,
              manifestHash: MANIFEST_HASH,
              capabilityRequirements: {},
              defaultEntries: ["content_factory"],
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

  it("Agent App UI runtime 网关应直连 App Server current 命令", async () => {
    appServerRequestMock
      .mockResolvedValueOnce({
        result: {
          appId: "content-factory-app",
          status: "running",
          baseUrl: "http://127.0.0.1:4199",
          entryUrl: "http://127.0.0.1:4199/dashboard",
          entryKey: "dashboard",
          route: "/dashboard",
          taskRuntime: {
            enabled: true,
            workerEntrypoint: "./src/runtime/content-factory-worker.mjs",
            contractPath: "./app.runtime.yaml",
            sampleRequestPath: "./examples/runtime-request.sample.json",
            outputArtifactKind: "content_factory.workspace_patch",
            taskKinds: ["content.factory.generate"],
            directProviderAccess: false,
            directFilesystemAccess: false,
            blockers: [],
            followUps: [],
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          appId: "content-factory-app",
          status: "running",
          entryUrl: "http://127.0.0.1:4199/dashboard",
        },
      })
      .mockResolvedValueOnce({
        result: {
          appId: "content-factory-app",
          status: "stopped",
        },
      });

    await expect(
      startAgentAppUiRuntime({
        appId: "content-factory-app",
        entryKey: "dashboard",
      }),
    ).resolves.toMatchObject({
      status: "running",
      entryUrl: "http://127.0.0.1:4199/dashboard",
      taskRuntime: expect.objectContaining({
        enabled: true,
        workerEntrypoint: "./src/runtime/content-factory-worker.mjs",
        taskKinds: ["content.factory.generate"],
      }),
    });
    await expect(
      getAgentAppUiRuntimeStatus({ appId: "content-factory-app" }),
    ).resolves.toMatchObject({ status: "running" });
    await expect(
      stopAgentAppUiRuntime({ appId: "content-factory-app" }),
    ).resolves.toMatchObject({ status: "stopped" });

    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      1,
      "agentAppUiRuntime/start",
      {
        appId: "content-factory-app",
        entryKey: "dashboard",
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      2,
      "agentAppUiRuntime/status",
      {
        appId: "content-factory-app",
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      3,
      "agentAppUiRuntime/stop",
      {
        appId: "content-factory-app",
      },
    );
    expect(safeInvoke).not.toHaveBeenCalledWith("agent_app_start_ui_runtime");
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "agent_app_get_ui_runtime_status",
    );
    expect(safeInvoke).not.toHaveBeenCalledWith("agent_app_stop_ui_runtime");
  });

  it("Agent App set disabled 返回无效 installed list 时应 fail closed", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        states: [
          {
            appId: "content-factory-app",
            disabled: true,
          },
        ],
        issues: [],
      },
    });

    await expect(
      setAgentAppDisabled({
        appId: "content-factory-app",
        disabled: true,
      }),
    ).rejects.toThrow(
      "agentAppInstalled/disabled/set.states[0] did not return installMode",
    );
    expect(appServerRequestMock).toHaveBeenCalledWith(
      "agentAppInstalled/disabled/set",
      {
        appId: "content-factory-app",
        disabled: true,
      },
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "agent_app_set_disabled",
      expect.anything(),
    );
  });

  it("Agent App Shell prepare 应直连 App Server current 方法并校验返回形状", async () => {
    const descriptor = buildShellDescriptor();
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        appId: "content-factory-app",
        status: "ready",
        installMode: "standalone",
        shellKind: "app_shell",
        descriptorVersion: 1,
        devShell: true,
        blockerCodes: [],
        preparedAt: "2026-05-15T00:00:00.000Z",
        entryKey: "dashboard",
        windowTitle: "Content Factory",
      },
    });

    await expect(
      prepareAgentAppShellForAppServerTestOnly(descriptor),
    ).resolves.toMatchObject({
      status: "ready",
      appId: "content-factory-app",
      entryKey: "dashboard",
    });

    expect(appServerRequestMock).toHaveBeenCalledWith("agentAppShell/prepare", {
      descriptor,
    });
    expect(safeInvoke).not.toHaveBeenCalledWith("agent_app_launch_shell");
  });

  it("Agent App uninstall rehearsal 返回非演练结果时应 fail closed", async () => {
    appServerRequestMock.mockResolvedValueOnce({ result: { success: true } });

    await expect(
      previewAgentAppUninstall({
        appId: "content-factory-app",
        mode: "keep-data",
      }),
    ).rejects.toThrow(
      "agentAppInstalled/uninstall/rehearsal did not return appId",
    );
    expect(appServerRequestMock).toHaveBeenCalledWith(
      "agentAppInstalled/uninstall/rehearsal",
      {
        appId: "content-factory-app",
        mode: "keep-data",
      },
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "agent_app_uninstall_rehearsal",
      expect.anything(),
    );
  });

  it("Agent App uninstall 返回无效 installed list 时应 fail closed", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        status: "deleted",
        rehearsal: {
          appId: "content-factory-app",
          packageHash: PACKAGE_HASH,
          mode: "keep-data",
          generatedAt: "2026-05-15T00:03:00.000Z",
          deletedTargetCount: 0,
          retainedTargetCount: 0,
          targets: [],
          warnings: [],
        },
        list: {
          states: [{ success: true }],
          issues: [],
        },
        removedTargetCount: 0,
        missingTargetCount: 0,
        blockerCodes: [],
        deleteEvidence: null,
      },
    });

    await expect(
      uninstallAgentApp({
        appId: "content-factory-app",
        mode: "keep-data",
      }),
    ).rejects.toThrow(
      "agentAppInstalled/uninstall.states[0] did not return appId",
    );
    expect(appServerRequestMock).toHaveBeenCalledWith(
      "agentAppInstalled/uninstall",
      {
        appId: "content-factory-app",
        mode: "keep-data",
      },
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "agent_app_uninstall",
      expect.anything(),
    );
  });

  it("Agent App keep-data uninstall 成功时应接受 current uninstalled 状态并回写空列表", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        status: "uninstalled",
        rehearsal: {
          appId: "content-factory-app",
          packageHash: PACKAGE_HASH,
          mode: "keep-data",
          generatedAt: "2026-05-15T00:03:00.000Z",
          deletedTargetCount: 2,
          retainedTargetCount: 3,
          targets: [],
          warnings: [],
        },
        list: {
          states: [],
          issues: [],
        },
        removedTargetCount: 2,
        missingTargetCount: 0,
        blockerCodes: [],
        deleteEvidence: null,
      },
    });

    await expect(
      uninstallAgentApp({
        appId: "content-factory-app",
        mode: "keep-data",
      }),
    ).resolves.toMatchObject({
      status: "uninstalled",
      list: {
        states: [],
        issues: [],
      },
      removedTargetCount: 2,
      missingTargetCount: 0,
    });
    expect(appServerRequestMock).toHaveBeenCalledWith(
      "agentAppInstalled/uninstall",
      {
        appId: "content-factory-app",
        mode: "keep-data",
      },
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "agent_app_uninstall",
      expect.anything(),
    );
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

  it("Agent App 宿主目录选择缺少 cancelled 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValue({
      path: LOCAL_APP_DIR,
    });

    await expect(
      selectAgentAppDirectory({ title: "选择应用目录" }),
    ).rejects.toThrow("agent_app_select_directory did not return cancelled");
  });

  it("Agent App 宿主目录选择未取消但缺少 path 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValue({
      path: null,
      cancelled: false,
    });

    await expect(
      selectAgentAppDirectory({ title: "选择应用目录" }),
    ).rejects.toThrow(
      "agent_app_select_directory did not return selected path",
    );
  });

  it("Agent App Shell launch 网关应通过 current 命令提交 descriptor", async () => {
    const descriptor = buildShellDescriptor();
    vi.mocked(safeInvoke).mockResolvedValue({
      appId: "content-factory-app",
      status: "launched",
      installMode: "standalone",
      shellKind: "app_shell",
      descriptorVersion: 1,
      devShell: true,
      blockerCodes: [],
      surface: {
        activeStrategy: "controlledBrowserWindow",
        supportedStrategies: ["controlledBrowserWindow", "webContentsView"],
        entryUrl: "http://127.0.0.1:4199/dashboard",
        containerId: "agent-app-shell-content-factory-app-standalone",
        embedding: {
          standaloneWindow: true,
          rightSurfaceDock: true,
          iframe: false,
          browserView: false,
        },
        isolation: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
        },
      },
      launchedAt: "2026-05-15T00:00:00.000Z",
    });

    await expect(launchAgentAppShell({ descriptor })).resolves.toMatchObject({
      status: "launched",
      devShell: true,
      surface: {
        activeStrategy: "controlledBrowserWindow",
        supportedStrategies: ["controlledBrowserWindow", "webContentsView"],
        embedding: {
          iframe: false,
          browserView: false,
        },
      },
    });
    expect(safeInvoke).toHaveBeenCalledWith("agent_app_launch_shell", {
      request: { descriptor },
    });
    expect(appServerRequestMock).not.toHaveBeenCalledWith(
      "agentAppShell/prepare",
      expect.anything(),
    );
  });

  it("Agent App Shell launch blocked 结果不要求 launchedAt", async () => {
    const descriptor = buildShellDescriptor();
    vi.mocked(safeInvoke).mockResolvedValue({
      appId: "content-factory-app",
      status: "blocked",
      devShell: true,
      blockerCodes: ["INSTALLED_STATE_MISSING"],
      message: "Agent App 未安装",
    });

    await expect(launchAgentAppShell({ descriptor })).resolves.toMatchObject({
      status: "blocked",
      blockerCodes: ["INSTALLED_STATE_MISSING"],
    });
  });

  it("Agent App Shell launch 返回非 shell 结果时应 fail closed", async () => {
    const descriptor = buildShellDescriptor();
    vi.mocked(safeInvoke).mockResolvedValue({ success: true });

    await expect(launchAgentAppShell({ descriptor })).rejects.toThrow(
      "agent_app_launch_shell did not return status",
    );
  });

  it("Agent App Shell launch 缺少 surface 合同时应 fail closed", async () => {
    const descriptor = buildShellDescriptor();
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

    await expect(launchAgentAppShell({ descriptor })).rejects.toThrow(
      "agent_app_launch_shell did not return shell surface",
    );
  });
});
