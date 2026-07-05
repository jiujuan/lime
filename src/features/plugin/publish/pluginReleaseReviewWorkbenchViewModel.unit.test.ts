import { describe, expect, it } from "vitest";
import type {
  BulkPublishPluginPayload,
  PluginReleaseSubmission,
} from "@/lib/api/oemCloudPluginPublish";
import {
  buildPluginReleaseReviewCounts,
  filterPluginReleaseReviewSubmissions,
  isPluginReleaseReviewActionAvailable,
  summarizePluginReleaseSubmission,
} from "./pluginReleaseReviewWorkbenchViewModel";

const PACKAGE_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MANIFEST_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PAYLOAD_HASH =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

function buildPayload(): BulkPublishPluginPayload {
  return {
    catalog: {
      pluginName: "content-factory-app",
      marketplaceName: "limecloud",
      displayName: "内容工厂",
      latestVersion: "0.3.0",
      status: "active",
    },
    release: {
      version: "0.3.0",
      packageUrl:
        "https://packages.limecloud.example/plugins/limecloud/content-factory-app/0.3.0/plugin-upload-000001.lpkg",
      packageHash: PACKAGE_HASH,
      manifestHash: MANIFEST_HASH,
      status: "ready",
    },
    targets: [
      {
        tenantId: "tenant-0001",
        enablementStatus: "published",
        registrationRequired: true,
        registrationHint: "向运营团队申请注册码",
      },
    ],
  };
}

function buildSubmission(
  overrides: Partial<PluginReleaseSubmission> = {},
): PluginReleaseSubmission {
  const payload = buildPayload();
  return {
    id: "submission-000001",
    tenantId: "tenant-0001",
    developerUserId: "user-0001",
    pluginName: "content-factory-app",
    marketplaceName: "limecloud",
    version: "0.3.0",
    uploadSessionId: "plugin-upload-000001",
    packageUrl: payload.release.packageUrl,
    packageHash: PACKAGE_HASH,
    manifestHash: MANIFEST_HASH,
    payload,
    payloadHash: PAYLOAD_HASH,
    preflight: {
      valid: true,
      blockers: [],
      warnings: [
        {
          code: "signature_external_evidence",
          severity: "warning",
          message: "外部签名证据需要人工复核",
        },
      ],
      targetImpact: [{ tenantId: "tenant-0001", action: "created" }],
      signatureVerification: { status: "verified" },
      checkedAt: "2026-07-05T00:00:02.000Z",
    },
    status: "pending_review",
    createdAt: "2026-07-05T00:00:03Z",
    updatedAt: "2026-07-05T00:00:03Z",
    ...overrides,
  };
}

describe("pluginReleaseReviewWorkbenchViewModel", () => {
  it("应按状态计数并按创建时间倒序筛选", () => {
    const submissions = [
      buildSubmission({
        id: "old-pending",
        status: "pending_review",
        createdAt: "2026-07-05T00:00:01Z",
      }),
      buildSubmission({
        id: "published",
        status: "published",
        createdAt: "2026-07-05T00:00:04Z",
      }),
      buildSubmission({
        id: "new-pending",
        status: "pending_review",
        createdAt: "2026-07-05T00:00:05Z",
      }),
      buildSubmission({
        id: "rejected",
        status: "rejected",
        createdAt: "2026-07-05T00:00:02Z",
      }),
    ];

    expect(buildPluginReleaseReviewCounts(submissions)).toEqual({
      all: 4,
      pending_review: 2,
      blocked: 0,
      rejected: 1,
      published: 1,
    });
    expect(
      filterPluginReleaseReviewSubmissions(submissions, "pending_review").map(
        (submission) => submission.id,
      ),
    ).toEqual(["new-pending", "old-pending"]);
  });

  it("应生成审核摘要且只允许 pending_review 执行审核动作", () => {
    const pending = buildSubmission();
    const summary = summarizePluginReleaseSubmission(pending);

    expect(summary).toEqual({
      displayName: "内容工厂",
      targetTenantIds: ["tenant-0001"],
      blockerCount: 0,
      warningCount: 1,
      targetImpactCount: 1,
      signatureStatus: "verified",
      registrationRequired: true,
      registrationHint: "向运营团队申请注册码",
    });
    expect(isPluginReleaseReviewActionAvailable(pending)).toBe(true);
    expect(
      isPluginReleaseReviewActionAvailable(
        buildSubmission({ status: "published" }),
      ),
    ).toBe(false);
  });
});
