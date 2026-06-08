const mockCapabilityDraftStores = new Map<string, any[]>();

export function clearSkillForgeMocks() {
  mockCapabilityDraftStores.clear();
}

function readMockCapabilityDraftRequest(args?: Record<string, unknown>) {
  return (args?.request as Record<string, unknown> | undefined) ?? args ?? {};
}

function normalizeMockCapabilityWorkspaceRoot(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : "/mock/workspace/default";
}

function getMockCapabilityDraftStore(workspaceRoot: string): any[] {
  const normalizedRoot = normalizeMockCapabilityWorkspaceRoot(workspaceRoot);
  if (!mockCapabilityDraftStores.has(normalizedRoot)) {
    mockCapabilityDraftStores.set(normalizedRoot, []);
  }
  return mockCapabilityDraftStores.get(normalizedRoot)!;
}

function createMockCapabilityDraft(args?: Record<string, unknown>) {
  const request = readMockCapabilityDraftRequest(args);
  const workspaceRoot = normalizeMockCapabilityWorkspaceRoot(
    request.workspaceRoot ?? request.workspace_root,
  );
  const generatedFiles = Array.isArray(request.generatedFiles)
    ? request.generatedFiles
    : Array.isArray(request.generated_files)
      ? request.generated_files
      : [];
  const timestamp = new Date().toISOString();
  const draftId = `capdraft-mock-${Date.now()}`;
  const draftRoot = `${workspaceRoot}/.lime/capability-drafts/${draftId}`;
  const fileContents: Record<string, string> = {};
  const normalizedGeneratedFiles = generatedFiles
    .filter((file): file is Record<string, unknown> =>
      Boolean(file && typeof file === "object"),
    )
    .map((file) => {
      const relativePath =
        typeof file.relativePath === "string"
          ? file.relativePath
          : typeof file.relative_path === "string"
            ? file.relative_path
            : "SKILL.md";
      const content = typeof file.content === "string" ? file.content : "";
      fileContents[relativePath] = content;
      return {
        relativePath,
        byteLength: new TextEncoder().encode(content).length,
        sha256: "mock-sha256",
      };
    });
  const draft = {
    draftId,
    name:
      typeof request.name === "string" && request.name.trim()
        ? request.name.trim()
        : "未验证能力草案",
    description:
      typeof request.description === "string" && request.description.trim()
        ? request.description.trim()
        : "Mock 环境下的 Capability Draft。",
    userGoal:
      typeof request.userGoal === "string"
        ? request.userGoal
        : typeof request.user_goal === "string"
          ? request.user_goal
          : "先生成未验证草案，等待人工复核。",
    sourceKind:
      typeof request.sourceKind === "string"
        ? request.sourceKind
        : typeof request.source_kind === "string"
          ? request.source_kind
          : "manual",
    sourceRefs: Array.isArray(request.sourceRefs)
      ? request.sourceRefs
      : Array.isArray(request.source_refs)
        ? request.source_refs
        : [],
    permissionSummary: Array.isArray(request.permissionSummary)
      ? request.permissionSummary
      : Array.isArray(request.permission_summary)
        ? request.permission_summary
        : [],
    generatedFiles: normalizedGeneratedFiles,
    verificationStatus: "unverified",
    lastVerification: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    draftRoot,
    manifestPath: `${draftRoot}/manifest.json`,
    __fileContents: fileContents,
  };
  getMockCapabilityDraftStore(workspaceRoot).unshift(draft);
  return draft;
}

function listMockCapabilityDrafts(args?: Record<string, unknown>) {
  const request = readMockCapabilityDraftRequest(args);
  const workspaceRoot = normalizeMockCapabilityWorkspaceRoot(
    request.workspaceRoot ?? request.workspace_root,
  );
  return [...getMockCapabilityDraftStore(workspaceRoot)];
}

function getMockCapabilityDraft(args?: Record<string, unknown>) {
  const request = readMockCapabilityDraftRequest(args);
  const workspaceRoot = normalizeMockCapabilityWorkspaceRoot(
    request.workspaceRoot ?? request.workspace_root,
  );
  const draftId =
    typeof request.draftId === "string"
      ? request.draftId
      : typeof request.draft_id === "string"
        ? request.draft_id
        : "";
  return (
    getMockCapabilityDraftStore(workspaceRoot).find(
      (draft) => draft.draftId === draftId,
    ) ?? null
  );
}

function buildMockCapabilityVerificationCheck(
  id: string,
  label: string,
  passed: boolean,
  message: string,
  suggestions: string[] = [],
  evidence: Array<{ key: string; value: string }> = [],
) {
  return {
    id,
    label,
    status: passed ? "passed" : "failed",
    message,
    suggestions,
    canAgentRepair: !passed,
    evidence,
  };
}

function buildReadonlyHttpExecutionPreflightEvidence() {
  return [
    { key: "preflightMode", value: "approval_request" },
    { key: "endpointSource", value: "runtime_input" },
    { key: "method", value: "GET" },
    { key: "credentialReferenceId", value: "readonly_api_session" },
    {
      key: "evidenceSchema",
      value:
        "request_url_hash,request_method,response_status,response_sha256,executed_at",
    },
    { key: "policyPath", value: "policy/readonly-http-session.json" },
  ];
}

function collectMockRegistrationVerificationGates(
  draft: Record<string, unknown>,
) {
  const report = draft.__lastVerificationReport as
    | { checks?: Array<Record<string, unknown>> }
    | undefined;
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  return checks
    .filter(
      (check) =>
        check.id === "readonly_http_execution_preflight" &&
        check.status === "passed" &&
        Array.isArray(check.evidence) &&
        check.evidence.length > 0,
    )
    .map((check) => ({
      checkId: String(check.id ?? ""),
      label: String(check.label ?? ""),
      evidence: check.evidence,
    }));
}

function readMockEvidenceValue(evidence: unknown, key: string): string | null {
  if (!Array.isArray(evidence)) {
    return null;
  }
  const item = evidence.find(
    (entry): entry is { key?: unknown; value?: unknown } =>
      Boolean(
        entry &&
        typeof entry === "object" &&
        (entry as { key?: unknown }).key === key,
      ),
  );
  return typeof item?.value === "string" && item.value.trim()
    ? item.value.trim()
    : null;
}

