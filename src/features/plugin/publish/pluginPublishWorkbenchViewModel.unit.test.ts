import { describe, expect, it } from "vitest";
import type { PluginInstallReviewResult } from "@/lib/api/plugins";
import type { InstalledPluginState } from "../types";
import {
  buildBulkPublishPluginPayload,
  buildPluginPublishStageState,
  createDefaultPluginPublishDraft,
  validatePluginPublishDraft,
} from "./pluginPublishWorkbenchViewModel";

const PACKAGE_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MANIFEST_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PAYLOAD_HASH =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const UPLOADED_PACKAGE_HASH =
  "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

function buildReview(
  params: { manifest?: Record<string, unknown> } = {},
): PluginInstallReviewResult {
  const state = {
    appId: "content-factory-app",
    identity: {
      appId: "content-factory-app",
      appVersion: "0.3.0",
      packageHash: PACKAGE_HASH,
      manifestHash: MANIFEST_HASH,
    },
    manifest: {
      manifestVersion: "0.8.0",
      appId: "content-factory-app",
      version: "0.3.0",
      displayName: "内容工厂",
      description: "整理内容生产流程。",
      appType: "workflow",
      status: "active",
      runtimeTargets: ["desktop"],
      requires: {
        appRuntime: "^0.8.0",
        capabilities: {
          "lime.ui": "^1.0.0",
          "lime.storage": "^1.0.0",
        },
      },
      entries: [{ key: "dashboard", kind: "page", title: "首页" }],
      secrets: [{ key: "publish_api_key", provider: "host-secret" }],
      ...params.manifest,
    },
    projection: {
      requiredCapabilities: [
        { capability: "lime.ui" },
        { capability: "lime.storage" },
      ],
    },
  } as unknown as InstalledPluginState;

  return {
    state,
    review: {
      displayName: "内容工厂",
      packageHash: PACKAGE_HASH,
      manifestHash: MANIFEST_HASH,
    },
  } as unknown as PluginInstallReviewResult;
}

function buildReadyDraft() {
  return {
    ...createDefaultPluginPublishDraft({
      tenantId: "tenant-0001",
      signedAt: "2026-07-05T00:00:00.000Z",
    }),
    packageUrl: "https://cdn.limeai.run/plugins/content-factory-app.zip",
    signatureRef: "sigstore:content-factory-app@0.3.0",
    signaturePublicKeyId: "plugin-release-key",
    signature: "base64-signature",
    signaturePayloadHash: PAYLOAD_HASH,
  };
}

function buildPackageArtifact() {
  return {
    packageUrl: "https://cdn.limeai.run/plugins/content-factory-app.zip",
    packageHash: PACKAGE_HASH,
    manifestHash: MANIFEST_HASH,
  };
}

