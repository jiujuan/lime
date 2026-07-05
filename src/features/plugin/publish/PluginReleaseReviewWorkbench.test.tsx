import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";
import {
  PluginReleaseReviewWorkbench,
  type PluginReleaseReviewWorkbenchProps,
} from "./PluginReleaseReviewWorkbench";
import type {
  BulkPublishPluginPayload,
  PluginReleaseSubmission,
} from "@/lib/api/oemCloudPluginPublish";

const PACKAGE_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MANIFEST_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PAYLOAD_HASH =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];
const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      typeof params?.count === "number" ? `${key}:${params.count}` : key,
  }),
}));

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
      signatureRef: "sigstore:content-factory-app@0.3.0",
      signatureProof: {
        schemaVersion: "plugin-cloud-release-signature/v1",
        publicKeyId: "plugin-release-key",
        algorithm: "Ed25519",
        signature: "base64-signature",
        payloadHash: PAYLOAD_HASH,
        signedAt: "2026-07-05T00:00:00.000Z",
      },
      status: "ready",
    },
    targets: [
      {
        tenantId: "tenant-0001",
        enablementStatus: "published",
        visibility: "all_users",
        enabled: true,
        licenseState: "active",
        registrationRequired: true,
        registrationState: "required",
        registrationCode: "REG-SECRET-SHOULD-NOT-RENDER",
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
    developerId: "dev-content-team",
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
          field: "release.signatureRef",
          severity: "warning",
          message: "外部签名证据需要人工复核",
        },
      ],
      targetImpact: [{ tenantId: "tenant-0001", action: "created" }],
      signatureVerification: { status: "verified" },
      checkedAt: "2026-07-05T00:00:02.000Z",
    },
    scanEvidenceRef: `plugin-package-scan:${PACKAGE_HASH}`,
    status: "pending_review",
    developerNotes: "请审核内容工厂插件发布。",
    createdAt: "2026-07-05T00:00:03Z",
    updatedAt: "2026-07-05T00:00:03Z",
    ...overrides,
  };
}

async function flush(times = 8) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  });
}

function setTextValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function renderWorkbench(
  deps: NonNullable<Parameters<typeof PluginReleaseReviewWorkbench>[0]["deps"]>,
  props: Omit<PluginReleaseReviewWorkbenchProps, "deps"> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const mergedDeps: NonNullable<
    Parameters<typeof PluginReleaseReviewWorkbench>[0]["deps"]
  > = {
    listPlatformPluginAuditLogs: vi.fn(async () => ({ items: [] })),
    ...deps,
  };
  await act(async () => {
    root.render(<PluginReleaseReviewWorkbench deps={mergedDeps} {...props} />);
    await Promise.resolve();
  });
  mounted.push({ root, container });
  await flush();
  return container;
}

afterEach(async () => {
  const items = mounted.splice(0);
  await act(async () => {
    for (const item of items) {
      item.root.unmount();
    }
    await Promise.resolve();
  });
  for (const item of items) {
    item.container.remove();
  }
  vi.restoreAllMocks();
});

