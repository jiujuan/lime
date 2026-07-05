import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bulkPublishPlugin,
  completeClientPluginPackageUploadSession,
  completePluginPackageUploadSession,
  approvePluginReleaseSubmission,
  createClientPluginPackageUploadSession,
  createClientPluginReleaseSubmission,
  createPluginPackageUploadSession,
  listPluginReleaseSubmissions,
  listPlatformPluginAuditLogs,
  preflightBulkPublishPlugin,
  preflightClientPluginReleaseSubmission,
  rejectPluginReleaseSubmission,
  summarizePluginPublishPreflight,
  uploadClientPluginPackageContent,
  uploadPluginPackageContent,
  type BulkPublishPluginPayload,
} from "./oemCloudPluginPublish";

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
      manifestSummary: {
        schemaVersion: "plugin-publish-summary/v1",
        name: "content-factory-app",
        version: "0.3.0",
      },
    },
    release: {
      version: "0.3.0",
      packageUrl: "https://cdn.limeai.run/plugins/content-factory-app.zip",
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
        registrationState: "active",
        registrationCode: "REG-CODE-001",
      },
    ],
  };
}

describe("oemCloudPluginPublish", () => {
  beforeEach(() => {
    delete window.__LIME_BOOTSTRAP__;
    window.__LIME_OEM_CLOUD__ = {
      enabled: true,
      baseUrl: "https://user.limeai.run",
      tenantId: "tenant-0001",
    };
    window.__LIME_SESSION_TOKEN__ = "session-token-001";
  });

  afterEach(() => {
    delete window.__LIME_BOOTSTRAP__;
    delete window.__LIME_OEM_CLOUD__;
    delete window.__LIME_SESSION_TOKEN__;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("应使用平台发布预检接口并携带 session token", async () => {
    const payload = buildPayload();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: "success",
        data: {
          valid: true,
          blockers: [],
          normalizedPayload: {
            ...payload,
            targets: [{ ...payload.targets[0], registrationCode: "" }],
          },
          targetImpact: [{ tenantId: "tenant-0001", action: "created" }],
          signatureVerification: {
            status: "verified",
            verifiedAt: "2026-07-05T00:00:01.000Z",
            evidenceRef: "sigstore:content-factory-app@0.3.0",
          },
          checkedAt: "2026-07-05T00:00:02.000Z",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await preflightBulkPublishPlugin(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/platform/plugins/bulk-publish/preflight",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer session-token-001",
        }),
        body: JSON.stringify(payload),
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.normalizedPayload?.targets[0]?.registrationCode).toBe("");
    expect(result.signatureVerification?.status).toBe("verified");
    expect(summarizePluginPublishPreflight(result)).toEqual({
      valid: true,
      blockerCount: 0,
      warningCount: 0,
      targetCount: 1,
      updatedTargetCount: 0,
    });
  });

  it("应解析预检阻断项而不是把业务阻断抛成异常", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: "success",
        data: {
          valid: false,
          blockers: [
            {
              code: "validation_failed",
              field: "release.signatureProof",
              severity: "blocker",
              message: "signature proof 不能为空",
            },
          ],
          checkedAt: "2026-07-05T00:00:02.000Z",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await preflightBulkPublishPlugin(buildPayload());

    expect(result.valid).toBe(false);
    expect(result.blockers).toEqual([
      {
        code: "validation_failed",
        field: "release.signatureProof",
        severity: "blocker",
        message: "signature proof 不能为空",
      },
    ]);
  });

  it("应调用最终 bulk publish 接口", async () => {
    const payload = buildPayload();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: "success",
        data: {
          catalog: { pluginName: "content-factory-app" },
          release: { version: "0.3.0" },
          targets: [
            {
              tenantId: "tenant-0001",
              action: "updated",
              enablement: { id: "enablement-001" },
            },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await bulkPublishPlugin(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/platform/plugins/bulk-publish",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    expect(result.targets).toEqual([
      {
        tenantId: "tenant-0001",
        action: "updated",
        enablement: { id: "enablement-001" },
      },
    ]);
  });

  it("应按插件和租户过滤平台 plugin audit logs", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: "success",
        data: {
          items: [
            {
              id: "plugin-audit-000001",
              tenantId: "tenant-0001",
              pluginName: "content-factory-app",
              marketplaceName: "limecloud",
              releaseId: "plugin-release-000001",
              operator: "reviewer-0001",
              action: "release_submission_published",
              summary: "plugin release published",
              metadata: {
                packageHash: PACKAGE_HASH,
              },
              createdAt: "2026-07-05T00:01:00Z",
            },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listPlatformPluginAuditLogs({
      tenantIds: ["tenant-0001"],
      pluginName: "content-factory-app",
      marketplaceName: "limecloud",
      action: "release_submission_published",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/platform/plugins/audit-logs?tenantId=tenant-0001&pluginName=content-factory-app&marketplaceName=limecloud&action=release_submission_published",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer session-token-001",
        }),
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "plugin-audit-000001",
        tenantId: "tenant-0001",
        releaseId: "plugin-release-000001",
        action: "release_submission_published",
        metadata: { packageHash: PACKAGE_HASH },
      }),
    ]);
  });

  it("应创建上传会话、上传包内容并完成服务端扫描", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          code: 201,
          data: {
            id: "plugin-upload-000001",
            tenantId: "tenant-0001",
            pluginName: "content-factory-app",
            marketplaceName: "limecloud",
            version: "0.3.0",
            expectedPackageHash: PACKAGE_HASH,
            expectedManifestHash: MANIFEST_HASH,
            objectKey:
              "plugins/limecloud/content-factory-app/0.3.0/plugin-upload-000001.lpkg",
            uploadUrl:
              "/api/v1/platform/plugins/package-upload-sessions/plugin-upload-000001/content",
            contentType: "application/zip",
            sizeBytes: 2,
            status: "created",
            expiresAt: "2026-07-05T00:15:00Z",
            createdAt: "2026-07-05T00:00:00Z",
            updatedAt: "2026-07-05T00:00:00Z",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          data: {
            sessionId: "plugin-upload-000001",
            status: "uploaded",
            sizeBytes: 2,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          data: {
            session: {
              id: "plugin-upload-000001",
              tenantId: "tenant-0001",
              pluginName: "content-factory-app",
              marketplaceName: "limecloud",
              version: "0.3.0",
              expectedPackageHash: PACKAGE_HASH,
              expectedManifestHash: MANIFEST_HASH,
              objectKey:
                "plugins/limecloud/content-factory-app/0.3.0/plugin-upload-000001.lpkg",
              uploadUrl:
                "/api/v1/platform/plugins/package-upload-sessions/plugin-upload-000001/content",
              packageUrl:
                "https://packages.limecloud.example/plugins/limecloud/content-factory-app/0.3.0/plugin-upload-000001.lpkg",
              contentType: "application/zip",
              sizeBytes: 2,
              status: "verified",
              expiresAt: "2026-07-05T00:15:00Z",
              createdAt: "2026-07-05T00:00:00Z",
              updatedAt: "2026-07-05T00:00:03Z",
            },
            scanReport: {
              id: "scan-plugin-upload-000001",
              sessionId: "plugin-upload-000001",
              packageHash: PACKAGE_HASH,
              manifestHash: MANIFEST_HASH,
              sizeBytes: 2,
              fileCount: 1,
              status: "passed",
              evidenceRef: `plugin-package-scan:${PACKAGE_HASH}`,
              createdAt: "2026-07-05T00:00:03Z",
            },
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const session = await createPluginPackageUploadSession({
      tenantId: "tenant-0001",
      pluginName: "content-factory-app",
      marketplaceName: "limecloud",
      version: "0.3.0",
      expectedPackageHash: PACKAGE_HASH,
      expectedManifestHash: MANIFEST_HASH,
      sizeBytes: 2,
      contentType: "application/zip",
    });
    const uploaded = await uploadPluginPackageContent({
      sessionId: session.id,
      uploadUrl: session.uploadUrl,
      contentBase64: "aGk=",
      contentType: "application/zip",
    });
    const completed = await completePluginPackageUploadSession(session.id);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://user.limeai.run/api/v1/platform/plugins/package-upload-sessions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://user.limeai.run/api/v1/platform/plugins/package-upload-sessions/plugin-upload-000001/content",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "Content-Type": "application/zip",
          Authorization: "Bearer session-token-001",
        }),
        body: expect.any(ArrayBuffer),
      }),
    );
    expect(
      new Uint8Array(
        (fetchMock.mock.calls[1]?.[1] as { body: ArrayBuffer }).body,
      ),
    ).toEqual(new Uint8Array([104, 105]));
    expect(uploaded.status).toBe("uploaded");
    expect(completed.session.status).toBe("verified");
    expect(completed.scanReport.status).toBe("passed");
  });

  it("开发者上传应使用 public client 上传路径并过滤旧 platform uploadUrl", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          code: 201,
          data: {
            id: "plugin-upload-000001",
            tenantId: "tenant-0001",
            developerUserId: "user-0001",
            pluginName: "content-factory-app",
            marketplaceName: "limecloud",
            version: "0.3.0",
            expectedPackageHash: PACKAGE_HASH,
            expectedManifestHash: MANIFEST_HASH,
            objectKey:
              "plugins/limecloud/content-factory-app/0.3.0/plugin-upload-000001.lpkg",
            uploadUrl:
              "/api/v1/platform/plugins/package-upload-sessions/plugin-upload-000001/content",
            contentType: "application/zip",
            sizeBytes: 2,
            status: "created",
            expiresAt: "2026-07-05T00:15:00Z",
            createdAt: "2026-07-05T00:00:00Z",
            updatedAt: "2026-07-05T00:00:00Z",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          data: {
            sessionId: "plugin-upload-000001",
            status: "uploaded",
            sizeBytes: 2,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          data: {
            session: {
              id: "plugin-upload-000001",
              tenantId: "tenant-0001",
              developerUserId: "user-0001",
              pluginName: "content-factory-app",
              marketplaceName: "limecloud",
              version: "0.3.0",
              expectedPackageHash: PACKAGE_HASH,
              expectedManifestHash: MANIFEST_HASH,
              objectKey:
                "plugins/limecloud/content-factory-app/0.3.0/plugin-upload-000001.lpkg",
              uploadUrl:
                "/api/v1/public/tenants/tenant-0001/client/plugins/package-upload-sessions/plugin-upload-000001/content",
              packageUrl:
                "https://packages.limecloud.example/plugins/limecloud/content-factory-app/0.3.0/plugin-upload-000001.lpkg",
              contentType: "application/zip",
              sizeBytes: 2,
              status: "verified",
              expiresAt: "2026-07-05T00:15:00Z",
              createdAt: "2026-07-05T00:00:00Z",
              updatedAt: "2026-07-05T00:00:03Z",
            },
            scanReport: {
              id: "scan-plugin-upload-000001",
              sessionId: "plugin-upload-000001",
              packageHash: PACKAGE_HASH,
              manifestHash: MANIFEST_HASH,
              sizeBytes: 2,
              fileCount: 1,
              status: "passed",
              evidenceRef: `plugin-package-scan:${PACKAGE_HASH}`,
              createdAt: "2026-07-05T00:00:03Z",
            },
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const session = await createClientPluginPackageUploadSession({
      tenantId: "tenant-0001",
      pluginName: "content-factory-app",
      marketplaceName: "limecloud",
      version: "0.3.0",
      expectedPackageHash: PACKAGE_HASH,
      expectedManifestHash: MANIFEST_HASH,
      sizeBytes: 2,
      contentType: "application/zip",
    });
    await uploadClientPluginPackageContent({
      tenantId: "tenant-0001",
      sessionId: session.id,
      uploadUrl: session.uploadUrl,
      contentBase64: "aGk=",
      contentType: "application/zip",
    });
    const completed = await completeClientPluginPackageUploadSession({
      tenantId: "tenant-0001",
      sessionId: session.id,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/plugins/package-upload-sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          pluginName: "content-factory-app",
          marketplaceName: "limecloud",
          version: "0.3.0",
          expectedPackageHash: PACKAGE_HASH,
          expectedManifestHash: MANIFEST_HASH,
          sizeBytes: 2,
          contentType: "application/zip",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/plugins/package-upload-sessions/plugin-upload-000001/content",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/plugins/package-upload-sessions/plugin-upload-000001/complete",
      expect.objectContaining({ method: "POST" }),
    );
    expect(session.developerUserId).toBe("user-0001");
    expect(completed.session.status).toBe("verified");
  });

  it("开发者发布应创建审核单而不是直接调用 platform bulk publish", async () => {
    const payload = buildPayload();
    const { registrationCode: _registrationCode, ...expectedTarget } =
      payload.targets[0];
    const expectedPayload = {
      ...payload,
      targets: [{ ...expectedTarget, registrationState: "required" as const }],
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        code: 201,
        data: {
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
          payload: expectedPayload,
          payloadHash: PAYLOAD_HASH,
          preflight: {
            valid: true,
            blockers: [],
            checkedAt: "2026-07-05T00:00:02.000Z",
          },
          scanEvidenceRef: `plugin-package-scan:${PACKAGE_HASH}`,
          status: "pending_review",
          createdAt: "2026-07-05T00:00:03Z",
          updatedAt: "2026-07-05T00:00:03Z",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const submission = await createClientPluginReleaseSubmission({
      tenantId: "tenant-0001",
      uploadSessionId: "plugin-upload-000001",
      payload,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/plugins/release-submissions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          uploadSessionId: "plugin-upload-000001",
          payload: expectedPayload,
        }),
      }),
    );
    expect(submission.status).toBe("pending_review");
    expect(submission.payload.targets[0]).not.toHaveProperty(
      "registrationCode",
    );
    expect(submission.payload.targets[0]?.registrationState).toBe("required");
  });

  it("开发者发布预检应调用 public client preflight 并移除 registrationCode", async () => {
    const payload = buildPayload();
    const { registrationCode: _registrationCode, ...expectedTarget } =
      payload.targets[0];
    const expectedPayload = {
      ...payload,
      targets: [{ ...expectedTarget, registrationState: "required" as const }],
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        data: {
          valid: true,
          blockers: [],
          normalizedPayload: expectedPayload,
          targetImpact: [{ tenantId: "tenant-0001", action: "created" }],
          signatureVerification: { status: "verified" },
          checkedAt: "2026-07-05T00:00:02.000Z",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const preflight = await preflightClientPluginReleaseSubmission({
      tenantId: "tenant-0001",
      uploadSessionId: "plugin-upload-000001",
      payload,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://user.limeai.run/api/v1/public/tenants/tenant-0001/client/plugins/release-submissions/preflight",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          uploadSessionId: "plugin-upload-000001",
          payload: expectedPayload,
        }),
      }),
    );
    expect(preflight.valid).toBe(true);
    expect(preflight.normalizedPayload?.targets[0]).not.toHaveProperty(
      "registrationCode",
    );
    expect(preflight.normalizedPayload?.targets[0]?.registrationState).toBe(
      "required",
    );
  });

  it("平台审核应调用 release-submissions 的 list、approve 和 reject 接口", async () => {
    const payload = buildPayload();
    const { registrationCode: _submissionRegistrationCode, ...reviewTarget } =
      payload.targets[0];
    const reviewPayload = {
      ...payload,
      targets: [
        {
          ...reviewTarget,
          registrationState: "required" as const,
          registrationHint: "向运营团队申请注册码",
        },
      ],
    };
    const baseSubmission = {
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
      payload: reviewPayload,
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
        checkedAt: "2026-07-05T00:00:02.000Z",
      },
      scanEvidenceRef: `plugin-package-scan:${PACKAGE_HASH}`,
      status: "pending_review",
      createdAt: "2026-07-05T00:00:03Z",
      updatedAt: "2026-07-05T00:00:03Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          data: { items: [baseSubmission] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          data: {
            submission: {
              ...baseSubmission,
              status: "published",
              reviewNotes: "准许发布",
              reviewDecisionAt: "2026-07-05T00:01:00Z",
              publishedReleaseId: "plugin-release-000001",
              updatedAt: "2026-07-05T00:01:00Z",
            },
            publish: {
              catalog: { pluginName: "content-factory-app" },
              release: { id: "plugin-release-000001" },
              targets: [
                {
                  tenantId: "tenant-0001",
                  action: "created",
                  enablement: { id: "enablement-000001" },
                },
              ],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          data: {
            ...baseSubmission,
            status: "rejected",
            reviewNotes: "签名证据不完整",
            reviewDecisionAt: "2026-07-05T00:02:00Z",
            updatedAt: "2026-07-05T00:02:00Z",
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const listed = await listPluginReleaseSubmissions({
      tenantId: "tenant-0001",
      status: "pending_review",
    });
    const approved = await approvePluginReleaseSubmission("submission-000001", {
      notes: "准许发布",
    });
    const rejected = await rejectPluginReleaseSubmission("submission-000001", {
      reason: "签名证据不完整",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://user.limeai.run/api/v1/platform/plugins/release-submissions?tenantId=tenant-0001&status=pending_review",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://user.limeai.run/api/v1/platform/plugins/release-submissions/submission-000001/approve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ notes: "准许发布" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://user.limeai.run/api/v1/platform/plugins/release-submissions/submission-000001/reject",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "签名证据不完整" }),
      }),
    );
    expect(listed.items[0]?.status).toBe("pending_review");
    expect(listed.items[0]?.payload.targets[0]).not.toHaveProperty(
      "registrationCode",
    );
    expect(approved.submission.status).toBe("published");
    expect(approved.publish?.targets[0]?.tenantId).toBe("tenant-0001");
    expect(rejected.status).toBe("rejected");
  });

  it("缺少 session token 时应 fail closed", async () => {
    delete window.__LIME_SESSION_TOKEN__;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(preflightBulkPublishPlugin(buildPayload())).rejects.toThrow(
      "缺少品牌云端 Session Token",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