describe("pluginPublishWorkbenchViewModel", () => {
  it("应把本地包审查结果投影成 LimeCore bulk publish payload", () => {
    const draft = {
      ...createDefaultPluginPublishDraft({
        tenantId: "tenant-0001",
        signedAt: "2026-07-05T00:00:00.000Z",
      }),
      packageUrl: "https://cdn.limeai.run/plugins/content-factory-app.zip",
      signatureRef: "sigstore:content-factory-app@0.3.0",
      signaturePublicKeyId: "plugin-release-key",
      signature: "base64-signature",
      signaturePayloadHash: PAYLOAD_HASH,
      categoriesText: "content, workflow",
      keywordsText: "draft\npublish",
      registrationRequired: true,
      registrationHint: "联系管理员获取注册码",
    };

    const blockers = validatePluginPublishDraft({
      review: buildReview(),
      draft,
      packageArtifact: {
        packageUrl: "https://cdn.limeai.run/plugins/content-factory-app.zip",
        packageHash: PACKAGE_HASH,
        manifestHash: MANIFEST_HASH,
      },
    });
    const payload = buildBulkPublishPluginPayload({
      review: buildReview(),
      draft,
      packageArtifact: {
        packageUrl: "https://cdn.limeai.run/plugins/content-factory-app.zip",
        packageHash: PACKAGE_HASH,
        manifestHash: MANIFEST_HASH,
      },
    });

    expect(blockers).toEqual([]);
    expect(payload.catalog).toMatchObject({
      pluginName: "content-factory-app",
      marketplaceName: "limecloud",
      displayName: "内容工厂",
      latestVersion: "0.3.0",
      status: "active",
      categories: ["content", "workflow"],
      keywords: ["draft", "publish"],
      capabilities: ["lime.ui", "lime.storage"],
    });
    expect(payload.release).toMatchObject({
      version: "0.3.0",
      packageUrl: "https://cdn.limeai.run/plugins/content-factory-app.zip",
      packageHash: PACKAGE_HASH,
      manifestHash: MANIFEST_HASH,
      signatureRef: "sigstore:content-factory-app@0.3.0",
      status: "ready",
    });
    expect(payload.release.signatureProof).toEqual({
      schemaVersion: "plugin-cloud-release-signature/v1",
      publicKeyId: "plugin-release-key",
      algorithm: "Ed25519",
      signature: "base64-signature",
      payloadHash: PAYLOAD_HASH,
      signedAt: "2026-07-05T00:00:00.000Z",
    });
    expect(payload.targets).toEqual([
      {
        tenantId: "tenant-0001",
        enablementStatus: "published",
        visibility: "all_users",
        enabled: true,
        licenseState: "active",
        registrationRequired: true,
        registrationState: "required",
        registrationHint: "联系管理员获取注册码",
        displayOrder: 0,
      },
    ]);
    expect(payload.targets[0]).not.toHaveProperty("registrationCode");
  });

  it("manifestSummary 只应包含发布审查所需摘要，不泄露 secret 声明", () => {
    const draft = {
      ...createDefaultPluginPublishDraft({
        tenantId: "tenant-0001",
        signedAt: "2026-07-05T00:00:00.000Z",
      }),
      packageUrl: "https://cdn.limeai.run/plugins/content-factory-app.zip",
      signatureRef: "sigstore:content-factory-app@0.3.0",
      signaturePublicKeyId: "plugin-release-key",
      signature: "base64-signature",
      signaturePayloadHash: PAYLOAD_HASH,
    };

    const payload = buildBulkPublishPluginPayload({
      review: buildReview(),
      draft,
    });

    expect(JSON.stringify(payload.catalog.manifestSummary)).not.toContain(
      "secret",
    );
    expect(payload.catalog.manifestSummary).toMatchObject({
      schemaVersion: "plugin-publish-summary/v1",
      name: "content-factory-app",
      version: "0.3.0",
      entryCount: 1,
    });
  });

  it.each([
    ["description", "同步上游配置 apiKey=plain-secret-value"],
    ["displayName", "发布助手 Bearer abcdefghijklmnop123456"],
    [
      "description",
      "-----BEGIN PRIVATE KEY-----\nprivate-key-value\n-----END PRIVATE KEY-----",
    ],
  ])("manifestSummary 包含疑似凭证值时应阻断提交审核：%s", (field, value) => {
    const blockers = validatePluginPublishDraft({
      review: buildReview({ manifest: { [field]: value } }),
      draft: buildReadyDraft(),
      packageArtifact: buildPackageArtifact(),
    });

    expect(blockers).toEqual([
      {
        code: "manifest_summary_sensitive",
        field: "catalog.manifestSummary",
      },
    ]);
  });

  it("manifestSummary 普通说明不应触发敏感值阻断", () => {
    const blockers = validatePluginPublishDraft({
      review: buildReview({
        manifest: {
          description: "通过宿主密钥库读取 API key，清单不包含任何明文值。",
        },
      }),
      draft: buildReadyDraft(),
      packageArtifact: buildPackageArtifact(),
    });

    expect(blockers).toEqual([]);
  });

  it("云端上传产物应覆盖本地目录 hash 进入发布 payload", () => {
    const draft = {
      ...createDefaultPluginPublishDraft({
        tenantId: "tenant-0001",
        signedAt: "2026-07-05T00:00:00.000Z",
      }),
      packageUrl:
        "https://packages.limecloud.example/plugins/content-factory-app.zip",
      signatureRef: "sigstore:content-factory-app@0.3.0",
      signaturePublicKeyId: "plugin-release-key",
      signature: "base64-signature",
      signaturePayloadHash: PAYLOAD_HASH,
    };

    const payload = buildBulkPublishPluginPayload({
      review: buildReview(),
      draft,
      packageArtifact: {
        packageUrl:
          "https://packages.limecloud.example/plugins/limecloud/content-factory-app/0.3.0/package.zip",
        packageHash: UPLOADED_PACKAGE_HASH,
        manifestHash: MANIFEST_HASH,
      },
    });

    expect(payload.release.packageUrl).toBe(
      "https://packages.limecloud.example/plugins/limecloud/content-factory-app/0.3.0/package.zip",
    );
    expect(payload.release.packageHash).toBe(UPLOADED_PACKAGE_HASH);
    expect(payload.release.manifestHash).toBe(MANIFEST_HASH);
  });

  it("未完成云端上传扫描时不允许提交审核", () => {
    const draft = {
      ...createDefaultPluginPublishDraft({
        tenantId: "tenant-0001",
        signedAt: "2026-07-05T00:00:00.000Z",
      }),
      packageUrl: "https://cdn.limeai.run/plugins/content-factory-app.zip",
      signatureRef: "sigstore:content-factory-app@0.3.0",
      signaturePublicKeyId: "plugin-release-key",
      signature: "base64-signature",
      signaturePayloadHash: PAYLOAD_HASH,
    };

    expect(
      validatePluginPublishDraft({
        review: buildReview(),
        draft,
      }),
    ).toContainEqual({
      code: "cloud_upload_missing",
      field: "release.packageUrl",
    });
  });

  it("应根据本地校验和预检结果计算阶段状态", () => {
    const draft = {
      ...createDefaultPluginPublishDraft({
        tenantId: "tenant-0001",
        signedAt: "2026-07-05T00:00:00.000Z",
      }),
      packageUrl: "https://cdn.limeai.run/plugins/content-factory-app.zip",
      signatureRef: "sigstore:content-factory-app@0.3.0",
      signaturePublicKeyId: "plugin-release-key",
      signature: "base64-signature",
      signaturePayloadHash: PAYLOAD_HASH,
    };

    expect(
      buildPluginPublishStageState({
        review: buildReview(),
        draft,
        preflight: {
          valid: true,
          blockers: [],
          checkedAt: "2026-07-05T00:00:01.000Z",
        },
        packageArtifact: {
          packageUrl: "https://cdn.limeai.run/plugins/content-factory-app.zip",
          packageHash: PACKAGE_HASH,
          manifestHash: MANIFEST_HASH,
        },
      }),
    ).toEqual({
      packageSelected: true,
      releaseReady: true,
      signatureReady: true,
      targetReady: true,
      preflightPassed: true,
      publishReady: true,
    });
  });

  it("未选择本地包时应 fail closed", () => {
    const draft = createDefaultPluginPublishDraft({ tenantId: "tenant-0001" });

    expect(validatePluginPublishDraft({ review: null, draft })).toEqual([
      { code: "package_missing", field: "package" },
    ]);
  });
});
