import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeViaHttp: vi.fn(),
  isDevBridgeAvailable: vi.fn(),
  normalizeDevBridgeError: vi.fn((cmd: string, error: unknown) => {
    if (error instanceof Error) {
      return new Error(`[${cmd}] ${error.message}`);
    }
    return new Error(`[${cmd}] ${String(error)}`);
  }),
}));

vi.mock("../dev-bridge/http-client", () => ({
  invokeViaHttp: mocks.invokeViaHttp,
  isDevBridgeAvailable: mocks.isDevBridgeAvailable,
  normalizeDevBridgeError: mocks.normalizeDevBridgeError,
}));

import {
  clearMocks,
  convertFileSrc,
  invoke,
  invokeMockOnly,
  mockCommand,
} from "./core";

function clearElectronBridge(): void {
  delete (window as any).electronAPI;
}

describe("desktop-host/core invoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMocks();
    mocks.isDevBridgeAvailable.mockReturnValue(true);
    clearElectronBridge();
  });

  it("Electron host 可用时 production invoke 走 Desktop Host IPC", async () => {
    const electronInvoke = vi.fn().mockResolvedValueOnce("/real/electron/root");
    (window as any).electronAPI = {
      invoke: electronInvoke,
      listen: vi.fn(),
      emit: vi.fn(),
    };

    const result = await invoke<string>("workspace_get_projects_root");

    expect(result).toBe("/real/electron/root");
    expect(electronInvoke).toHaveBeenCalledWith(
      "workspace_get_projects_root",
      undefined,
    );
    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("无 Electron host 时 production invoke 走 HTTP bridge", async () => {
    mocks.invokeViaHttp.mockResolvedValueOnce("/real/backend/root");

    const result = await invoke<string>("workspace_get_projects_root");

    expect(result).toBe("/real/backend/root");
    expect(mocks.invokeViaHttp).toHaveBeenCalledWith(
      "workspace_get_projects_root",
      undefined,
    );
  });

  it("HTTP bridge 失败时 production invoke 直接抛出规范化错误", async () => {
    mocks.invokeViaHttp.mockRejectedValueOnce(new Error("Failed to fetch"));

    await expect(invoke("workspace_get_projects_root")).rejects.toThrow(
      "[workspace_get_projects_root] Failed to fetch",
    );

    expect(mocks.normalizeDevBridgeError).toHaveBeenCalledWith(
      "workspace_get_projects_root",
      expect.any(Error),
    );
  });

  it("无 Electron host 且无 HTTP bridge 时 production invoke fail-closed", async () => {
    mocks.isDevBridgeAvailable.mockReturnValue(false);

    await expect(invoke("workspace_get_projects_root")).rejects.toThrow(
      'Desktop Host IPC 不可用，命令 "workspace_get_projects_root" 无法进入 App Server JSON-RPC 主链',
    );

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("convertFileSrc 只委托 Electron host", () => {
    (window as any).electronAPI = {
      invoke: vi.fn(),
      listen: vi.fn(),
      emit: vi.fn(),
      convertFileSrc: vi.fn(() => "app://asset/example.png"),
    };

    expect(convertFileSrc("/tmp/example.png")).toBe("app://asset/example.png");
    expect((window as any).electronAPI.convertFileSrc).toHaveBeenCalledWith(
      "/tmp/example.png",
      undefined,
    );
  });

  it("convertFileSrc 无 Electron host 时 fail-closed", () => {
    expect(() => convertFileSrc("/tmp/example.png")).toThrow(
      "Desktop Host IPC 不可用，本地文件路径无法转换",
    );
  });

  it("显式 mock 入口可返回默认 mock，不访问 bridge", async () => {
    await expect(invokeMockOnly("companion_get_pet_status")).resolves.toEqual(
      expect.objectContaining({ connected: false }),
    );

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("显式 mock 入口不应再次探测 HTTP bridge", async () => {
    await expect(invokeMockOnly("get_config")).resolves.toEqual(
      expect.objectContaining({
        server: expect.objectContaining({
          port: 8787,
        }),
      }),
    );

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("显式 mock API 在非测试环境必须 fail-closed", async () => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITEST", "");

    try {
      await expect(invokeMockOnly("get_config")).rejects.toThrow(
        "invokeMockOnly 只能在测试环境使用",
      );
      expect(() => mockCommand("get_config", vi.fn())).toThrow(
        "mockCommand 只能在测试环境使用",
      );
      expect(() => clearMocks()).toThrow(
        "clearMocks 只能在测试环境使用",
      );
      expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("默认项目 mock 已退场并 fail closed", async () => {
    await expect(
      invokeMockOnly("get_or_create_default_project"),
    ).rejects.toThrow(
      '未注册命令 "get_or_create_default_project"',
    );

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("Agent App uninstall mock 没有精确确认短语时不移除 installed state", async () => {
    const before = await invokeMockOnly<{
      states: Array<{ appId: string }>;
    }>("agent_app_list_installed");
    const appId = before.states[0]?.appId ?? "content-factory-app";

    const result = await invokeMockOnly<{
      status: string;
      blockerCodes: string[];
      removedTargetCount: number;
      missingTargetCount: number;
      list: { states: Array<{ appId: string }> };
    }>("agent_app_uninstall", {
      request: {
        appId,
        mode: "delete-data",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blockerCodes).toContain("CONFIRMATION_MISMATCH");
    expect(result.removedTargetCount).toBe(0);
    expect(result.missingTargetCount).toBe(0);
    expect(result.list.states.some((state) => state.appId === appId)).toBe(
      true,
    );

    const after = await invokeMockOnly<{
      states: Array<{ appId: string }>;
    }>("agent_app_list_installed");
    expect(after.states.some((state) => state.appId === appId)).toBe(true);
    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("Agent App uninstall mock 带精确确认短语时移除 installed state", async () => {
    const before = await invokeMockOnly<{
      states: Array<{ appId: string; identity: { packageHash: string } }>;
    }>("agent_app_list_installed");
    const state = before.states[0];
    const appId = state?.appId ?? "content-factory-app";
    const packageHash = state?.identity.packageHash ?? "package-fnv1a-mock";

    const result = await invokeMockOnly<{
      status: string;
      removedTargetCount: number;
      deleteEvidence: { status: string; removedTargets: unknown[] } | null;
      list: { states: Array<{ appId: string }> };
    }>("agent_app_uninstall", {
      request: {
        appId,
        mode: "delete-data",
        confirmationPhrase: `DELETE_AGENT_APP_DATA ${appId} ${packageHash}`,
      },
    });

    expect(result.status).toBe("deleted");
    expect(result.removedTargetCount).toBeGreaterThan(0);
    expect(result.deleteEvidence?.status).toBe("deleted");
    expect(result.deleteEvidence?.removedTargets.length).toBeGreaterThan(0);
    expect(result.list.states.some((item) => item.appId === appId)).toBe(false);
    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("Agent App shell launch mock 应返回 dev shell 启动结果", async () => {
    await expect(
      invokeMockOnly("agent_app_launch_shell", {
        request: {
          descriptor: {
            descriptorVersion: 1,
            appId: "content-factory-app",
            packageHash: "package-fnv1a-mock",
            manifestHash: "manifest-fnv1a-mock",
            installMode: "standalone",
            runtimeProfile: {
              shellKind: "app_shell",
              installMode: "standalone",
            },
            entry: {
              entryKey: "dashboard",
            },
          },
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        appId: "content-factory-app",
        status: "launched",
        devShell: true,
        blockerCodes: [],
        runtimeStatus: expect.objectContaining({
          status: "running",
        }),
        shellWindow: expect.objectContaining({
          label: "agent-app-shell-content-factory-app-standalone",
          url: "http://127.0.0.1:4199/dashboard",
          chrome: expect.objectContaining({
            deepLinkScheme: "lime-agent-content-factory-app",
            openEntryKey: "dashboard",
            trayEnabled: true,
            multiAppManagement: false,
            runtimeBypass: false,
          }),
        }),
      }),
    );

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("通用工作台执行状态 mock 应返回空闲态", async () => {
    await expect(
      invokeMockOnly("execution_run_get_general_workbench_state", {
        sessionId: "session-mock",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        run_state: "idle",
        current_gate_key: "idle",
        queue_items: [],
        latest_terminal: null,
        recent_terminals: [],
      }),
    );

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("图层设计 desktop-host 默认 mock 已退场并 fail closed", async () => {
    const removedLayeredDesignMockCommands = [
      "save_layered_design_project_export",
      "read_layered_design_project_export",
      "recognize_layered_design_text",
      "analyze_layered_design_flat_image",
    ];

    for (const command of removedLayeredDesignMockCommands) {
      await expect(
        invokeMockOnly(command, {
          request: {
            projectRootPath: "/mock/workspace",
          },
        }),
      ).rejects.toThrow(`未注册命令 "${command}"`);
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("Capability Draft mock 应对齐只读 HTTP gate 与 dry-run evidence", async () => {
    const generatedFiles = [
      {
        relativePath: "SKILL.md",
        content:
          "# 只读 HTTP API 每日报告\n\n只读 HTTP API 访问；不保存 token，不写外部系统。",
      },
      {
        relativePath: "contract/input.schema.json",
        content: JSON.stringify({
          type: "object",
          required: ["endpoint"],
          properties: {
            endpoint: { type: "string", format: "uri" },
            fixture_path: { type: "string" },
          },
        }),
      },
      {
        relativePath: "contract/output.schema.json",
        content: JSON.stringify({
          type: "object",
          required: ["markdown_report"],
          properties: { markdown_report: { type: "string" } },
        }),
      },
      {
        relativePath: "examples/input.sample.json",
        content: JSON.stringify({
          endpoint: "https://api.example.test/metrics",
          fixture_path: "tests/fixture.json",
        }),
      },
      {
        relativePath: "tests/fixture.json",
        content: JSON.stringify({
          metrics: [{ label: "workflow", value: 42 }],
        }),
      },
      {
        relativePath: "tests/expected-output.json",
        content: JSON.stringify({
          markdown_report: "# 趋势摘要\n\n- workflow: 42",
        }),
      },
      {
        relativePath: "policy/readonly-http-session.json",
        content: JSON.stringify({
          mode: "session_required",
          access: "read-only",
          allowed_methods: ["GET"],
          credential_policy: "no_generated_credentials",
          credential_source: "user_session_config",
          credential_reference: {
            scope: "session",
            source: "user_session_config",
            required: false,
            reference_id: "readonly_api_session",
          },
          execution_preflight: {
            mode: "approval_request",
            endpoint_source: "runtime_input",
            method: "GET",
            credential_reference_id: "readonly_api_session",
            evidence_schema: [
              "request_url_hash",
              "request_method",
              "response_status",
              "response_sha256",
              "executed_at",
            ],
          },
          evidence: ["request_url_hash", "response_status", "response_sha256"],
        }),
      },
      {
        relativePath: "scripts/dry-run.mjs",
        content: [
          "import fs from 'node:fs';",
          "const input = JSON.parse(fs.readFileSync('examples/input.sample.json', 'utf8'));",
          "const fixture = JSON.parse(fs.readFileSync(input.fixture_path, 'utf8'));",
          "const expected = JSON.parse(fs.readFileSync('tests/expected-output.json', 'utf8'));",
          "console.log(JSON.stringify(expected));",
          "void fixture;",
        ].join("\n"),
      },
    ];

    const positiveDraft = await invokeMockOnly<Record<string, unknown>>(
      "capability_draft_create",
      {
        request: {
          workspaceRoot: "/tmp/lime-p6-mock",
          name: "只读 HTTP API 每日报告",
          description: "把公开只读 HTTP API 响应整理成 Markdown 趋势摘要。",
          userGoal: "每天读取公开只读 API 或 fixture，生成 Markdown 摘要。",
          sourceKind: "api",
          permissionSummary: [
            "Level 0 只读发现",
            "允许只读 HTTP API GET 请求，不做外部写操作",
          ],
          generatedFiles,
        },
      },
    );

    const positiveVerification = await invokeMockOnly<any>(
      "capability_draft_verify",
      {
        request: {
          workspaceRoot: "/tmp/lime-p6-mock",
          draftId: positiveDraft.draftId,
        },
      },
    );
    expect(positiveVerification.draft.verificationStatus).toBe(
      "verified_pending_registration",
    );
    const executeCheck = positiveVerification.report.checks.find(
      (check: { id?: string }) =>
        check.id === "readonly_http_fixture_dry_run_execute",
    );
    expect(executeCheck).toEqual(
      expect.objectContaining({
        status: "passed",
        evidence: expect.arrayContaining([
          { key: "scriptPath", value: "scripts/dry-run.mjs" },
          { key: "expectedOutputPath", value: "tests/expected-output.json" },
        ]),
      }),
    );
    const preflightCheck = positiveVerification.report.checks.find(
      (check: { id?: string }) =>
        check.id === "readonly_http_execution_preflight",
    );
    expect(preflightCheck).toEqual(
      expect.objectContaining({
        status: "passed",
        evidence: expect.arrayContaining([
          { key: "preflightMode", value: "approval_request" },
          { key: "endpointSource", value: "runtime_input" },
          { key: "method", value: "GET" },
          {
            key: "credentialReferenceId",
            value: "readonly_api_session",
          },
          {
            key: "evidenceSchema",
            value:
              "request_url_hash,request_method,response_status,response_sha256,executed_at",
          },
        ]),
      }),
    );
    const positiveRegistration = await invokeMockOnly<any>(
      "capability_draft_register",
      {
        request: {
          workspaceRoot: "/tmp/lime-p6-mock",
          draftId: positiveDraft.draftId,
        },
      },
    );
    expect(positiveRegistration.registration.approvalRequests).toEqual([
      expect.objectContaining({
        approvalId: expect.stringContaining(":readonly-http-session"),
        status: "pending",
        sourceCheckId: "readonly_http_execution_preflight",
        endpointSource: "runtime_input",
        method: "GET",
        credentialReferenceId: "readonly_api_session",
        evidenceSchema: [
          "request_url_hash",
          "request_method",
          "response_status",
          "response_sha256",
          "executed_at",
        ],
        policyPath: "policy/readonly-http-session.json",
        consumptionGate: expect.objectContaining({
          status: "awaiting_session_approval",
          requiredInputs: [
            "session_user_approval",
            "runtime_endpoint_input",
            "credential_reference:readonly_api_session",
            "evidence_capture",
          ],
          runtimeExecutionEnabled: false,
          credentialStorageEnabled: false,
        }),
        credentialResolver: expect.objectContaining({
          status: "awaiting_session_credential",
          referenceId: "readonly_api_session",
          scope: "session",
          source: "user_session_config",
          secretMaterialStatus: "not_requested",
          tokenPersisted: false,
          runtimeInjectionEnabled: false,
        }),
        consumptionInputSchema: expect.objectContaining({
          schemaId: "readonly_http_session_approval_v1",
          version: 1,
          uiSubmissionEnabled: false,
          runtimeExecutionEnabled: false,
          fields: expect.arrayContaining([
            expect.objectContaining({
              key: "runtime_endpoint_input",
              kind: "url",
              required: true,
              secret: false,
            }),
            expect.objectContaining({
              key: "credential_reference_confirmation",
              kind: "credential_reference",
              source: "user_session_config",
              secret: false,
            }),
          ]),
        }),
        sessionInputIntake: expect.objectContaining({
          status: "awaiting_session_inputs",
          schemaId: "readonly_http_session_approval_v1",
          scope: "session",
          requiredFieldKeys: [
            "session_user_approval",
            "runtime_endpoint_input",
            "credential_reference_confirmation",
            "evidence_capture_consent",
          ],
          missingFieldKeys: [
            "session_user_approval",
            "runtime_endpoint_input",
            "credential_reference_confirmation",
            "evidence_capture_consent",
          ],
          collectedFieldKeys: [],
          credentialReferenceId: "readonly_api_session",
          endpointInputPersisted: false,
          secretMaterialStatus: "not_collected",
          tokenPersisted: false,
          uiSubmissionEnabled: false,
          runtimeExecutionEnabled: false,
        }),
        sessionInputSubmissionContract: expect.objectContaining({
          status: "submission_contract_declared",
          scope: "session",
          mode: "one_time_session_submission",
          acceptedFieldKeys: [
            "session_user_approval",
            "runtime_endpoint_input",
            "credential_reference_confirmation",
            "evidence_capture_consent",
          ],
          valueRetention: "none",
          endpointInputPersisted: false,
          secretMaterialAccepted: false,
          tokenPersisted: false,
          evidenceCaptureRequired: true,
          submissionHandlerEnabled: true,
          uiSubmissionEnabled: false,
          runtimeExecutionEnabled: false,
          validationRules: expect.arrayContaining([
            expect.objectContaining({
              fieldKey: "runtime_endpoint_input",
              kind: "url",
              required: true,
              secretAllowed: false,
            }),
            expect.objectContaining({
              fieldKey: "credential_reference_confirmation",
              kind: "credential_reference",
              source: "user_session_config",
              secretAllowed: false,
            }),
          ]),
        }),
      }),
    ]);
    const approvalSubmission = await invokeMockOnly<any>(
      "capability_draft_submit_approval_session_inputs",
      {
        request: {
          workspaceRoot: "/tmp/lime-p6-mock",
          approvalId:
            positiveRegistration.registration.approvalRequests[0].approvalId,
          sessionId: "session-readonly-http",
          inputs: {
            session_user_approval: true,
            runtime_endpoint_input: "https://api.example.test/metrics",
            credential_reference_confirmation: "readonly_api_session",
            evidence_capture_consent: true,
          },
        },
      },
    );
    expect(approvalSubmission).toEqual(
      expect.objectContaining({
        status: "validated_pending_runtime_gate",
        scope: "session",
        acceptedFieldKeys: [
          "session_user_approval",
          "runtime_endpoint_input",
          "credential_reference_confirmation",
          "evidence_capture_consent",
        ],
        missingFieldKeys: [],
        rejectedFieldKeys: [],
        endpointInputPersisted: false,
        secretMaterialAccepted: false,
        tokenPersisted: false,
        credentialResolved: false,
        runtimeExecutionEnabled: false,
        nextGate: "readonly_http_controlled_get_preflight",
        controlledGetPreflight: expect.objectContaining({
          status: "ready_for_controlled_get_preflight",
          gateId: "readonly_http_controlled_get_preflight",
          method: "GET",
          methodAllowed: true,
          endpointSource: "runtime_input",
          endpointValidated: true,
          endpointValueReturned: false,
          credentialReferenceId: "readonly_api_session",
          credentialResolutionRequired: true,
          credentialResolved: false,
          requestExecutionEnabled: false,
          runtimeExecutionEnabled: false,
          evidenceSchema: [
            "request_url_hash",
            "request_method",
            "response_status",
            "response_sha256",
            "executed_at",
          ],
        }),
        dryPreflightPlan: expect.objectContaining({
          status: "planned_without_execution",
          gateId: "readonly_http_controlled_get_preflight",
          requestUrlHash: expect.stringMatching(/^mock-sha256-/),
          requestUrlHashAlgorithm: "sha256",
          endpointValueReturned: false,
          endpointInputPersisted: false,
          credentialReferenceId: "readonly_api_session",
          credentialResolutionStage: "not_started",
          credentialResolved: false,
          networkRequestSent: false,
          responseCaptured: false,
          requestExecutionEnabled: false,
          runtimeExecutionEnabled: false,
          valueRetention: "hash_only",
          plannedEvidenceKeys: [
            "request_url_hash",
            "request_method",
            "response_status",
            "response_sha256",
            "executed_at",
          ],
        }),
      }),
    );
    const controlledGetExecution = await invokeMockOnly<any>(
      "capability_draft_execute_controlled_get",
      {
        request: {
          workspaceRoot: "/tmp/lime-p6-mock",
          approvalId:
            positiveRegistration.registration.approvalRequests[0].approvalId,
          sessionId: "session-readonly-http",
          inputs: {
            session_user_approval: true,
            runtime_endpoint_input: "https://api.example.test/metrics",
            credential_reference_confirmation: "readonly_api_session",
            evidence_capture_consent: true,
          },
        },
      },
    );
    expect(controlledGetExecution).toEqual(
      expect.objectContaining({
        status: "executed",
        gateId: "readonly_http_controlled_get_execution",
        method: "GET",
        methodAllowed: true,
        requestUrlHash: expect.stringMatching(/^mock-sha256-/),
        responseStatus: 200,
        responseSha256: expect.stringMatching(/^mock-sha256-/),
        networkRequestSent: true,
        responseCaptured: true,
        endpointValueReturned: false,
        endpointInputPersisted: false,
        credentialReferenceId: "readonly_api_session",
        credentialResolved: false,
        tokenPersisted: false,
        requestExecutionEnabled: true,
        runtimeExecutionEnabled: false,
        valueRetention: "ephemeral_response_preview",
        sessionInputStatus: "validated_pending_runtime_gate",
        evidence: expect.arrayContaining([
          { key: "response_status", value: "200" },
        ]),
        evidenceArtifact: expect.objectContaining({
          persisted: true,
          containsEndpointValue: false,
          containsTokenValue: false,
          containsResponsePreview: false,
        }),
      }),
    );

    const missingSessionPolicyDraft = await invokeMockOnly<
      Record<string, unknown>
    >("capability_draft_create", {
      request: {
        workspaceRoot: "/tmp/lime-p6-mock",
        name: "缺授权策略只读 HTTP API 草案",
        description: "缺少 session authorization policy。",
        userGoal: "读取公开 API。",
        sourceKind: "api",
        permissionSummary: [
          "Level 0 只读发现",
          "允许只读 HTTP API GET 请求，不做外部写操作",
        ],
        generatedFiles: generatedFiles.filter(
          (file) => file.relativePath !== "policy/readonly-http-session.json",
        ),
      },
    });
    const missingSessionPolicyVerification = await invokeMockOnly<any>(
      "capability_draft_verify",
      {
        request: {
          workspaceRoot: "/tmp/lime-p6-mock",
          draftId: missingSessionPolicyDraft.draftId,
        },
      },
    );
    const sessionAuthorizationCheck =
      missingSessionPolicyVerification.report.checks.find(
        (check: { id?: string }) =>
          check.id === "readonly_http_session_authorization",
      );
    expect(missingSessionPolicyVerification.draft.verificationStatus).toBe(
      "verification_failed",
    );
    expect(sessionAuthorizationCheck).toEqual(
      expect.objectContaining({
        status: "failed",
        message: expect.stringContaining("authorization"),
      }),
    );

    const missingCredentialReferenceDraft = await invokeMockOnly<
      Record<string, unknown>
    >("capability_draft_create", {
      request: {
        workspaceRoot: "/tmp/lime-p6-mock",
        name: "缺凭证引用只读 HTTP API 草案",
        description: "缺少 credential_reference。",
        userGoal: "读取公开 API。",
        sourceKind: "api",
        permissionSummary: [
          "Level 0 只读发现",
          "允许只读 HTTP API GET 请求，不做外部写操作",
        ],
        generatedFiles: generatedFiles.map((file) =>
          file.relativePath === "policy/readonly-http-session.json"
            ? {
                ...file,
                content: JSON.stringify({
                  mode: "session_required",
                  access: "read-only",
                  allowed_methods: ["GET"],
                  credential_policy: "no_generated_credentials",
                  credential_source: "user_session_config",
                  evidence: [
                    "request_url_hash",
                    "response_status",
                    "response_sha256",
                  ],
                }),
              }
            : file,
        ),
      },
    });
    const missingCredentialReferenceVerification = await invokeMockOnly<any>(
      "capability_draft_verify",
      {
        request: {
          workspaceRoot: "/tmp/lime-p6-mock",
          draftId: missingCredentialReferenceDraft.draftId,
        },
      },
    );
    const credentialReferenceCheck =
      missingCredentialReferenceVerification.report.checks.find(
        (check: { id?: string }) =>
          check.id === "readonly_http_credential_reference",
      );
    expect(
      missingCredentialReferenceVerification.draft.verificationStatus,
    ).toBe("verification_failed");
    expect(credentialReferenceCheck).toEqual(
      expect.objectContaining({
        status: "failed",
        message: expect.stringContaining("credential_reference"),
      }),
    );

    const missingPreflightDraft = await invokeMockOnly<Record<string, unknown>>(
      "capability_draft_create",
      {
        request: {
          workspaceRoot: "/tmp/lime-p6-mock",
          name: "缺执行前检查只读 HTTP API 草案",
          description: "缺少 execution_preflight。",
          userGoal: "读取公开 API。",
          sourceKind: "api",
          permissionSummary: [
            "Level 0 只读发现",
            "允许只读 HTTP API GET 请求，不做外部写操作",
          ],
          generatedFiles: generatedFiles.map((file) =>
            file.relativePath === "policy/readonly-http-session.json"
              ? {
                  ...file,
                  content: JSON.stringify({
                    mode: "session_required",
                    access: "read-only",
                    allowed_methods: ["GET"],
                    credential_policy: "no_generated_credentials",
                    credential_source: "user_session_config",
                    credential_reference: {
                      scope: "session",
                      source: "user_session_config",
                      required: false,
                      reference_id: "readonly_api_session",
                    },
                    evidence: [
                      "request_url_hash",
                      "response_status",
                      "response_sha256",
                    ],
                  }),
                }
              : file,
          ),
        },
      },
    );
    const missingPreflightVerification = await invokeMockOnly<any>(
      "capability_draft_verify",
      {
        request: {
          workspaceRoot: "/tmp/lime-p6-mock",
          draftId: missingPreflightDraft.draftId,
        },
      },
    );
    const executionPreflightCheck =
      missingPreflightVerification.report.checks.find(
        (check: { id?: string }) =>
          check.id === "readonly_http_execution_preflight",
      );
    expect(missingPreflightVerification.draft.verificationStatus).toBe(
      "verification_failed",
    );
    expect(executionPreflightCheck).toEqual(
      expect.objectContaining({
        status: "failed",
        message: expect.stringContaining("execution_preflight"),
      }),
    );

    const negativeDraft = await invokeMockOnly<Record<string, unknown>>(
      "capability_draft_create",
      {
        request: {
          workspaceRoot: "/tmp/lime-p6-mock",
          name: "缺权限只读 HTTP API 草案",
          description: "缺少网络只读权限声明。",
          userGoal: "读取公开 API。",
          sourceKind: "api",
          permissionSummary: ["Level 0 只读发现"],
          generatedFiles,
        },
      },
    );
    const negativeVerification = await invokeMockOnly<any>(
      "capability_draft_verify",
      {
        request: {
          workspaceRoot: "/tmp/lime-p6-mock",
          draftId: negativeDraft.draftId,
        },
      },
    );
    const riskCheck = negativeVerification.report.checks.find(
      (check: { id?: string }) => check.id === "static_risk_scan",
    );
    expect(negativeVerification.draft.verificationStatus).toBe(
      "verification_failed",
    );
    expect(riskCheck).toEqual(
      expect.objectContaining({
        status: "failed",
        message: expect.stringContaining("网络只读权限"),
      }),
    );

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("知识库 legacy 显式 mock 已退场", async () => {
    for (const command of [
      "knowledge_list_packs",
      "knowledge_import_source",
      "knowledge_get_pack",
      "knowledge_update_pack_status",
      "knowledge_resolve_context",
      "knowledge_validate_context_run",
      "knowledge_set_default_pack",
      "knowledge_compile_pack",
    ]) {
      await expect(
        invokeMockOnly(command, {
          request: {
            workingDir: "/tmp/lime-knowledge-e2e",
            name: "brand-product-demo",
            packName: "brand-product-demo",
            status: "ready",
            runPath: "runs/context-mock.json",
          },
        }),
      ).rejects.toThrow(`未注册命令 "${command}"`);
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("工具库存显式 mock 不应返回空壳清单", async () => {
    const result = await invokeMockOnly("agent_runtime_get_tool_inventory", {
      request: {
        caller: "assistant",
        browserAssist: true,
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        request: expect.objectContaining({
          caller: "assistant",
          surface: expect.objectContaining({
            browser_assist: true,
          }),
        }),
        default_allowed_tools: expect.arrayContaining([
          "ToolSearch",
          "ListMcpResourcesTool",
          "ReadMcpResourceTool",
          "WebSearch",
          "AskUserQuestion",
          "SendUserMessage",
          "Agent",
          "SendMessage",
          "TeamCreate",
          "TeamDelete",
          "ListPeers",
          "TaskCreate",
          "Workflow",
          "lime_site_recommend",
          "lime_site_run",
        ]),
        counts: expect.objectContaining({
          catalog_total: 46,
          registry_visible_total: expect.any(Number),
          extension_tool_total: 20,
          extension_tool_visible_total: 1,
          mcp_tool_total: 20,
          mcp_tool_visible_total: 1,
        }),
        catalog_tools: expect.arrayContaining([
          expect.objectContaining({ name: "ToolSearch" }),
          expect.objectContaining({ name: "ListMcpResourcesTool" }),
          expect.objectContaining({
            name: "Bash",
            permission_plane: "parameter_restricted",
            workspace_default_allow: false,
          }),
          expect.objectContaining({ name: "WebSearch" }),
          expect.objectContaining({
            name: "WebFetch",
            permission_plane: "parameter_restricted",
            workspace_default_allow: false,
          }),
          expect.objectContaining({ name: "SendUserMessage" }),
          expect.objectContaining({
            name: "StructuredOutput",
            permission_plane: "session_allowlist",
            workspace_default_allow: false,
          }),
          expect.objectContaining({ name: "RemoteTrigger" }),
          expect.objectContaining({ name: "CronCreate" }),
          expect.objectContaining({ name: "lime_site_list" }),
          expect.objectContaining({ name: "lime_site_run" }),
          expect.objectContaining({
            name: "mcp__lime-browser__",
            source: "browser_compatibility",
            permission_plane: "caller_filtered",
            workspace_default_allow: false,
          }),
        ]),
        extension_surfaces: expect.arrayContaining([
          expect.objectContaining({
            extension_name: "mcp__lime-browser",
            available_tools: expect.arrayContaining([
              "navigate",
              "click",
              "read_page",
              "get_page_text",
            ]),
            loaded_tools: ["mcp__lime-browser__navigate"],
            searchable_tools: expect.arrayContaining([
              "mcp__lime-browser__navigate",
              "mcp__lime-browser__click",
            ]),
          }),
        ]),
        registry_tools: expect.arrayContaining([
          expect.objectContaining({ name: "AskUserQuestion" }),
          expect.objectContaining({ name: "SendUserMessage" }),
          expect.objectContaining({ name: "StructuredOutput" }),
          expect.objectContaining({ name: "ReadMcpResourceTool" }),
          expect.objectContaining({ name: "EnterPlanMode" }),
          expect.objectContaining({ name: "SendMessage" }),
          expect.objectContaining({ name: "TeamCreate" }),
          expect.objectContaining({ name: "TeamDelete" }),
          expect.objectContaining({ name: "ListPeers" }),
          expect.objectContaining({ name: "CronList" }),
          expect.objectContaining({ name: "TaskOutput" }),
          expect.objectContaining({ name: "ExitWorktree" }),
          expect.objectContaining({ name: "lime_site_search" }),
        ]),
        extension_tools: expect.arrayContaining([
          expect.objectContaining({
            name: "mcp__lime-browser__navigate",
            status: "loaded",
            visible_in_context: true,
          }),
          expect.objectContaining({
            name: "mcp__lime-browser__click",
            status: "deferred",
            visible_in_context: false,
          }),
        ]),
        mcp_tools: expect.arrayContaining([
          expect.objectContaining({
            name: "mcp__lime-browser__navigate",
            always_visible: true,
            visible_in_context: true,
            tags: ["browser", "write"],
          }),
          expect.objectContaining({
            name: "mcp__lime-browser__click",
            deferred_loading: true,
            visible_in_context: false,
            tags: ["browser", "write"],
          }),
        ]),
      }),
    );
    expect(result.default_allowed_tools).not.toContain("StructuredOutput");
    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("review decision 默认 mock 已退场并 fail closed", async () => {
    await expect(
      invokeMockOnly("agent_runtime_save_review_decision", {
        request: {
          session_id: "mock-session",
          decision_status: "accepted",
          decision_summary: "错误接受被拒绝的权限确认。",
          risk_level: "low",
        },
      }),
    ).rejects.toThrow(
      "agent_runtime_save_review_decision 仍属于 P9 Agent Runtime review decision legacy residual",
    );
  });

  it("工具库存显式 mock 应按 workbench + browser surface 补齐当前工具面", async () => {
    const result = await invokeMockOnly("agent_runtime_get_tool_inventory", {
      request: {
        caller: "assistant",
        workbench: true,
        browserAssist: true,
      },
    });

    expect(result.request.surface).toEqual(
      expect.objectContaining({
        workbench: true,
        browser_assist: true,
      }),
    );
    expect(result.counts.catalog_total).toBe(58);
    expect(result.default_allowed_tools).toEqual(
      expect.arrayContaining([
        "social_generate_cover_image",
        "lime_create_image_generation_task",
        "lime_create_audio_generation_task",
        "lime_create_transcription_task",
        "lime_run_service_skill",
        "lime_site_recommend",
        "lime_site_run",
      ]),
    );
    expect(result.default_allowed_tools).not.toContain("mcp__lime-browser__");
    expect(result.catalog_tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "social_generate_cover_image" }),
        expect.objectContaining({
          name: "lime_create_image_generation_task",
        }),
        expect.objectContaining({
          name: "lime_create_audio_generation_task",
        }),
        expect.objectContaining({ name: "lime_run_service_skill" }),
        expect.objectContaining({ name: "lime_site_recommend" }),
        expect.objectContaining({ name: "mcp__lime-browser__" }),
      ]),
    );
    expect(result.registry_tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "social_generate_cover_image" }),
        expect.objectContaining({ name: "lime_search_web_images" }),
        expect.objectContaining({ name: "lime_create_typesetting_task" }),
        expect.objectContaining({ name: "lime_site_info" }),
      ]),
    );
    expect(result.counts.mcp_tool_total).toBe(20);
    expect(result.mcp_tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "mcp__lime-browser__navigate" }),
        expect.objectContaining({ name: "mcp__lime-browser__read_page" }),
        expect.objectContaining({ name: "mcp__lime-browser__click" }),
      ]),
    );
    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("显式 mock 入口可返回默认工作区数据已退场", async () => {
    await expect(
      invokeMockOnly("workspace_get_projects_root"),
    ).rejects.toThrow(
      '未注册命令 "workspace_get_projects_root"',
    );
    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("媒体任务显式 mock 应返回统一 task file 协议", async () => {
    await expect(
      invokeMockOnly("list_media_task_artifacts", {
        request: {
          projectRootPath: "/mock/workspace",
          taskFamily: "image",
          threadId: "thread-image-mock-1",
          turnId: "turn-image-mock-1",
          contentId: "content-image-mock-1",
          model: "gpt-image-1",
          costState: { status: "estimated", estimatedCostClass: "low" },
          limitState: { status: "within_limit" },
          limitEvent: { eventKind: "quota_low" },
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: true,
        total: 1,
        modality_runtime_contracts: expect.objectContaining({
          snapshot_count: 1,
          contract_keys: ["image_generation"],
          entry_keys: ["at_image_command"],
          thread_ids: ["thread-image-mock-1"],
          turn_ids: ["turn-image-mock-1"],
          content_ids: ["content-image-mock-1"],
          modalities: ["image"],
          skill_ids: ["image_generate"],
          model_ids: ["gpt-image-1"],
          cost_states: ["estimated"],
          limit_states: ["within_limit"],
          estimated_cost_classes: ["low"],
          limit_event_kinds: ["quota_low"],
          quota_low_count: 1,
          execution_profile_keys: ["image_generation_profile"],
          executor_adapter_keys: ["skill:image_generate"],
          executor_kinds: ["skill"],
          executor_binding_keys: ["image_generate"],
          limecore_policy_refs: [
            "model_catalog",
            "provider_offer",
            "tenant_feature_flags",
          ],
          limecore_policy_snapshot_count: 1,
          limecore_policy_decisions: ["allow"],
          limecore_policy_decision_sources: ["local_default_policy"],
          limecore_policy_unresolved_refs: [
            "model_catalog",
            "provider_offer",
            "tenant_feature_flags",
          ],
          limecore_policy_missing_inputs: [
            "model_catalog",
            "provider_offer",
            "tenant_feature_flags",
          ],
          limecore_policy_pending_hit_refs: [
            "model_catalog",
            "provider_offer",
            "tenant_feature_flags",
          ],
          limecore_policy_value_hit_count: 0,
          snapshots: expect.arrayContaining([
            expect.objectContaining({
              entry_key: "at_image_command",
              thread_id: "thread-image-mock-1",
              turn_id: "turn-image-mock-1",
              content_id: "content-image-mock-1",
              modality: "image",
              skill_id: "image_generate",
              model_id: "gpt-image-1",
              cost_state: "estimated",
              limit_state: "within_limit",
              estimated_cost_class: "low",
              limit_event_kind: "quota_low",
              quota_low: true,
              executor_kind: "skill",
              executor_binding_key: "image_generate",
              limecore_policy_refs: [
                "model_catalog",
                "provider_offer",
                "tenant_feature_flags",
              ],
              limecore_policy_snapshot_status: "local_defaults_evaluated",
              limecore_policy_decision_source: "local_default_policy",
              limecore_policy_missing_inputs: [
                "model_catalog",
                "provider_offer",
                "tenant_feature_flags",
              ],
              limecore_policy_pending_hit_refs: [
                "model_catalog",
                "provider_offer",
                "tenant_feature_flags",
              ],
              limecore_policy_value_hits: [],
              limecore_policy_value_hit_count: 0,
            }),
          ]),
        }),
        tasks: expect.arrayContaining([
          expect.objectContaining({
            task_type: "image_generate",
            task_family: "image",
          }),
        ]),
      }),
    );
    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("媒体任务 mock 在 taskRef 为绝对 task file 时也应保持稳定 task_id", async () => {
    mocks.isDevBridgeAvailable.mockReturnValue(false);

    const directResult = await invokeMockOnly("get_media_task_artifact", {
      request: {
        projectRootPath: "/mock/workspace",
        taskRef: "task-image-mock-1",
      },
    });
    const absolutePathResult = await invokeMockOnly("get_media_task_artifact", {
      request: {
        projectRootPath: "/mock/workspace",
        taskRef:
          "/mock/workspace/.lime/tasks/image_generate/task-image-mock-1.json",
      },
    });

    expect(directResult).toEqual(
      expect.objectContaining({
        task_id: "task-image-mock-1",
        path: ".lime/tasks/image_generate/task-image-mock-1.json",
      }),
    );
    expect(absolutePathResult).toEqual(
      expect.objectContaining({
        task_id: "task-image-mock-1",
        path: ".lime/tasks/image_generate/task-image-mock-1.json",
      }),
    );
  });

  it("音频任务显式 mock 应返回 voice_generation task file 协议", async () => {
    await expect(
      invokeMockOnly("create_audio_generation_task_artifact", {
        request: {
          projectRootPath: "/mock/workspace",
          sourceText: "请生成温暖旁白",
          voice: "warm_narrator",
          modalityContractKey: "voice_generation",
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        task_type: "audio_generate",
        task_family: "audio",
        path: ".lime/tasks/audio_generate/task-audio-mock-1.json",
        record: expect.objectContaining({
          payload: expect.objectContaining({
            modality_contract_key: "voice_generation",
            modality: "audio",
            routing_slot: "voice_generation_model",
            audio_output: expect.objectContaining({
              kind: "audio_output",
              status: "pending",
              mime_type: "audio/mpeg",
            }),
          }),
        }),
      }),
    );

    await expect(
      invokeMockOnly("list_media_task_artifacts", {
        request: {
          projectRootPath: "/mock/workspace",
          taskFamily: "audio",
          taskType: "audio_generate",
          modalityContractKey: "voice_generation",
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        total: 1,
        modality_runtime_contracts: expect.objectContaining({
          contract_keys: ["voice_generation"],
          execution_profile_keys: ["voice_generation_profile"],
          executor_adapter_keys: ["service_skill:voice_runtime"],
          limecore_policy_refs: [
            "client_scenes",
            "tenant_feature_flags",
            "provider_offer",
          ],
          limecore_policy_snapshot_count: 1,
          audio_output_count: 1,
          audio_output_statuses: [{ status: "pending", count: 1 }],
          snapshots: expect.arrayContaining([
            expect.objectContaining({
              task_type: "audio_generate",
              contract_key: "voice_generation",
              execution_profile_key: "voice_generation_profile",
              executor_adapter_key: "service_skill:voice_runtime",
              executor_kind: "service_skill",
              executor_binding_key: "voice_runtime",
              limecore_policy_refs: [
                "client_scenes",
                "tenant_feature_flags",
                "provider_offer",
              ],
              limecore_policy_snapshot_status: "local_defaults_evaluated",
              limecore_policy_decision: "allow",
              limecore_policy_decision_source: "local_default_policy",
              limecore_policy_unresolved_refs: [
                "client_scenes",
                "tenant_feature_flags",
                "provider_offer",
              ],
              limecore_policy_missing_inputs: [
                "client_scenes",
                "tenant_feature_flags",
                "provider_offer",
              ],
              limecore_policy_pending_hit_refs: [
                "client_scenes",
                "tenant_feature_flags",
                "provider_offer",
              ],
              limecore_policy_value_hits: [],
              limecore_policy_value_hit_count: 0,
              routing_event: "executor_invoked",
              audio_output_status: "pending",
            }),
          ]),
        }),
      }),
    );

    await expect(
      invokeMockOnly("complete_audio_generation_task_artifact", {
        request: {
          projectRootPath: "/mock/workspace",
          taskRef: "task-audio-mock-1",
          audioPath: ".lime/runtime/audio/task-audio-mock-1.mp3",
          mimeType: "audio/mpeg",
          durationMs: 1800,
          providerId: "limecore",
          model: "voice-pro",
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        task_type: "audio_generate",
        task_family: "audio",
        normalized_status: "succeeded",
        record: expect.objectContaining({
          payload: expect.objectContaining({
            audio_path: ".lime/runtime/audio/task-audio-mock-1.mp3",
            audio_output: expect.objectContaining({
              status: "completed",
              audio_path: ".lime/runtime/audio/task-audio-mock-1.mp3",
              duration_ms: 1800,
            }),
          }),
          result: expect.objectContaining({
            status: "completed",
            audio_path: ".lime/runtime/audio/task-audio-mock-1.mp3",
          }),
        }),
      }),
    );
  });

  it("旧 Agent 命令别名应直接报废弃错误，不再静默返回 mock 成功结果", async () => {
    mocks.isDevBridgeAvailable.mockReturnValue(false);

    await expect(invokeMockOnly("list_agent_sessions")).rejects.toThrow(
      "命令 list_agent_sessions 已废弃，请迁移到 agent_runtime_list_sessions",
    );
    await expect(invokeMockOnly("get_agent_process_status")).rejects.toThrow(
      "命令 get_agent_process_status 已废弃，请迁移到 agent_get_process_status",
    );
  });
});