function splitMockEvidenceSchema(value: string | null): string[] {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function buildMockReadonlyHttpApprovalConsumptionGate(
  endpointSource: string,
  credentialReferenceId: string,
) {
  return {
    status: "awaiting_session_approval",
    requiredInputs: [
      "session_user_approval",
      ...(endpointSource === "runtime_input" ? ["runtime_endpoint_input"] : []),
      `credential_reference:${credentialReferenceId}`,
      "evidence_capture",
    ],
    runtimeExecutionEnabled: false,
    credentialStorageEnabled: false,
    blockedReason:
      "等待当前 session 显式授权；本阶段不执行真实 HTTP，也不保存凭证。",
    nextAction:
      "先消费 approval request artifact 并解析 session-scoped 输入，之后才能进入受控 GET 执行门禁。",
  };
}

function buildMockReadonlyHttpCredentialResolver(
  credentialReferenceId: string,
) {
  return {
    status: "awaiting_session_credential",
    referenceId: credentialReferenceId,
    scope: "session",
    source: "user_session_config",
    secretMaterialStatus: "not_requested",
    tokenPersisted: false,
    runtimeInjectionEnabled: false,
    blockedReason:
      "等待当前 session 提供或确认凭证引用；本阶段不读取、不保存 token。",
    nextAction:
      "后续只能在 session scope 内解析该 reference，并把解析结果直接交给受控 GET 门禁。",
  };
}

function buildMockReadonlyHttpConsumptionInputSchema(
  endpointSource: string,
  credentialReferenceId: string,
) {
  return {
    schemaId: "readonly_http_session_approval_v1",
    version: 1,
    fields: [
      {
        key: "session_user_approval",
        label: "Session 授权确认",
        kind: "boolean_confirmation",
        required: true,
        source: "user_confirmation",
        secret: false,
        description: "用户必须在当前 session 明确确认本次只读 API 授权。",
      },
      ...(endpointSource === "runtime_input"
        ? [
            {
              key: "runtime_endpoint_input",
              label: "运行时 Endpoint",
              kind: "url",
              required: true,
              source: "runtime_input",
              secret: false,
              description:
                "当前阶段只收集 endpoint 输入合同，不保存明文 URL 到注册包。",
            },
          ]
        : []),
      {
        key: "credential_reference_confirmation",
        label: "凭证引用确认",
        kind: "credential_reference",
        required: true,
        source: "user_session_config",
        secret: false,
        description: `确认后续只解析 session 凭证引用 ${credentialReferenceId}，不收集 token 明文。`,
      },
      {
        key: "evidence_capture_consent",
        label: "Evidence 捕获确认",
        kind: "boolean_confirmation",
        required: true,
        source: "user_confirmation",
        secret: false,
        description:
          "用户确认后续受控 GET 需要写入 request / response evidence。",
      },
    ],
    uiSubmissionEnabled: false,
    runtimeExecutionEnabled: false,
    blockedReason:
      "当前只定义 session 授权输入合同，尚未开放提交、凭证解析或真实 HTTP 执行。",
  };
}

function buildMockReadonlyHttpSessionInputIntake(
  consumptionInputSchema: ReturnType<
    typeof buildMockReadonlyHttpConsumptionInputSchema
  >,
  credentialReferenceId: string,
) {
  const requiredFieldKeys = consumptionInputSchema.fields
    .filter((field) => field.required)
    .map((field) => field.key);

  return {
    status: "awaiting_session_inputs",
    schemaId: consumptionInputSchema.schemaId,
    scope: "session",
    requiredFieldKeys,
    missingFieldKeys: requiredFieldKeys,
    collectedFieldKeys: [],
    credentialReferenceId,
    endpointInputPersisted: false,
    secretMaterialStatus: "not_collected",
    tokenPersisted: false,
    uiSubmissionEnabled: false,
    runtimeExecutionEnabled: false,
    blockedReason:
      "已声明当前 session 输入槽位，但尚未接入提交处理、凭证解析或真实 HTTP 执行。",
    nextAction:
      "后续只允许在当前 session 收集一次性授权输入，再进入受控 GET 执行门禁。",
  };
}

function buildMockReadonlyHttpSessionSubmissionRule(
  field: ReturnType<
    typeof buildMockReadonlyHttpConsumptionInputSchema
  >["fields"][number],
) {
  const ruleByFieldKey: Record<string, string> = {
    session_user_approval: "必须为显式 true，用于当前 session 单次授权。",
    runtime_endpoint_input:
      "必须是 http/https URL；只允许作为当前 session 临时输入，不写入注册包。",
    credential_reference_confirmation:
      "必须匹配 approval request 的 credentialReferenceId；不接收 token 明文。",
    evidence_capture_consent: "必须为显式 true，用于当前 session 单次授权。",
  };

  return {
    fieldKey: field.key,
    kind: field.kind,
    required: field.required,
    source: field.source,
    secretAllowed: field.secret,
    rule:
      ruleByFieldKey[field.key] ??
      "必须满足对应 input schema 的字段类型与来源约束。",
  };
}

function buildMockReadonlyHttpSessionSubmissionContract(
  consumptionInputSchema: ReturnType<
    typeof buildMockReadonlyHttpConsumptionInputSchema
  >,
) {
  const acceptedFieldKeys = consumptionInputSchema.fields
    .filter((field) => field.required)
    .map((field) => field.key);

  return {
    status: "submission_contract_declared",
    scope: "session",
    mode: "one_time_session_submission",
    acceptedFieldKeys,
    validationRules: consumptionInputSchema.fields
      .filter((field) => field.required)
      .map((field) => buildMockReadonlyHttpSessionSubmissionRule(field)),
    valueRetention: "none",
    endpointInputPersisted: false,
    secretMaterialAccepted: false,
    tokenPersisted: false,
    evidenceCaptureRequired: true,
    submissionHandlerEnabled: true,
    uiSubmissionEnabled: false,
    runtimeExecutionEnabled: false,
    blockedReason:
      "已开放 session-scoped 输入校验 handler；本阶段仍不解析凭证、不执行真实 HTTP。",
    nextAction:
      "后续可先提交一次性 session 输入做校验；校验通过后仍只进入受控 GET 执行门禁。",
  };
}

function collectMockRegistrationApprovalRequests(
  registrationId: string,
  registeredAt: string,
  skillDirectory: string,
  verificationGates: Array<Record<string, unknown>>,
) {
  return verificationGates
    .filter((gate) => gate.checkId === "readonly_http_execution_preflight")
    .map((gate) => {
      const endpointSource = readMockEvidenceValue(
        gate.evidence,
        "endpointSource",
      );
      const method = readMockEvidenceValue(gate.evidence, "method");
      const credentialReferenceId = readMockEvidenceValue(
        gate.evidence,
        "credentialReferenceId",
      );
      const evidenceSchema = splitMockEvidenceSchema(
        readMockEvidenceValue(gate.evidence, "evidenceSchema"),
      );
      const policyPath = readMockEvidenceValue(gate.evidence, "policyPath");
      if (
        endpointSource &&
        method === "GET" &&
        credentialReferenceId &&
        evidenceSchema.length > 0 &&
        policyPath
      ) {
        const consumptionInputSchema =
          buildMockReadonlyHttpConsumptionInputSchema(
            endpointSource,
            credentialReferenceId,
          );

        return {
          approvalId: `${registrationId}:readonly-http-session`,
          status: "pending",
          sourceCheckId: String(gate.checkId ?? ""),
          skillDirectory,
          endpointSource,
          method,
          credentialReferenceId,
          evidenceSchema,
          policyPath,
          createdAt: registeredAt,
          consumptionGate: buildMockReadonlyHttpApprovalConsumptionGate(
            endpointSource,
            credentialReferenceId,
          ),
          credentialResolver: buildMockReadonlyHttpCredentialResolver(
            credentialReferenceId,
          ),
          consumptionInputSchema,
          sessionInputIntake: buildMockReadonlyHttpSessionInputIntake(
            consumptionInputSchema,
            credentialReferenceId,
          ),
          sessionInputSubmissionContract:
            buildMockReadonlyHttpSessionSubmissionContract(
              consumptionInputSchema,
            ),
        };
      }
      return null;
    })
    .filter((item): item is Exclude<typeof item, null> => Boolean(item));
}

function verifyMockCapabilityDraft(args?: Record<string, unknown>) {
  const request = readMockCapabilityDraftRequest(args);
  const workspaceRoot = normalizeMockCapabilityWorkspaceRoot(
    request.workspaceRoot ?? request.workspace_root,
  );
  const draftId =
    typeof request.draftId === "string"
      ? request.draftId
      : typeof request.draft_id === "string"
        ? request.draft_id
        : "";
  const draft = getMockCapabilityDraftStore(workspaceRoot).find(
    (item) => item.draftId === draftId,
  );
  if (!draft) {
    throw new Error(`Capability Draft 不存在: ${draftId}`);
  }

  const paths: string[] = Array.isArray(draft.generatedFiles)
    ? draft.generatedFiles.map((file: { relativePath?: string }) =>
        String(file.relativePath ?? ""),
      )
    : [];
  const fileContents = (draft.__fileContents ?? {}) as Record<string, string>;
  const lowerPaths = paths.map((path) => path.toLowerCase());
  const contents = Object.values(fileContents).join("\n").toLowerCase();
  const permissionText = Array.isArray(draft.permissionSummary)
    ? draft.permissionSummary.join("\n").toLowerCase()
    : "";
  const hasSkill = paths.includes("SKILL.md");
  const hasInputContract = paths.some((path) =>
    /(^|\/)(contract|contracts)\/input\.schema\.(json|ya?ml)$/.test(path),
  );
  const hasOutputContract = paths.some((path) =>
    /(^|\/)(contract|contracts)\/output\.schema\.(json|ya?ml)$/.test(path),
  );
  const hasPermissionSummary =
    Array.isArray(draft.permissionSummary) &&
    draft.permissionSummary.length > 0;
  const hasFixture = paths.some(
    (path) => path.startsWith("tests/") || path.startsWith("examples/"),
  );
  const mentionsReadonlyHttp =
    String(draft.sourceKind).toLowerCase() === "api" ||
    contents.includes("fetch(") ||
    contents.includes("axios.get") ||
    contents.includes('method: "get"') ||
    contents.includes("method: 'get'") ||
    contents.includes("http://") ||
    contents.includes("https://");
  const declaresReadonlyHttp = [
    "http",
    "api",
    "network",
    "联网",
    "网络",
    "公开 api",
    "只读 api",
    "只读 http",
    "read-only api",
    "read only api",
    "read-only http",
    "read only http",
  ].some((token) => permissionText.includes(token));
  const hasHighRiskToken = [
    "rm -rf",
    "npm install",
    "pip install",
    'method: "post"',
    "method: 'post'",
    "axios.post",
    "payment",
    "charge",
    "create_order",
    "publish_listing",
  ].some((token) => contents.includes(token));
  const hasRisk =
    hasHighRiskToken || (mentionsReadonlyHttp && !declaresReadonlyHttp);
  const hasHttpFixture = lowerPaths.some(
    (path) => path.startsWith("tests/") && path.includes("fixture"),
  );
  const hasHttpExpectedOutput = lowerPaths.some(
    (path) =>
      path.startsWith("tests/") &&
      (path.includes("expected") || path.includes("output")),
  );
  const hasFixtureInput =
    (fileContents["contract/input.schema.json"] ?? "")
      .toLowerCase()
      .includes("fixture_path") ||
    (fileContents["examples/input.sample.json"] ?? "")
      .toLowerCase()
      .includes("fixture_path");
  const dryRunPath =
    paths.find((path) => {
      const lowerPath = path.toLowerCase();
      return (
        lowerPath.startsWith("scripts/") &&
        (lowerPath.includes("dry-run") || lowerPath.includes("dryrun")) &&
        (lowerPath.endsWith(".mjs") || lowerPath.endsWith(".js"))
      );
    }) ?? "";
  const dryRunContent = dryRunPath ? (fileContents[dryRunPath] ?? "") : "";
  const lowerDryRunContent = dryRunContent.toLowerCase();
  const hasDryRunEntry = Boolean(dryRunPath);
  const hasDryRunExpectedOutputBinding =
    hasDryRunEntry &&
    (lowerDryRunContent.includes("expected-output") ||
      lowerDryRunContent.includes("expected_output") ||
      lowerDryRunContent.includes("expected output"));
  const hasNetworkedDryRun =
    hasDryRunEntry &&
    (lowerDryRunContent.includes("fetch(") ||
      lowerDryRunContent.includes("axios.get") ||
      lowerDryRunContent.includes("http://") ||
      lowerDryRunContent.includes("https://"));
  const hasCredentialToken = [
    "authorization",
    "bearer ",
    "x-api-key",
    "api_key",
    "apikey",
    "access_token",
    "client_secret",
    "secret_key",
  ].some((token) => contents.includes(token));
  const hasSessionAuthorization = paths.some((path) => {
    const lowerPath = path.toLowerCase();
    const isPolicyPath =
      (lowerPath.startsWith("policy/") ||
        lowerPath.startsWith("policies/") ||
        lowerPath.startsWith("runtime/") ||
        lowerPath.startsWith("config/")) &&
      (lowerPath.includes("authorization") ||
        lowerPath.includes("auth") ||
        lowerPath.includes("policy") ||
        lowerPath.includes("permission") ||
        lowerPath.includes("session"));
    if (!isPolicyPath) {
      return false;
    }
    const lowerContent = (fileContents[path] ?? "").toLowerCase();
    return (
      (lowerContent.includes("session") ||
        lowerContent.includes("manual") ||
        lowerContent.includes("user")) &&
      (lowerContent.includes("read-only") ||
        lowerContent.includes("readonly") ||
        lowerContent.includes("read only") ||
        lowerContent.includes("只读")) &&
      (lowerContent.includes("get") ||
        lowerContent.includes("http") ||
        lowerContent.includes("api")) &&
      (lowerContent.includes("evidence") ||
        lowerContent.includes("audit") ||
        lowerContent.includes("审计") ||
        lowerContent.includes("证据"))
    );
  });
  const hasCredentialReference = paths.some((path) => {
    const lowerPath = path.toLowerCase();
    const isPolicyPath =
      (lowerPath.startsWith("policy/") ||
        lowerPath.startsWith("policies/") ||
        lowerPath.startsWith("runtime/") ||
        lowerPath.startsWith("config/")) &&
      (lowerPath.includes("credential") ||
        lowerPath.includes("policy") ||
        lowerPath.includes("session"));
    if (!isPolicyPath) {
      return false;
    }
    const lowerContent = (fileContents[path] ?? "").toLowerCase();
    return (
      (lowerContent.includes("credential_reference") ||
        lowerContent.includes("credential reference") ||
        lowerContent.includes("credentialref") ||
        lowerContent.includes("凭证引用")) &&
      (lowerContent.includes("user_session_config") ||
        lowerContent.includes("session_config") ||
        lowerContent.includes("session credential") ||
        lowerContent.includes("用户会话"))
    );
  });
  const hasExecutionPreflight = paths.some((path) => {
    const lowerPath = path.toLowerCase();
    const isPolicyPath =
      (lowerPath.startsWith("policy/") ||
        lowerPath.startsWith("policies/") ||
        lowerPath.startsWith("runtime/") ||
        lowerPath.startsWith("config/")) &&
      (lowerPath.includes("preflight") ||
        lowerPath.includes("policy") ||
        lowerPath.includes("session"));
    if (!isPolicyPath) {
      return false;
    }
    const lowerContent = (fileContents[path] ?? "").toLowerCase();
    return (
      (lowerContent.includes("execution_preflight") ||
        lowerContent.includes("preflight") ||
        lowerContent.includes("execution plan") ||
        lowerContent.includes("approval_request")) &&
      (lowerContent.includes("endpoint") ||
        lowerContent.includes("request_url") ||
        lowerContent.includes("url")) &&
      (lowerContent.includes("get") ||
        lowerContent.includes("allowed_methods")) &&
      (lowerContent.includes("credential_reference") ||
        lowerContent.includes("credential reference") ||
        lowerContent.includes("凭证引用")) &&
      (lowerContent.includes("evidence_schema") ||
        lowerContent.includes("request_url_hash") ||
        lowerContent.includes("response_sha256"))
    );
  });
  const hasDryRunMismatch = lowerDryRunContent.includes("mismatch: 0");

  const checks = [
    buildMockCapabilityVerificationCheck(
      "package_structure",
      "包结构",
      hasSkill,
      hasSkill ? "Mock 文件清单包含 SKILL.md。" : "文件清单缺少 SKILL.md。",
      ["补齐 SKILL.md。"],
    ),
    buildMockCapabilityVerificationCheck(
      "input_contract",
      "输入 contract",
      hasInputContract,
      hasInputContract ? "已找到输入 contract。" : "缺少输入 contract。",
      ["新增 contract/input.schema.json。"],
    ),
    buildMockCapabilityVerificationCheck(
      "output_contract",
      "输出 contract",
      hasOutputContract,
      hasOutputContract ? "已找到输出 contract。" : "缺少输出 contract。",
      ["新增 contract/output.schema.json。"],
    ),
    buildMockCapabilityVerificationCheck(
      "permission_declaration",
      "权限声明",
      hasPermissionSummary,
      hasPermissionSummary ? "已声明权限摘要。" : "缺少权限摘要。",
      ["补充 permissionSummary。"],
    ),
    buildMockCapabilityVerificationCheck(
      "static_risk_scan",
      "静态风险扫描",
      !hasRisk,
      hasRisk && mentionsReadonlyHttp && !declaresReadonlyHttp
        ? "Mock 静态扫描发现只读 HTTP / API 访问，但 permissionSummary 未声明网络只读权限。"
        : hasRisk
          ? "Mock 静态扫描发现高风险 token。"
          : "Mock 静态扫描未发现高风险 token。",
      ["移除高风险动作，或留到后续人工确认 gate。"],
    ),
    buildMockCapabilityVerificationCheck(
      "fixture_presence",
      "fixture / example",
      hasFixture,
      hasFixture
        ? "已找到 tests/ 或 examples/。"
        : "缺少 tests/ 或 examples/。",
      ["新增 examples/input.sample.json 或 tests/fixture.test.*。"],
    ),
  ];
  if (mentionsReadonlyHttp) {
    checks.push(
      buildMockCapabilityVerificationCheck(
        "readonly_http_fixture_input",
        "只读 HTTP fixture 输入",
        hasFixtureInput,
        hasFixtureInput
          ? "Mock 已找到 fixture_path 输入字段。"
          : "Mock 只读 HTTP / API 草案缺少 fixture 输入字段。",
        ["新增 fixture_path 输入字段。"],
      ),
      buildMockCapabilityVerificationCheck(
        "readonly_http_fixture",
        "只读 HTTP fixture",
        hasHttpFixture,
        hasHttpFixture
          ? "Mock 已找到 tests/fixture。"
          : "Mock 只读 HTTP / API 草案缺少 tests/fixture。",
        ["新增 tests/fixture.json。"],
      ),
      buildMockCapabilityVerificationCheck(
        "readonly_http_expected_output",
        "只读 HTTP expected output",
        hasHttpExpectedOutput,
        hasHttpExpectedOutput
          ? "Mock 已找到 tests/expected-output。"
          : "Mock 只读 HTTP / API 草案缺少 tests/expected-output。",
        ["新增 tests/expected-output.json。"],
      ),
      buildMockCapabilityVerificationCheck(
        "readonly_http_fixture_dry_run",
        "只读 HTTP fixture dry-run 入口",
        hasDryRunEntry,
        hasDryRunEntry
          ? "Mock 已找到 fixture dry-run 入口。"
          : "Mock 只读 HTTP / API 草案缺少 fixture dry-run 入口。",
        ["新增 scripts/dry-run.mjs。"],
      ),
      buildMockCapabilityVerificationCheck(
        "readonly_http_fixture_dry_run_expected_output",
        "只读 HTTP fixture dry-run 结果绑定",
        hasDryRunExpectedOutputBinding,
        hasDryRunExpectedOutputBinding
          ? "Mock dry-run 入口已绑定 expected output。"
          : "Mock dry-run 入口未绑定 expected output。",
        ["在 scripts/dry-run.mjs 中读取 tests/expected-output.json。"],
      ),
      buildMockCapabilityVerificationCheck(
        "readonly_http_fixture_dry_run_offline",
        "只读 HTTP fixture dry-run 离线边界",
        !hasNetworkedDryRun,
        hasNetworkedDryRun
          ? "Mock fixture dry-run 入口包含真实联网痕迹。"
          : "Mock fixture dry-run 未发现真实联网痕迹。",
        ["移除 dry-run 入口里的 fetch / HTTP URL，只读取本地 fixture。"],
      ),
      buildMockCapabilityVerificationCheck(
        "readonly_http_no_credentials",
        "只读 HTTP 无凭证草案",
        !hasCredentialToken,
        hasCredentialToken
          ? "Mock 只读 HTTP / API 草案包含凭证字段。"
          : "Mock 未发现凭证字段。",
        ["移除 Authorization / API key / access token 等字段。"],
      ),
      buildMockCapabilityVerificationCheck(
        "readonly_http_session_authorization",
        "只读 HTTP session 授权策略",
        hasSessionAuthorization,
        hasSessionAuthorization
          ? "Mock 已找到 session-required / read-only GET / evidence-audited policy。"
          : "Mock 只读 HTTP / API 草案缺少 session authorization policy。",
        ["新增 policy/readonly-http-session.json。"],
      ),
      buildMockCapabilityVerificationCheck(
        "readonly_http_credential_reference",
        "只读 HTTP 凭证引用策略",
        hasCredentialReference,
        hasCredentialReference
          ? "Mock 已找到受控 credential_reference。"
          : "Mock 只读 HTTP / API 草案缺少 credential_reference。",
        ["在 policy/readonly-http-session.json 中新增 credential_reference。"],
      ),
      buildMockCapabilityVerificationCheck(
        "readonly_http_execution_preflight",
        "只读 HTTP 执行 preflight",
        hasExecutionPreflight,
        hasExecutionPreflight
          ? "Mock 已找到 execution_preflight。"
          : "Mock 只读 HTTP / API 草案缺少 execution_preflight。",
        ["在 policy/readonly-http-session.json 中新增 execution_preflight。"],
        hasExecutionPreflight
          ? buildReadonlyHttpExecutionPreflightEvidence()
          : [],
      ),
    );
    const canExecuteDryRun =
      declaresReadonlyHttp &&
      hasHttpFixture &&
      hasHttpExpectedOutput &&
      hasFixtureInput &&
      hasDryRunEntry &&
      hasDryRunExpectedOutputBinding &&
      !hasNetworkedDryRun &&
      !hasCredentialToken &&
      hasSessionAuthorization &&
      hasCredentialReference &&
      hasExecutionPreflight;
    checks.push(
      buildMockCapabilityVerificationCheck(
        "readonly_http_fixture_dry_run_execute",
        "只读 HTTP fixture dry-run 执行",
        canExecuteDryRun && !hasDryRunMismatch,
        canExecuteDryRun
          ? hasDryRunMismatch
            ? "Mock fixture dry-run actual 与 expected output 不一致。"
            : "Mock fixture dry-run 已离线执行，输出与 expected output 一致。"
          : "Mock fixture dry-run 执行前置 gate 未全部通过，已拒绝执行。",
        [
          "修复 fixture input、fixture、expected output、dry-run 入口与离线边界。",
        ],
        canExecuteDryRun && !hasDryRunMismatch
          ? [
              { key: "scriptPath", value: dryRunPath },
              {
                key: "expectedOutputPath",
                value: "tests/expected-output.json",
              },
              { key: "durationMs", value: "0" },
              { key: "exitStatus", value: "mock-success" },
              { key: "actualSha256", value: "mock-actual-sha256" },
              { key: "expectedSha256", value: "mock-expected-sha256" },
              { key: "stdoutPreview", value: "mock fixture dry-run only" },
            ]
          : [],
      ),
    );
  }
  const failedCheckCount = checks.filter(
    (check) => check.status === "failed",
  ).length;
  const timestamp = new Date().toISOString();
  const summary = {
    reportId: `capver-mock-${Date.now()}`,
    status: failedCheckCount === 0 ? "passed" : "failed",
    summary:
      failedCheckCount === 0
        ? "最小 verification gate 通过，等待后续注册阶段。"
        : `最小 verification gate 未通过，${failedCheckCount} 项检查失败。`,
    checkedAt: timestamp,
    failedCheckCount,
  };
  draft.verificationStatus =
    failedCheckCount === 0
      ? "verified_pending_registration"
      : "verification_failed";
  draft.lastVerification = summary;
  draft.updatedAt = timestamp;
  const report = {
    ...summary,
    draftId,
    checks,
  };
  draft.__lastVerificationReport = report;

  return {
    draft,
    report,
  };
}

function registerMockCapabilityDraft(args?: Record<string, unknown>) {
  const request = readMockCapabilityDraftRequest(args);
  const workspaceRoot = normalizeMockCapabilityWorkspaceRoot(
    request.workspaceRoot ?? request.workspace_root,
  );
  const draftId =
    typeof request.draftId === "string"
      ? request.draftId
      : typeof request.draft_id === "string"
        ? request.draft_id
        : "";
  const draft = getMockCapabilityDraftStore(workspaceRoot).find(
    (item) => item.draftId === draftId,
  );
  if (!draft) {
    throw new Error(`Capability Draft 不存在: ${draftId}`);
  }
  if (draft.verificationStatus !== "verified_pending_registration") {
    throw new Error(
      `Capability Draft 当前状态为 ${draft.verificationStatus}，只有 verified_pending_registration 可以注册`,
    );
  }

  const normalizedDraftSuffix = draftId
    .replace(/^capdraft-/, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12);
  const skillDirectory = `capability-${normalizedDraftSuffix || "mock"}`;
  const timestamp = new Date().toISOString();
  const registrationId = `capreg-mock-${Date.now()}`;
  const verificationGates = collectMockRegistrationVerificationGates(
    draft as Record<string, unknown>,
  );
  const registration = {
    registrationId,
    registeredAt: timestamp,
    skillDirectory,
    registeredSkillDirectory: `${workspaceRoot}/.agents/skills/${skillDirectory}`,
    sourceDraftId: draftId,
    sourceVerificationReportId:
      typeof draft.lastVerification?.reportId === "string"
        ? draft.lastVerification.reportId
        : null,
    generatedFileCount: Array.isArray(draft.generatedFiles)
      ? draft.generatedFiles.length
      : 0,
    permissionSummary: Array.isArray(draft.permissionSummary)
      ? draft.permissionSummary
      : [],
    verificationGates,
    approvalRequests: collectMockRegistrationApprovalRequests(
      registrationId,
      timestamp,
      skillDirectory,
      verificationGates,
    ),
  };

  draft.verificationStatus = "registered";
  draft.lastRegistration = registration;
  draft.updatedAt = timestamp;

  return {
    draft,
    registration,
  };
}

function listMockCapabilityRegisteredSkills(args?: Record<string, unknown>) {
  const request = readMockCapabilityDraftRequest(args);
  const workspaceRoot = normalizeMockCapabilityWorkspaceRoot(
    request.workspaceRoot ?? request.workspace_root,
  );

  return getMockCapabilityDraftStore(workspaceRoot)
    .filter(
      (draft) =>
        draft.verificationStatus === "registered" && draft.lastRegistration,
    )
    .map((draft) => {
      const registration = draft.lastRegistration as Record<string, unknown>;
      const directory =
        typeof registration.skillDirectory === "string"
          ? registration.skillDirectory
          : typeof registration.skill_directory === "string"
            ? registration.skill_directory
            : draft.draftId;
      const registeredSkillDirectory =
        typeof registration.registeredSkillDirectory === "string"
          ? registration.registeredSkillDirectory
          : typeof registration.registered_skill_directory === "string"
            ? registration.registered_skill_directory
            : `${workspaceRoot}/.agents/skills/${directory}`;

      return {
        key: `workspace:${directory}`,
        name: draft.name,
        description: draft.description,
        directory,
        registeredSkillDirectory,
        registration,
        permissionSummary: Array.isArray(draft.permissionSummary)
          ? draft.permissionSummary
          : [],
        metadata: {},
        allowedTools: [],
        resourceSummary: {
          hasScripts: Array.isArray(draft.generatedFiles)
            ? draft.generatedFiles.some((file: { relativePath?: string }) =>
                String(file.relativePath ?? "").startsWith("scripts/"),
              )
            : false,
          hasReferences: Array.isArray(draft.generatedFiles)
            ? draft.generatedFiles.some((file: { relativePath?: string }) =>
                String(file.relativePath ?? "").startsWith("references/"),
              )
            : false,
          hasAssets: Array.isArray(draft.generatedFiles)
            ? draft.generatedFiles.some((file: { relativePath?: string }) =>
                String(file.relativePath ?? "").startsWith("assets/"),
              )
            : false,
        },
        standardCompliance: {
          isStandard: true,
          validationErrors: [],
          deprecatedFields: [],
        },
        launchEnabled: false,
        runtimeGate:
          "已注册为 Workspace 本地 Skill 包；进入运行前还需要 P3C runtime binding 与 tool_runtime 授权。",
      };
    });
}

function isMockHttpUrlWithoutInlineSecret(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function validateMockApprovalSessionInputField(
  approvalRequest: Record<string, unknown>,
  rule: Record<string, unknown>,
  value: unknown,
) {
  const fieldKey = String(rule.fieldKey ?? rule.field_key ?? "");
  const kind = String(rule.kind ?? "");
  const reject = (code: string, message: string) => ({
    fieldKey,
    accepted: false,
    code,
    message,
  });
  const accept = (message: string) => ({
    fieldKey,
    accepted: true,
    code: "accepted",
    message,
  });

  if ((rule.secretAllowed ?? rule.secret_allowed) === true) {
    return reject(
      "secret_field_not_allowed",
      "session approval 输入不允许接收 secret 明文。",
    );
  }

  if (kind === "boolean_confirmation") {
    return value === true
      ? accept("已收到当前 session 的显式 true 确认。")
      : reject("confirmation_required", "必须传入布尔 true。");
  }
  if (kind === "url") {
    if (typeof value !== "string" || value.trim().length === 0) {
      return reject("url_required", "必须传入 URL 字符串。");
    }
    return isMockHttpUrlWithoutInlineSecret(value.trim())
      ? accept("已通过 http/https URL 校验；值不会写入注册包。")
      : reject(
          "invalid_url",
          "必须是 http/https URL，且不能在 URL 中内嵌凭证。",
        );
  }
  if (kind === "credential_reference") {
    const expectedReference = String(
      approvalRequest.credentialReferenceId ??
        approvalRequest.credential_reference_id ??
        "",
    );
    return typeof value === "string" && value.trim() === expectedReference
      ? accept("已确认凭证引用；未接收 token 明文。")
      : reject(
          "credential_reference_mismatch",
          "凭证引用必须匹配 approval request 的 credentialReferenceId。",
        );
  }
  return reject("unsupported_field_kind", "当前字段类型尚未开放提交校验。");
}

function buildMockControlledGetPreflight(
  approvalRequest: Record<string, unknown>,
  validated: boolean,
) {
  const evidenceSchema = Array.isArray(approvalRequest.evidenceSchema)
    ? approvalRequest.evidenceSchema
    : Array.isArray(approvalRequest.evidence_schema)
      ? approvalRequest.evidence_schema
      : [];
  return {
    status: validated
      ? "ready_for_controlled_get_preflight"
      : "blocked_by_session_input",
    gateId: "readonly_http_controlled_get_preflight",
    approvalId: String(
      approvalRequest.approvalId ?? approvalRequest.approval_id ?? "",
    ),
    method: String(approvalRequest.method ?? ""),
    methodAllowed: approvalRequest.method === "GET",
    endpointSource: String(
      approvalRequest.endpointSource ?? approvalRequest.endpoint_source ?? "",
    ),
    endpointValidated: validated,
    endpointValueReturned: false,
    credentialReferenceId: String(
      approvalRequest.credentialReferenceId ??
        approvalRequest.credential_reference_id ??
        "",
    ),
    credentialResolutionRequired: Boolean(
      approvalRequest.credentialReferenceId ??
      approvalRequest.credential_reference_id,
    ),
    credentialResolved: false,
    evidenceSchema: evidenceSchema.map(String),
    policyPath: String(
      approvalRequest.policyPath ?? approvalRequest.policy_path ?? "",
    ),
    requestExecutionEnabled: false,
    runtimeExecutionEnabled: false,
    blockedReason: validated
      ? "session 输入已通过校验并到达受控 GET preflight；本阶段仍不解析凭证、不发真实 HTTP。"
      : "session 输入未通过校验，受控 GET preflight 保持阻断。",
    nextAction: validated
      ? "后续只能在单独的受控 GET 门禁中解析 session 凭证引用、执行请求并写入 evidence。"
      : "先补齐并重新校验 session 输入，不能跳过 preflight 进入 runtime。",
  };
}

function hashMockString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return `mock-sha256-${hash.toString(16).padStart(8, "0")}`;
}

function buildMockDryPreflightPlan(
  approvalRequest: Record<string, unknown>,
  inputs: Record<string, unknown>,
  validated: boolean,
) {
  const evidenceSchema = Array.isArray(approvalRequest.evidenceSchema)
    ? approvalRequest.evidenceSchema.map(String)
    : Array.isArray(approvalRequest.evidence_schema)
      ? approvalRequest.evidence_schema.map(String)
      : [];
  const endpointInput = inputs.runtime_endpoint_input;
  return {
    status: validated
      ? "planned_without_execution"
      : "blocked_by_session_input",
    planId: `${String(
      approvalRequest.approvalId ?? approvalRequest.approval_id ?? "",
    )}:dry-preflight`,
    gateId: "readonly_http_controlled_get_preflight",
    approvalId: String(
      approvalRequest.approvalId ?? approvalRequest.approval_id ?? "",
    ),
    method: String(approvalRequest.method ?? ""),
    methodAllowed: approvalRequest.method === "GET",
    requestUrlHash:
      validated && typeof endpointInput === "string"
        ? hashMockString(endpointInput.trim())
        : null,
    requestUrlHashAlgorithm: "sha256",
    endpointValueReturned: false,
    endpointInputPersisted: false,
    credentialReferenceId: String(
      approvalRequest.credentialReferenceId ??
        approvalRequest.credential_reference_id ??
        "",
    ),
    credentialResolutionStage: "not_started",
    credentialResolved: false,
    evidenceSchema,
    plannedEvidenceKeys: evidenceSchema,
    policyPath: String(
      approvalRequest.policyPath ?? approvalRequest.policy_path ?? "",
    ),
    networkRequestSent: false,
    responseCaptured: false,
    requestExecutionEnabled: false,
    runtimeExecutionEnabled: false,
    valueRetention: "hash_only",
    blockedReason: validated
      ? "已生成 dry preflight evidence plan；仅保留 URL hash，不执行请求、不解析凭证。"
      : "session 输入未通过校验，不能生成可执行 evidence plan。",
    nextAction: validated
      ? "下一刀才能在受控 GET 门禁中解析 session credential 并执行真实请求。"
      : "先重新提交合法 session 输入，再生成 dry preflight plan。",
  };
}

function submitMockApprovalSessionInputs(args?: Record<string, unknown>) {
  const request = readMockCapabilityDraftRequest(args);
  const workspaceRoot = normalizeMockCapabilityWorkspaceRoot(
    request.workspaceRoot ?? request.workspace_root,
  );
  const approvalId = String(request.approvalId ?? request.approval_id ?? "");
  const inputs =
    request.inputs && typeof request.inputs === "object"
      ? (request.inputs as Record<string, unknown>)
      : {};
  const registeredSkills = listMockCapabilityRegisteredSkills({
    request: { workspaceRoot },
  });
  const approvalRequest = registeredSkills
    .flatMap((skill: Record<string, any>) =>
      Array.isArray(skill.registration?.approvalRequests)
        ? skill.registration.approvalRequests
        : [],
    )
    .find(
      (item: Record<string, unknown>) =>
        String(item.approvalId ?? item.approval_id ?? "") === approvalId,
    ) as Record<string, any> | undefined;
  if (!approvalRequest) {
    throw new Error(`未找到 approval request: ${approvalId}`);
  }

  const contract =
    approvalRequest.sessionInputSubmissionContract ??
    approvalRequest.session_input_submission_contract ??
    {};
  const rules = Array.isArray(contract.validationRules)
    ? contract.validationRules
    : Array.isArray(contract.validation_rules)
      ? contract.validation_rules
      : [];
  const acceptedFieldKeys: string[] = [];
  const missingFieldKeys: string[] = [];
  const rejectedFieldKeys: string[] = [];
  const fieldResults: Array<Record<string, unknown>> = [];
  const acceptedKeySet = new Set(
    (Array.isArray(contract.acceptedFieldKeys)
      ? contract.acceptedFieldKeys
      : Array.isArray(contract.accepted_field_keys)
        ? contract.accepted_field_keys
        : []
    ).map(String),
  );

  for (const rule of rules) {
    const fieldKey = String(rule.fieldKey ?? rule.field_key ?? "");
    if (rule.required === true && !(fieldKey in inputs)) {
      missingFieldKeys.push(fieldKey);
      fieldResults.push({
        fieldKey,
        accepted: false,
        code: "missing_required_field",
        message: "缺少必填 session 输入。",
      });
      continue;
    }
    if (!(fieldKey in inputs)) {
      continue;
    }
    const result = validateMockApprovalSessionInputField(
      approvalRequest,
      rule,
      inputs[fieldKey],
    );
    if (result.accepted) {
      acceptedFieldKeys.push(fieldKey);
    } else {
      rejectedFieldKeys.push(fieldKey);
    }
    fieldResults.push(result);
  }

  const unexpectedFieldKeys = Object.keys(inputs)
    .filter((fieldKey) => !acceptedKeySet.has(fieldKey))
    .sort();
  for (const fieldKey of unexpectedFieldKeys) {
    rejectedFieldKeys.push(fieldKey);
    fieldResults.push({
      fieldKey,
      accepted: false,
      code: "unexpected_field",
      message: "字段不在一次性 session 输入合同中，已拒绝接收。",
    });
  }

  const validated =
    missingFieldKeys.length === 0 && rejectedFieldKeys.length === 0;

  return {
    approvalId,
    sessionId:
      typeof request.sessionId === "string"
        ? request.sessionId
        : typeof request.session_id === "string"
          ? request.session_id
          : null,
    status: validated ? "validated_pending_runtime_gate" : "rejected",
    scope: "session",
    acceptedFieldKeys,
    missingFieldKeys,
    rejectedFieldKeys,
    fieldResults,
    endpointInputPersisted: false,
    secretMaterialAccepted: false,
    tokenPersisted: false,
    credentialResolved: false,
    valueRetention: "none",
    evidenceCaptureRequired: Boolean(contract.evidenceCaptureRequired),
    runtimeExecutionEnabled: false,
    nextGate: "readonly_http_controlled_get_preflight",
    controlledGetPreflight: buildMockControlledGetPreflight(
      approvalRequest,
      validated,
    ),
    dryPreflightPlan: buildMockDryPreflightPlan(
      approvalRequest,
      inputs,
      validated,
    ),
    blockedReason: validated
      ? "session 输入已通过校验；值未持久化，后续仍需单独进入受控 GET 执行门禁。"
      : "session 输入未通过校验；不会解析凭证、不会执行真实 HTTP。",
  };
}

function executeMockControlledGet(args?: Record<string, unknown>) {
  const request = readMockCapabilityDraftRequest(args);
  const validation = submitMockApprovalSessionInputs(args);
  const inputs =
    request.inputs && typeof request.inputs === "object"
      ? (request.inputs as Record<string, unknown>)
      : {};
  const endpointInput = inputs.runtime_endpoint_input;
  const credentialReferenceId = String(
    validation.controlledGetPreflight?.credentialReferenceId ?? "",
  );

  if (validation.status !== "validated_pending_runtime_gate") {
    return {
      approvalId: validation.approvalId,
      sessionId: validation.sessionId,
      status: "blocked",
      scope: "session",
      gateId: "readonly_http_controlled_get_execution",
      method: "GET",
      methodAllowed: true,
      requestUrlHash: null,
      requestUrlHashAlgorithm: "sha256",
      responseStatus: null,
      responseSha256: null,
      responseBytes: 0,
      responsePreview: null,
      responsePreviewTruncated: false,
      executedAt: null,
      networkRequestSent: false,
      responseCaptured: false,
      endpointValueReturned: false,
      endpointInputPersisted: false,
      credentialReferenceId,
      credentialResolved: false,
      tokenPersisted: false,
      requestExecutionEnabled: false,
      runtimeExecutionEnabled: false,
      valueRetention: "none",
      sessionInputStatus: validation.status,
      fieldResults: validation.fieldResults,
      evidence: [],
      evidenceArtifact: null,
      blockedReason: "session 输入未通过校验；受控 GET 不会发送请求。",
      nextAction:
        "先补齐 session 授权、endpoint、凭证引用确认和 evidence 捕获确认。",
    };
  }

  const requestUrlHash =
    typeof endpointInput === "string" ? hashMockString(endpointInput) : null;
  const responsePreview = JSON.stringify({ ok: true, source: "mock" });
  const responseSha256 = hashMockString(responsePreview);
  const executedAt = new Date().toISOString();
  const evidenceArtifactId = `controlled-get-${hashMockString(
    `${validation.approvalId}:${executedAt}`,
  ).replace(/^mock-sha256-/, "")}`;

  return {
    approvalId: validation.approvalId,
    sessionId: validation.sessionId,
    status: "executed",
    scope: "session",
    gateId: "readonly_http_controlled_get_execution",
    method: "GET",
    methodAllowed: true,
    requestUrlHash,
    requestUrlHashAlgorithm: "sha256",
    responseStatus: 200,
    responseSha256,
    responseBytes: responsePreview.length,
    responsePreview,
    responsePreviewTruncated: false,
    executedAt,
    networkRequestSent: true,
    responseCaptured: true,
    endpointValueReturned: false,
    endpointInputPersisted: false,
    credentialReferenceId,
    credentialResolved: false,
    tokenPersisted: false,
    requestExecutionEnabled: true,
    runtimeExecutionEnabled: false,
    valueRetention: "ephemeral_response_preview",
    sessionInputStatus: validation.status,
    fieldResults: validation.fieldResults,
    evidence: [
      { key: "request_url_hash", value: requestUrlHash ?? "" },
      { key: "request_method", value: "GET" },
      { key: "response_status", value: "200" },
      { key: "response_sha256", value: responseSha256 },
      { key: "executed_at", value: executedAt },
    ],
    evidenceArtifact: {
      artifactId: evidenceArtifactId,
      relativePath: `.lime/capability-drafts/controlled-get-evidence/${evidenceArtifactId}.json`,
      absolutePath: `/mock/.lime/capability-drafts/controlled-get-evidence/${evidenceArtifactId}.json`,
      contentSha256: hashMockString(
        `${requestUrlHash}:${responseSha256}:${executedAt}`,
      ),
      persisted: true,
      containsEndpointValue: false,
      containsTokenValue: false,
      containsResponsePreview: false,
    },
    blockedReason:
      "受控 GET 已执行并返回当前命令结果；endpoint / token 均未持久化，未进入 runtime。",
    nextAction:
      "后续才能把该 evidence 接回 runtime artifact / evidence pack 主链。",
  };
}

function buildMockAgentRuntimeWorkspaceSkillBindings(
  args?: Record<string, unknown>,
) {
  const request = readMockCapabilityDraftRequest(args);
  const workspaceRoot = normalizeMockCapabilityWorkspaceRoot(
    request.workspaceRoot ?? request.workspace_root,
  );
  const caller =
    typeof request.caller === "string" && request.caller.trim()
      ? request.caller.trim()
      : "assistant";
  const registeredSkills = listMockCapabilityRegisteredSkills(args);
  const bindings = registeredSkills.map((skill: Record<string, any>) => {
    const registration = skill.registration ?? {};
    return {
      key: `workspace_skill:${skill.directory}`,
      name: typeof skill.name === "string" ? skill.name : skill.directory,
      description:
        typeof skill.description === "string" ? skill.description : "",
      directory: skill.directory,
      registered_skill_directory:
        skill.registeredSkillDirectory ??
        skill.registered_skill_directory ??
        "",
      registration: {
        registration_id:
          registration.registrationId ?? registration.registration_id ?? "",
        registered_at:
          registration.registeredAt ?? registration.registered_at ?? "",
        skill_directory:
          registration.skillDirectory ?? registration.skill_directory ?? "",
        registered_skill_directory:
          registration.registeredSkillDirectory ??
          registration.registered_skill_directory ??
          "",
        source_draft_id:
          registration.sourceDraftId ?? registration.source_draft_id ?? "",
        source_verification_report_id:
          registration.sourceVerificationReportId ??
          registration.source_verification_report_id ??
          null,
        generated_file_count:
          registration.generatedFileCount ??
          registration.generated_file_count ??
          0,
        permission_summary:
          registration.permissionSummary ??
          registration.permission_summary ??
          [],
      },
      permission_summary:
        skill.permissionSummary ?? skill.permission_summary ?? [],
      metadata: skill.metadata ?? {},
      allowed_tools: skill.allowedTools ?? skill.allowed_tools ?? [],
      resource_summary: {
        has_scripts: Boolean(
          skill.resourceSummary?.hasScripts ??
          skill.resource_summary?.has_scripts,
        ),
        has_references: Boolean(
          skill.resourceSummary?.hasReferences ??
          skill.resource_summary?.has_references,
        ),
        has_assets: Boolean(
          skill.resourceSummary?.hasAssets ??
          skill.resource_summary?.has_assets,
        ),
      },
      standard_compliance: {
        is_standard: Boolean(
          skill.standardCompliance?.isStandard ??
          skill.standard_compliance?.is_standard,
        ),
        validation_errors:
          skill.standardCompliance?.validationErrors ??
          skill.standard_compliance?.validation_errors ??
          [],
        deprecated_fields:
          skill.standardCompliance?.deprecatedFields ??
          skill.standard_compliance?.deprecated_fields ??
          [],
      },
      runtime_binding_target: "workspace_skill",
      binding_status: "ready_for_manual_enable",
      binding_status_reason:
        "Mock：已具备后续 workspace catalog binding 候选资格；当前仍未注入 Query Loop 或 tool_runtime。",
      next_gate: "manual_runtime_enable",
      query_loop_visible: false,
      tool_runtime_visible: false,
      launch_enabled: false,
      runtime_gate:
        "等待 P3C 后续把该 workspace skill 显式绑定到 Query Loop metadata 与 tool_runtime 授权裁剪。",
    };
  });

  return {
    request: {
      workspace_root: workspaceRoot,
      caller,
      surface: {
        workbench: request.workbench === true,
        browser_assist:
          request.browserAssist === true || request.browser_assist === true,
      },
    },
    warnings: [
      "Mock：P3C 当前只返回 runtime binding readiness；不会 reload Skill，也不会注入默认 tool surface。",
    ],
    counts: {
      registered_total: bindings.length,
      ready_for_manual_enable_total: bindings.length,
      blocked_total: 0,
      query_loop_visible_total: 0,
      tool_runtime_visible_total: 0,
      launch_enabled_total: 0,
    },
    bindings,
  };
}

export const skillForgeMocks: Record<
  string,
  (args?: Record<string, unknown>) => unknown
> = {
  capability_draft_create: (args?: Record<string, unknown>) =>
    createMockCapabilityDraft(args),
  capability_draft_list: (args?: Record<string, unknown>) =>
    listMockCapabilityDrafts(args),
  capability_draft_get: (args?: Record<string, unknown>) =>
    getMockCapabilityDraft(args),
  capability_draft_verify: (args?: Record<string, unknown>) =>
    verifyMockCapabilityDraft(args),
  capability_draft_register: (args?: Record<string, unknown>) =>
    registerMockCapabilityDraft(args),
  capability_draft_submit_approval_session_inputs: (
    args?: Record<string, unknown>,
  ) => submitMockApprovalSessionInputs(args),
  capability_draft_execute_controlled_get: (args?: Record<string, unknown>) =>
    executeMockControlledGet(args),
  agent_runtime_list_workspace_skill_bindings: (
    args?: Record<string, unknown>,
  ) => buildMockAgentRuntimeWorkspaceSkillBindings(args),
};
