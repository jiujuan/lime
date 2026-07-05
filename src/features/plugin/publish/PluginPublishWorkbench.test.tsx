import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";
import {
  PluginPublishWorkbench,
  type PluginPublishWorkbenchProps,
} from "./PluginPublishWorkbench";
import type { PluginInstallReviewResult } from "@/lib/api/plugins";
import type {
  BulkPublishPluginPayload,
  BulkPublishPluginPreflightResponse,
} from "@/lib/api/oemCloudPluginPublish";
import type { InstalledPluginState } from "../types";

const PACKAGE_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MANIFEST_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PAYLOAD_HASH =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const UPLOADED_PACKAGE_HASH =
  "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const UPLOADED_PACKAGE_URL =
  "https://packages.limecloud.example/plugins/limecloud/content-factory-app/0.3.0/plugin-upload-000001.lpkg";

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

function buildReview(): PluginInstallReviewResult {
  return {
    review: {
      displayName: "内容工厂",
      packageHash: PACKAGE_HASH,
      manifestHash: MANIFEST_HASH,
    },
    state: {
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
        status: "active",
        appType: "workflow",
        runtimeTargets: ["desktop"],
        requires: {
          appRuntime: "^0.8.0",
          capabilities: {
            "lime.ui": "^1.0.0",
          },
        },
        entries: [{ key: "dashboard", kind: "page", title: "首页" }],
      },
      projection: {
        requiredCapabilities: [{ capability: "lime.ui" }],
      },
    } as unknown as InstalledPluginState,
  } as unknown as PluginInstallReviewResult;
}

function buildExportedPluginPackage() {
  return {
    sourceKind: "local_folder" as const,
    sourceUri: "/tmp/plugin",
    appDir: "/tmp/plugin",
    manifestSource: "plugin_json" as const,
    pluginManifest: {},
    manifest: buildReview().state.manifest,
    manifestHash: MANIFEST_HASH,
    packageHash: UPLOADED_PACKAGE_HASH,
    sizeBytes: 2,
    fileCount: 1,
    contentType: "application/zip",
    packageBase64: "aGk=",
    exportedAt: "2026-07-05T00:00:00.000Z",
  };
}

function buildUploadSession() {
  return {
    id: "plugin-upload-000001",
    tenantId: "tenant-0001",
    pluginName: "content-factory-app",
    marketplaceName: "limecloud",
    version: "0.3.0",
    expectedPackageHash: UPLOADED_PACKAGE_HASH,
    expectedManifestHash: MANIFEST_HASH,
    objectKey:
      "plugins/limecloud/content-factory-app/0.3.0/plugin-upload-000001.lpkg",
    uploadUrl:
      "/api/v1/platform/plugins/package-upload-sessions/plugin-upload-000001/content",
    contentType: "application/zip",
    sizeBytes: 2,
    status: "created" as const,
    expiresAt: "2026-07-05T00:15:00Z",
    createdAt: "2026-07-05T00:00:00Z",
    updatedAt: "2026-07-05T00:00:00Z",
  };
}

function buildCompletedUploadSession(uploadSession = buildUploadSession()) {
  return {
    session: {
      ...uploadSession,
      packageUrl: UPLOADED_PACKAGE_URL,
      status: "verified" as const,
      updatedAt: "2026-07-05T00:00:03Z",
    },
    scanReport: {
      id: "scan-plugin-upload-000001",
      sessionId: "plugin-upload-000001",
      packageHash: UPLOADED_PACKAGE_HASH,
      manifestHash: MANIFEST_HASH,
      sizeBytes: 2,
      fileCount: 1,
      status: "passed" as const,
      evidenceRef: "plugin-package-scan:fixture",
      createdAt: "2026-07-05T00:00:03Z",
    },
  };
}

async function flush(times = 8) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  });
}

function setInputValue(
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
  deps: NonNullable<Parameters<typeof PluginPublishWorkbench>[0]["deps"]>,
  props: Omit<PluginPublishWorkbenchProps, "deps"> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<PluginPublishWorkbench deps={deps} {...props} />);
    await Promise.resolve();
  });
  mounted.push({ root, container });
  return container;
}

type PreflightRequest = {
  tenantId?: string;
  uploadSessionId: string;
  payload: BulkPublishPluginPayload;
};

