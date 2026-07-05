import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";
import { PluginReleaseSubmissionStatusPanel } from "./PluginReleaseSubmissionStatusPanel";
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
const REGISTRATION_CODE = "REG-SECRET-SHOULD-NOT-RENDER";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];
const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
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
        registrationCode: REGISTRATION_CODE,
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

async function renderPanel(
  props: Parameters<typeof PluginReleaseSubmissionStatusPanel>[0],
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<PluginReleaseSubmissionStatusPanel {...props} />);
    await Promise.resolve();
  });
  mounted.push({ root, container });
  await flush();
  return { container, root };
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

describe("PluginReleaseSubmissionStatusPanel", () => {
  it("应加载开发者发布审核单并隐藏注册码明文", async () => {
    const listClientPluginReleaseSubmissions = vi.fn(async () => ({
      items: [buildSubmission()],
    }));

    const { container } = await renderPanel({
      targetTenantId: "tenant-0001",
      pluginName: "content-factory-app",
      marketplaceName: "limecloud",
      deps: { listClientPluginReleaseSubmissions },
    });

    expect(listClientPluginReleaseSubmissions).toHaveBeenCalledWith({
      tenantId: "tenant-0001",
      pluginName: "content-factory-app",
      marketplaceName: "limecloud",
    });
    expect(container.textContent).toContain("内容工厂");
    expect(container.textContent).toContain("plugin.review.status.pending_review");
    expect(container.textContent).toContain(PAYLOAD_HASH);
    expect(container.textContent).toContain("plugin-package-scan:");
    expect(container.textContent).not.toContain(REGISTRATION_CODE);
  });

  it("缺少租户时不请求云端并提示恢复路径", async () => {
    const listClientPluginReleaseSubmissions = vi.fn(async () => ({
      items: [buildSubmission()],
    }));

    const { container } = await renderPanel({
      targetTenantId: " ",
      pluginName: "content-factory-app",
      marketplaceName: "limecloud",
      deps: { listClientPluginReleaseSubmissions },
    });

    expect(listClientPluginReleaseSubmissions).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "plugin.publish.submissions.missingTenant",
    );
    expect(
      container.querySelector(
        '[data-testid="plugin-publish-submissions-refresh"]',
      ) as HTMLButtonElement,
    ).toHaveProperty("disabled", true);
  });

  it("应把最新提交结果合并到历史列表", async () => {
    const pending = buildSubmission();
    const published = buildSubmission({
      status: "published",
      reviewNotes: "准许发布",
      updatedAt: "2026-07-05T00:02:00Z",
    });
    const listClientPluginReleaseSubmissions = vi.fn(async () => ({
      items: [pending],
    }));
    const deps = { listClientPluginReleaseSubmissions };
    const props = {
      targetTenantId: "tenant-0001",
      pluginName: "content-factory-app",
      marketplaceName: "limecloud",
      deps,
    };
    const { container, root } = await renderPanel(props);

    await act(async () => {
      root.render(
        <PluginReleaseSubmissionStatusPanel
          {...props}
          latestSubmission={published}
        />,
      );
      await Promise.resolve();
    });
    await flush();

    expect(listClientPluginReleaseSubmissions).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("plugin.review.status.published");
    expect(container.textContent).toContain("准许发布");
  });

  it("加载失败时应停留在错误提示而不是伪造空结果", async () => {
    const listClientPluginReleaseSubmissions = vi.fn(async () => {
      throw new Error("加载失败");
    });

    const { container } = await renderPanel({
      targetTenantId: "tenant-0001",
      pluginName: "content-factory-app",
      marketplaceName: "limecloud",
      deps: { listClientPluginReleaseSubmissions },
    });

    expect(container.textContent).toContain("加载失败");
    expect(toast.error).toHaveBeenCalledWith("加载失败");
  });
});
