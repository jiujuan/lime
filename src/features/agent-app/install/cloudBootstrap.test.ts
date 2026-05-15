import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { AgentAppInstalledPreviewError } from "./installedAppPreview";
import {
  AgentAppCloudBootstrapError,
  buildCloudBootstrapInstalledAppPreview,
  buildCloudBootstrapPackageSource,
  buildCloudReleaseDescriptor,
  buildCloudReleasePackageIdentity,
  buildVerifiedCloudReleasePackage,
  parseCloudBootstrapPayload,
  resolveCloudBootstrapInstallDecision,
  validateCloudBootstrapPayload,
} from "./cloudBootstrap";

const PACKAGE_HASH_001 =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MANIFEST_HASH_001 =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PACKAGE_HASH_002 =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const MANIFEST_HASH_002 =
  "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const PACKAGE_HASH_OTHER =
  "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function buildPayload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "agent-app-cloud-bootstrap/v1",
    tenantId: "tenant-123",
    generatedAt: "2026-05-15T00:00:00.000Z",
    fetchedAt: "2026-05-15T00:00:00.000Z",
    apps: [
      {
        appId: "content-factory-app",
        displayName: "内容工厂",
        version: "0.3.0",
        releaseId: "release_001",
        tenantId: "tenant-123",
        tenantEnablementRef: "enablement_001",
        channel: "stable",
        signatureRef: "sigstore:content-factory-app@0.3.0",
        licenseState: "active",
        enabled: true,
        packageUrl:
          "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
        packageHash: PACKAGE_HASH_001,
        manifestHash: MANIFEST_HASH_001,
        capabilityRequirements: {
          "lime.ui": "^0.3.0",
          "lime.storage": "^0.3.0",
        },
        defaultEntries: ["dashboard", "knowledge"],
        policyDefaults: {
          allowServerAssisted: false,
          requireEvidenceForPublishReady: true,
        },
        toolAvailability: [
          { key: "document_parser", status: "available", required: true },
          { key: "competitor_research", status: "not-enabled", required: false },
        ],
        ...overrides,
      },
    ],
  };
}