async function renderUploadedWorkbench(
  buildPreflight: (
    request: PreflightRequest,
  ) => BulkPublishPluginPreflightResponse,
) {
  const uploadSession = buildUploadSession();
  const preflightClientPluginReleaseSubmission = vi.fn(
    async (request: PreflightRequest) => buildPreflight(request),
  );
  const createClientPluginReleaseSubmission = vi.fn();
  const deps = {
    selectLocalPluginDirectory: vi.fn(async () => "/tmp/plugin"),
    reviewLocalPluginPackage: vi.fn(async () => buildReview()),
    exportLocalPluginPackage: vi.fn(async () => buildExportedPluginPackage()),
    createClientPluginPackageUploadSession: vi.fn(async () => uploadSession),
    uploadClientPluginPackageContent: vi.fn(async () => ({
      sessionId: "plugin-upload-000001",
      status: "uploaded" as const,
      sizeBytes: 2,
    })),
    completeClientPluginPackageUploadSession: vi.fn(async () =>
      buildCompletedUploadSession(uploadSession),
    ),
    preflightClientPluginReleaseSubmission,
    createClientPluginReleaseSubmission,
    listClientPluginReleaseSubmissions: vi.fn(async () => ({ items: [] })),
    resolveTenantId: () => "tenant-0001",
    now: () => new Date("2026-07-05T00:00:00.000Z"),
  };
  const container = await renderWorkbench(deps);

  await act(async () => {
    (
      container.querySelector(
        '[data-testid="plugin-publish-select-package"]',
      ) as HTMLButtonElement
    ).click();
    await Promise.resolve();
  });
  await flush();

  await act(async () => {
    (
      container.querySelector(
        '[data-testid="plugin-publish-upload-package"]',
      ) as HTMLButtonElement
    ).click();
    await Promise.resolve();
  });
  await flush();

  await act(async () => {
    setInputValue(
      container.querySelector(
        '[data-testid="plugin-publish-signature-ref"]',
      ) as HTMLInputElement,
      "sigstore:content-factory-app@0.3.0",
    );
    setInputValue(
      container.querySelector(
        '[data-testid="plugin-publish-public-key-id"]',
      ) as HTMLInputElement,
      "plugin-release-key",
    );
    setInputValue(
      container.querySelector(
        '[data-testid="plugin-publish-payload-hash"]',
      ) as HTMLInputElement,
      PAYLOAD_HASH,
    );
    setInputValue(
      container.querySelector(
        '[data-testid="plugin-publish-signature"]',
      ) as HTMLTextAreaElement,
      "base64-signature",
    );
    await Promise.resolve();
  });
  await flush();

  return {
    container,
    deps,
    preflightClientPluginReleaseSubmission,
    createClientPluginReleaseSubmission,
  };
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

describe("PluginPublishWorkbench", () => {
  it("应完成选择本地包、上传并提交审核单的最小闭环", async () => {
    const selectLocalPluginDirectory = vi.fn(async () => "/tmp/plugin");
    const reviewLocalPluginPackage = vi.fn(async () => buildReview());
    const exportLocalPluginPackage = vi.fn(async () =>
      buildExportedPluginPackage(),
    );
    const uploadSession = buildUploadSession();
    const createClientPluginPackageUploadSession = vi.fn(
      async () => uploadSession,
    );
    const uploadClientPluginPackageContent = vi.fn(async () => ({
      sessionId: "plugin-upload-000001",
      status: "uploaded" as const,
      sizeBytes: 2,
    }));
    const completeClientPluginPackageUploadSession = vi.fn(async () =>
      buildCompletedUploadSession(uploadSession),
    );
    const preflightClientPluginReleaseSubmission = vi.fn(
      async (request: {
        tenantId?: string;
        uploadSessionId: string;
        payload: BulkPublishPluginPayload;
      }) => ({
        valid: true,
        blockers: [],
        checkedAt: "2026-07-05T00:00:01.000Z",
        normalizedPayload: {
          ...request.payload,
          targets: [{ ...request.payload.targets[0], registrationCode: "" }],
        },
        targetImpact: [{ tenantId: "tenant-0001", action: "created" as const }],
        signatureVerification: { status: "verified" as const },
      }),
    );
    const createClientPluginReleaseSubmission = vi.fn(
      async (request: {
        tenantId?: string;
        uploadSessionId: string;
        payload: BulkPublishPluginPayload;
      }) => ({
        id: "submission-000001",
        tenantId: "tenant-0001",
        developerUserId: "user-0001",
        pluginName: "content-factory-app",
        marketplaceName: "limecloud",
        version: "0.3.0",
        uploadSessionId: "plugin-upload-000001",
        packageUrl: UPLOADED_PACKAGE_URL,
        packageHash: UPLOADED_PACKAGE_HASH,
        manifestHash: MANIFEST_HASH,
        payload: request.payload,
        payloadHash: PAYLOAD_HASH,
        preflight: {
          valid: true,
          blockers: [],
          checkedAt: "2026-07-05T00:00:01.000Z",
          normalizedPayload: {
            ...request.payload,
            targets: [{ ...request.payload.targets[0], registrationCode: "" }],
          },
          targetImpact: [
            { tenantId: "tenant-0001", action: "created" as const },
          ],
          signatureVerification: { status: "verified" as const },
        },
        scanEvidenceRef: "plugin-package-scan:fixture",
        status: "pending_review" as const,
        createdAt: "2026-07-05T00:00:04Z",
        updatedAt: "2026-07-05T00:00:04Z",
      }),
    );
    const listClientPluginReleaseSubmissions = vi.fn(async () => ({
      items: [],
    }));
    const onSubmissionCreated = vi.fn();
    const container = await renderWorkbench(
      {
        selectLocalPluginDirectory,
        reviewLocalPluginPackage,
        exportLocalPluginPackage,
        createClientPluginPackageUploadSession,
        uploadClientPluginPackageContent,
        completeClientPluginPackageUploadSession,
        preflightClientPluginReleaseSubmission,
        createClientPluginReleaseSubmission,
        listClientPluginReleaseSubmissions,
        resolveTenantId: () => "tenant-0001",
        now: () => new Date("2026-07-05T00:00:00.000Z"),
      },
      { onSubmissionCreated },
    );

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="plugin-publish-select-package"]',
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
    });
    await flush();

    expect(reviewLocalPluginPackage).toHaveBeenCalledWith({
      appDir: "/tmp/plugin",
      profile: undefined,
    });
    expect(container.textContent).toContain("内容工厂");
    expect(container.textContent).toContain(PACKAGE_HASH);

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="plugin-publish-upload-package"]',
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
    });
    await flush();

    expect(createClientPluginPackageUploadSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-0001",
        pluginName: "content-factory-app",
        expectedPackageHash: UPLOADED_PACKAGE_HASH,
        expectedManifestHash: MANIFEST_HASH,
      }),
    );
    expect(uploadClientPluginPackageContent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-0001",
        sessionId: "plugin-upload-000001",
        contentBase64: "aGk=",
      }),
    );
    expect(container.textContent).toContain("plugin.publish.upload.verified:1");
    expect(toast.success).toHaveBeenCalledWith(
      "plugin.publish.toast.uploadSucceeded",
    );

    await act(async () => {
      setInputValue(
        container.querySelector(
          '[data-testid="plugin-publish-signature-ref"]',
        ) as HTMLInputElement,
        "sigstore:content-factory-app@0.3.0",
      );
      setInputValue(
        container.querySelector(
          '[data-testid="plugin-publish-public-key-id"]',
        ) as HTMLInputElement,
        "plugin-release-key",
      );
      setInputValue(
        container.querySelector(
          '[data-testid="plugin-publish-payload-hash"]',
        ) as HTMLInputElement,
        PAYLOAD_HASH,
      );
      setInputValue(
        container.querySelector(
          '[data-testid="plugin-publish-signature"]',
        ) as HTMLTextAreaElement,
        "base64-signature",
      );
      await Promise.resolve();
    });
    await flush();

    expect(
      (
        container.querySelector(
          '[data-testid="plugin-publish-confirm"]',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="plugin-publish-preflight"]',
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
    });
    await flush();

    expect(preflightClientPluginReleaseSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-0001",
        uploadSessionId: "plugin-upload-000001",
        payload: expect.objectContaining({
          catalog: expect.objectContaining({
            pluginName: "content-factory-app",
            marketplaceName: "limecloud",
          }),
          release: expect.objectContaining({
            packageUrl: UPLOADED_PACKAGE_URL,
            packageHash: UPLOADED_PACKAGE_HASH,
            manifestHash: MANIFEST_HASH,
          }),
        }),
      }),
    );
    expect(createClientPluginReleaseSubmission).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      "plugin.publish.toast.preflightPassed",
    );
    expect(container.textContent).toContain("plugin.publish.preflight.valid:1");
    const preflightPlan = container.querySelector(
      '[data-testid="plugin-publish-preflight-plan"]',
    );
    expect(preflightPlan).not.toBeNull();
    expect(preflightPlan?.textContent).toContain(
      "plugin.publish.preflight.plan.title",
    );
    expect(preflightPlan?.textContent).toContain(
      "content-factory-app@limecloud",
    );
    expect(preflightPlan?.textContent).toContain("0.3.0");
    expect(preflightPlan?.textContent).toContain("tenant-0001");
    expect(
      (
        container.querySelector(
          '[data-testid="plugin-publish-confirm"]',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(false);

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="plugin-publish-confirm"]',
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
    });
    await flush();

    expect(createClientPluginReleaseSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-0001",
        uploadSessionId: "plugin-upload-000001",
        payload: expect.objectContaining({
          catalog: expect.objectContaining({
            pluginName: "content-factory-app",
            marketplaceName: "limecloud",
          }),
          release: expect.objectContaining({
            packageUrl: UPLOADED_PACKAGE_URL,
            packageHash: UPLOADED_PACKAGE_HASH,
            manifestHash: MANIFEST_HASH,
          }),
          targets: [expect.objectContaining({ tenantId: "tenant-0001" })],
        }),
      }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "plugin.publish.toast.publishSucceeded",
    );
    expect(onSubmissionCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "submission-000001",
        status: "pending_review",
        uploadSessionId: "plugin-upload-000001",
      }),
    );
    expect(container.textContent).toContain("plugin.publish.preflight.valid:1");
    expect(container.textContent).toContain("plugin.publish.result.summary");
    expect(container.textContent).toContain(
      "plugin.review.status.pending_review",
    );
    expect(listClientPluginReleaseSubmissions).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-0001",
        marketplaceName: "limecloud",
      }),
    );
  });

  it("LimeCore 签名验证失败时应展示服务端预检阻断并保持提交禁用", async () => {
    const {
      container,
      preflightClientPluginReleaseSubmission,
      createClientPluginReleaseSubmission,
    } = await renderUploadedWorkbench((request) => ({
      valid: false,
      blockers: [
        {
          code: "signature_verification_failed",
          field: "release.signatureProof",
          severity: "blocker",
          message: "签名验证失败",
        },
      ],
      checkedAt: "2026-07-05T00:00:01.000Z",
      normalizedPayload: {
        ...request.payload,
        targets: [{ ...request.payload.targets[0], registrationCode: "" }],
      },
      targetImpact: [{ tenantId: "tenant-0001", action: "created" as const }],
      signatureVerification: {
        status: "failed" as const,
        failureReason: "signature mismatch",
      },
    }));

    await act(async () => {
      (
        container.querySelector(
          '[data-testid="plugin-publish-preflight"]',
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
    });
    await flush();

    expect(preflightClientPluginReleaseSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-0001",
        uploadSessionId: "plugin-upload-000001",
      }),
    );
    expect(createClientPluginReleaseSubmission).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "plugin.publish.toast.preflightBlocked",
    );
    expect(toast.error).not.toHaveBeenCalledWith(
      "plugin.publish.toast.packageFailed",
    );
    expect(container.textContent).toContain(
      "plugin.publish.preflight.invalid:1",
    );
    expect(container.textContent).toContain("signature_verification_failed");
    expect(container.textContent).toContain(
      "plugin.publish.preflight.plan.signature.failed",
    );
    expect(
      (
        container.querySelector(
          '[data-testid="plugin-publish-confirm"]',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("本地阻断或未完成云端上传前不允许提交审核", async () => {
    const container = await renderWorkbench({
      selectLocalPluginDirectory: vi.fn(async () => null),
      reviewLocalPluginPackage: vi.fn(),
      createClientPluginReleaseSubmission: vi.fn(),
      listClientPluginReleaseSubmissions: vi.fn(async () => ({ items: [] })),
      resolveTenantId: () => "tenant-0001",
    });

    const publishButton = container.querySelector(
      '[data-testid="plugin-publish-confirm"]',
    ) as HTMLButtonElement;

    expect(publishButton.disabled).toBe(true);
  });
});