describe("PluginReleaseReviewWorkbench", () => {
  it("应加载待审核发布单，隐藏注册码明文，并通过审核", async () => {
    const pending = buildSubmission();
    const published = buildSubmission({
      status: "published",
      reviewNotes: "准许发布",
      publishedReleaseId: "plugin-release-000001",
      reviewDecisionAt: "2026-07-05T00:01:00Z",
      updatedAt: "2026-07-05T00:01:00Z",
    });
    const listPluginReleaseSubmissions = vi.fn(async () => ({
      items: [pending],
    }));
    const approvePluginReleaseSubmission = vi.fn(async () => ({
      submission: published,
      publish: {
        catalog: { pluginName: "content-factory-app" },
        release: { id: "plugin-release-000001" },
        targets: [
          {
            tenantId: "tenant-0001",
            action: "created" as const,
            enablement: { id: "enablement-000001" },
          },
        ],
      },
    }));
    const listPlatformPluginAuditLogs = vi.fn(async () => ({
      items: [
        {
          id: "plugin-audit-000001",
          tenantId: "tenant-0001",
          pluginName: "content-factory-app",
          marketplaceName: "limecloud",
          releaseId: "plugin-release-000001",
          operator: "reviewer-0001",
          action: "release_submission_published" as const,
          summary: "plugin release published",
          metadata: {
            token: "REG-SECRET-SHOULD-NOT-RENDER",
          },
          createdAt: "2026-07-05T00:01:00Z",
        },
      ],
    }));
    const onPublished = vi.fn();

    const container = await renderWorkbench(
      {
        listPluginReleaseSubmissions,
        listPlatformPluginAuditLogs,
        approvePluginReleaseSubmission,
        rejectPluginReleaseSubmission: vi.fn(),
      },
      { onPublished },
    );

    expect(listPluginReleaseSubmissions).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("内容工厂");
    expect(container.textContent).toContain(
      "plugin.review.status.pending_review",
    );
    expect(container.textContent).toContain("plugin-package-scan:");
    expect(container.textContent).toContain("向运营团队申请注册码");
    expect(listPlatformPluginAuditLogs).toHaveBeenCalledWith({
      tenantIds: ["tenant-0001"],
      pluginName: "content-factory-app",
      marketplaceName: "limecloud",
    });
    expect(container.textContent).toContain("plugin.review.audit.title");
    expect(container.textContent).toContain("release_submission_published");
    expect(container.textContent).toContain("plugin-release-000001");
    expect(container.textContent).not.toContain("REG-SECRET-SHOULD-NOT-RENDER");

    await act(async () => {
      setTextValue(
        container.querySelector(
          '[data-testid="plugin-review-notes"]',
        ) as HTMLTextAreaElement,
        "准许发布",
      );
      await Promise.resolve();
    });
    await flush();

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="plugin-review-approve"]',
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
    });
    await flush();

    expect(approvePluginReleaseSubmission).toHaveBeenCalledWith(
      "submission-000001",
      { notes: "准许发布" },
    );
    expect(toast.success).toHaveBeenCalledWith(
      "plugin.review.toast.approveSucceeded",
    );
    expect(onPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "submission-000001",
        status: "published",
        publishedReleaseId: "plugin-release-000001",
      }),
    );

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="plugin-review-filter-all"]',
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
    });
    await flush();

    expect(container.textContent).toContain("plugin.review.status.published");
  });

  it("应要求驳回理由并提交 reject 请求", async () => {
    const pending = buildSubmission();
    const rejected = buildSubmission({
      status: "rejected",
      reviewNotes: "签名证据不完整",
      reviewDecisionAt: "2026-07-05T00:02:00Z",
      updatedAt: "2026-07-05T00:02:00Z",
    });
    const rejectPluginReleaseSubmission = vi.fn(async () => rejected);
    const container = await renderWorkbench({
      listPluginReleaseSubmissions: vi.fn(async () => ({ items: [pending] })),
      approvePluginReleaseSubmission: vi.fn(),
      rejectPluginReleaseSubmission,
    });

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="plugin-review-reject"]',
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
    });
    await flush();

    expect(rejectPluginReleaseSubmission).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "plugin.review.toast.reasonRequired",
    );

    await act(async () => {
      setTextValue(
        container.querySelector(
          '[data-testid="plugin-review-reject-reason"]',
        ) as HTMLTextAreaElement,
        "签名证据不完整",
      );
      await Promise.resolve();
    });
    await flush();

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="plugin-review-reject"]',
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
    });
    await flush();

    expect(rejectPluginReleaseSubmission).toHaveBeenCalledWith(
      "submission-000001",
      { reason: "签名证据不完整" },
    );
    expect(toast.success).toHaveBeenCalledWith(
      "plugin.review.toast.rejectSucceeded",
    );
  });
});