describe("Cloud Bootstrap payload P5.1", () => {
  it("应解析 LimeCore bootstrap payload 并映射为 cloud_release package identity", () => {
    const payload = parseCloudBootstrapPayload(buildPayload());
    const app = payload.apps[0]!;

    expect(payload.tenantId).toBe("tenant-123");
    expect(payload.generatedAt).toBe("2026-05-15T00:00:00.000Z");
    expect(app).toMatchObject({
      appId: "content-factory-app",
      version: "0.3.0",
      releaseId: "release_001",
      tenantEnablementRef: "enablement_001",
      channel: "stable",
      signatureRef: "sigstore:content-factory-app@0.3.0",
      licenseState: "active",
      enabled: true,
      defaultEntries: ["dashboard", "knowledge"],
      capabilityRequirements: {
        "lime.ui": "^0.3.0",
        "lime.storage": "^0.3.0",
      },
    });
    expect(app.toolAvailability).toEqual([
      { key: "document_parser", status: "available", required: true },
      { key: "competitor_research", status: "not-enabled", required: false },
    ]);

    expect(
      buildCloudReleasePackageIdentity({
        app,
        loadedAt: "2026-05-15T00:00:00.000Z",
      }),
    ).toEqual({
      sourceKind: "cloud_release",
      sourceUri:
        "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
      appId: "content-factory-app",
      appVersion: "0.3.0",
      packageHash: PACKAGE_HASH_001,
      manifestHash: MANIFEST_HASH_001,
      loadedAt: "2026-05-15T00:00:00.000Z",
      releaseId: "release_001",
      tenantId: "tenant-123",
      tenantEnablementRef: "enablement_001",
      channel: "stable",
      signatureRef: "sigstore:content-factory-app@0.3.0",
    });
  });

  it("应拒绝不安全 URL、占位 hash、敏感字段和默认 server-assisted", () => {
    const result = validateCloudBootstrapPayload(
      buildPayload({
        packageUrl: "http://packages.example/content-factory-app.lapp",
        packageHash: "sha256:...",
        manifestHash: "manifest-fnv1a-local",
        policyDefaults: {
          allowServerAssisted: true,
          API_KEY: "should-not-exist",
        },
        licenseState: "suspended",
        customerData: {
          notes: "客户私有资料不得进入 bootstrap",
        },
      }),
    );

    expect(result.status).toBe("invalid");
    expect(result.blockers.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "PACKAGE_URL_UNSUPPORTED",
        "HASH_INVALID",
        "FIELD_INVALID",
        "SENSITIVE_FIELD_FORBIDDEN",
        "SERVER_ASSISTED_DEFAULT_UNSUPPORTED",
      ]),
    );
  });

  it("缺少 apps 数组时应抛出 Cloud bootstrap 错误", () => {
    expect(() => parseCloudBootstrapPayload({})).toThrow(
      AgentAppCloudBootstrapError,
    );
  });

  it("应把 cloud_release source 复用到现有 preview / projection / readiness / cleanup 链路", () => {
    const app = parseCloudBootstrapPayload(buildPayload()).apps[0]!;
    const source = buildCloudBootstrapPackageSource({
      app,
      loadedAt: "2026-05-15T00:00:00.000Z",
    });

    expect(source).toMatchObject({
      sourceKind: "cloud_release",
      sourceUri:
        "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
      enabled: true,
      identity: {
        sourceKind: "cloud_release",
        packageHash: PACKAGE_HASH_001,
        manifestHash: MANIFEST_HASH_001,
        releaseId: "release_001",
      },
      defaultEntries: ["dashboard", "knowledge"],
    });

    const preview = buildCloudBootstrapInstalledAppPreview({
      app,
      packageManifest: contentFactoryFixture,
      loadedAt: "2026-05-15T00:00:00.000Z",
      checkedAt: "2026-05-15T00:01:00.000Z",
      generatedAt: "2026-05-15T00:02:00.000Z",
    });

    expect(preview.identity.sourceKind).toBe("cloud_release");
    expect(preview.projection.package).toBe(preview.identity);
    expect(preview.projection.provenance).toMatchObject({
      appId: "content-factory-app",
      packageHash: PACKAGE_HASH_001,
      manifestHash: MANIFEST_HASH_001,
    });
    expect(preview.cleanupPlan.packageCachePaths[0]?.value).toContain(
      PACKAGE_HASH_001,
    );
    expect(preview.readiness.checkedAt).toBe("2026-05-15T00:01:00.000Z");
  });

  it("应把 Cloud metadata 归一为可审查的 release descriptor", () => {
    const app = parseCloudBootstrapPayload(buildPayload()).apps[0]!;

    expect(
      buildCloudReleaseDescriptor({
        app,
        loadedAt: "2026-05-15T00:00:00.000Z",
      }),
    ).toMatchObject({
      sourceKind: "cloud_release",
      sourceUri:
        "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
      appId: "content-factory-app",
      version: "0.3.0",
      releaseId: "release_001",
      tenantEnablementRef: "enablement_001",
      channel: "stable",
      packageUrl:
        "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp",
      packageHash: PACKAGE_HASH_001,
      manifestHash: MANIFEST_HASH_001,
      signatureRef: "sigstore:content-factory-app@0.3.0",
      compatibility: {
        capabilities: {
          "lime.ui": "^0.3.0",
          "lime.storage": "^0.3.0",
        },
      },
      identity: {
        sourceKind: "cloud_release",
        packageHash: PACKAGE_HASH_001,
        manifestHash: MANIFEST_HASH_001,
      },
    });
  });

  it("应在 package hash mismatch 时阻断 Cloud release verification", () => {
    const app = parseCloudBootstrapPayload(buildPayload()).apps[0]!;
    const result = buildVerifiedCloudReleasePackage({
      app,
      packageManifest: contentFactoryFixture,
      actualPackageHash: PACKAGE_HASH_OTHER,
      loadedAt: "2026-05-15T00:00:00.000Z",
    });

    expect(result.verification).toMatchObject({
      status: "package_hash_mismatch",
      expectedPackageHash: PACKAGE_HASH_001,
      actualPackageHash: PACKAGE_HASH_OTHER,
    });
  });

  it("cloud_release identity 与 manifest 不一致时应拒绝生成 preview", () => {
    const app = {
      ...parseCloudBootstrapPayload(buildPayload()).apps[0]!,
      appId: "other-app",
    };

    expect(() =>
      buildCloudBootstrapInstalledAppPreview({
        app,
        packageManifest: contentFactoryFixture,
      }),
    ).toThrow(AgentAppInstalledPreviewError);
  });

  it("应把 tenant enablement / license / tool availability 合并为本地 readiness 输入", () => {
    const app = parseCloudBootstrapPayload(
      buildPayload({
        defaultEntries: ["dashboard"],
        licenseState: "expired",
        toolAvailability: [
          { key: "document_parser", status: "missing", required: true },
          { key: "competitor_research", status: "not-enabled", required: false },
        ],
      }),
    ).apps[0]!;

    const preview = buildCloudBootstrapInstalledAppPreview({
      app,
      packageManifest: contentFactoryFixture,
    });

    expect(preview.readiness.blockers.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "CLOUD_LICENSE_UNAVAILABLE",
        "CLOUD_TOOL_UNAVAILABLE",
      ]),
    );
    expect(preview.readiness.warnings.map((issue) => issue.code)).toContain(
      "CLOUD_TOOL_UNAVAILABLE",
    );
    expect(
      preview.readiness.entryReadiness
        .find((entry) => entry.entryKey === "content_factory")
        ?.issues.map((issue) => issue.code),
    ).toContain("CLOUD_ENTRY_NOT_ENABLED");
  });

  it("注册码未激活时允许缺失 package 元数据但阻断安装与 readiness", () => {
    const app = parseCloudBootstrapPayload(
      buildPayload({
        registrationRequired: true,
        registrationState: "required",
        registrationHint: "请输入企业注册码",
        enabled: false,
        disabledReason: "registration required",
        packageUrl: "",
        packageHash: "",
        manifestHash: "",
      }),
    ).apps[0]!;

    expect(app).toMatchObject({
      registrationRequired: true,
      registrationState: "required",
      packageUrl: "",
      packageHash: "",
      manifestHash: "",
    });
    expect(resolveCloudBootstrapInstallDecision({ app })).toMatchObject({
      status: "disabled",
      shouldDownload: false,
      reason: "Cloud Agent App requires registration before download.",
    });

    const preview = buildCloudBootstrapInstalledAppPreview({
      app,
      packageManifest: contentFactoryFixture,
    });
    expect(preview.readiness.blockers.map((issue) => issue.code)).toContain(
      "CLOUD_REGISTRATION_REQUIRED",
    );
  });

  it("应在 Cloud disable 时只禁用 App 且保留本地数据", () => {
    const app = parseCloudBootstrapPayload(buildPayload({ enabled: false })).apps[0]!;
    const installedIdentity = buildCloudReleasePackageIdentity({
      app: { ...app, enabled: true },
      loadedAt: "2026-05-14T00:00:00.000Z",
    });

    expect(
      resolveCloudBootstrapInstallDecision({ app, installedIdentity }),
    ).toMatchObject({
      status: "disabled",
      canRunInstalled: false,
      shouldDownload: false,
      preserveData: true,
      shouldDeleteData: false,
    });
  });

  it("hash mismatch 应拒绝启用新 release 但允许保留旧 installed identity", () => {
    const app = parseCloudBootstrapPayload(buildPayload()).apps[0]!;
    const installedIdentity = buildCloudReleasePackageIdentity({
      app,
      loadedAt: "2026-05-14T00:00:00.000Z",
    });

    expect(
      resolveCloudBootstrapInstallDecision({
        app,
        installedIdentity,
        actualPackageHash: PACKAGE_HASH_OTHER,
      }),
    ).toMatchObject({
      status: "hash_mismatch",
      canRunInstalled: true,
      shouldDownload: false,
      preserveData: true,
      shouldDeleteData: false,
    });
  });

  it("Cloud 断网时应使用本地 installed identity，不删除数据", () => {
    const app = parseCloudBootstrapPayload(buildPayload()).apps[0]!;
    const installedIdentity = buildCloudReleasePackageIdentity({
      app,
      loadedAt: "2026-05-14T00:00:00.000Z",
    });

    expect(
      resolveCloudBootstrapInstallDecision({
        installedIdentity,
        cloudReachable: false,
      }),
    ).toMatchObject({
      status: "offline_available",
      canRunInstalled: true,
      shouldDownload: false,
      preserveData: true,
      shouldDeleteData: false,
    });
  });

  it("新 Cloud release 应进入 upgrade preview 且不覆盖本地数据", () => {
    const app = parseCloudBootstrapPayload(
      buildPayload({
        version: "0.3.1",
        packageHash: PACKAGE_HASH_002,
        manifestHash: MANIFEST_HASH_002,
      }),
    ).apps[0]!;
    const installedIdentity = buildCloudReleasePackageIdentity({
      app: {
        ...app,
        version: "0.3.0",
        packageHash: PACKAGE_HASH_001,
        manifestHash: MANIFEST_HASH_001,
      },
      loadedAt: "2026-05-14T00:00:00.000Z",
    });

    expect(
      resolveCloudBootstrapInstallDecision({ app, installedIdentity }),
    ).toMatchObject({
      status: "upgrade_available",
      canRunInstalled: true,
      shouldDownload: true,
      preserveData: true,
      shouldDeleteData: false,
    });
  });
});
