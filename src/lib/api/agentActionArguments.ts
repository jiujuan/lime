function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function numberValue(
  record: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function compactRecord(
  entries: Record<string, unknown | undefined>,
): Record<string, unknown> | undefined {
  const compacted = Object.fromEntries(
    Object.entries(entries).filter(([, value]) => value !== undefined),
  );
  return Object.keys(compacted).length > 0 ? compacted : undefined;
}

function resolvePolicySource(
  args: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const metadata = recordValue(args.metadata);
  return (
    recordValue(args.permission_facts) ||
    recordValue(args.permissionFacts) ||
    recordValue(metadata?.permission_facts) ||
    recordValue(metadata?.permissionFacts) ||
    recordValue(args.policy) ||
    recordValue(metadata?.policy)
  );
}

function inferScopeKind(policy: Record<string, unknown>): string | undefined {
  const explicit = stringValue(policy, [
    "scope_kind",
    "scopeKind",
    "permission_scope_kind",
    "permissionScopeKind",
  ]);
  if (explicit) return explicit;
  if (stringValue(policy, ["networkUrl", "network_url", "networkHost"])) {
    return "url";
  }
  if (stringValue(policy, ["cwd", "working_directory", "workingDirectory"])) {
    return "cwd";
  }
  return undefined;
}

function summarizeAuthorization(
  policy: Record<string, unknown>,
): string | undefined {
  const explicit = stringValue(policy, [
    "authorization_summary",
    "authorizationSummary",
    "authorization_scope",
    "authorizationScope",
  ]);
  if (explicit) return explicit;

  const approvalPolicy = stringValue(policy, [
    "approvalPolicy",
    "approval_policy",
  ]);
  const sandboxPolicy = stringValue(policy, [
    "requestedSandboxPolicy",
    "requested_sandbox_policy",
    "sandboxPolicy",
    "sandbox_policy",
  ]);
  const parts = [
    approvalPolicy ? `approval=${approvalPolicy}` : undefined,
    sandboxPolicy ? `sandbox=${sandboxPolicy}` : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function defaultPort(protocol: string | undefined): number | undefined {
  switch (protocol) {
    case "http":
      return 80;
    case "https":
      return 443;
    default:
      return undefined;
  }
}

function normalizeProtocol(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim().replace(/:$/, "") || undefined;
}

function parseNetworkUrl(value: string | undefined):
  | {
      host?: string;
      port?: number;
      protocol?: string;
    }
  | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    const protocol = normalizeProtocol(parsed.protocol);
    return {
      host: parsed.hostname || undefined,
      port: parsed.port ? Number(parsed.port) : defaultPort(protocol),
      protocol,
    };
  } catch {
    return undefined;
  }
}

function buildNetworkApprovalFacts(
  args: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const metadata = recordValue(args.metadata);
  const policy = resolvePolicySource(args);
  const context =
    recordValue(args.network_approval_context) ||
    recordValue(args.networkApprovalContext) ||
    recordValue(metadata?.network_approval_context) ||
    recordValue(metadata?.networkApprovalContext) ||
    recordValue(policy?.network_approval_context) ||
    recordValue(policy?.networkApprovalContext);
  const url =
    stringValue(context, ["url", "networkUrl", "network_url"]) ||
    stringValue(policy, ["networkUrl", "network_url", "url"]) ||
    stringValue(args, ["networkUrl", "network_url", "url"]);
  const parsedUrl = parseNetworkUrl(url);
  const protocol = normalizeProtocol(
    stringValue(context, ["protocol", "networkProtocol", "network_protocol"]) ||
      stringValue(policy, [
        "networkProtocol",
        "network_protocol",
        "protocol",
      ]) ||
      stringValue(args, ["networkProtocol", "network_protocol", "protocol"]) ||
      parsedUrl?.protocol,
  );
  const host =
    stringValue(context, ["host", "networkHost", "network_host"]) ||
    stringValue(policy, ["networkHost", "network_host", "host"]) ||
    stringValue(args, ["networkHost", "network_host", "host"]) ||
    parsedUrl?.host;
  const port =
    numberValue(context, ["port", "networkPort", "network_port"]) ??
    numberValue(policy, ["networkPort", "network_port", "port"]) ??
    numberValue(args, ["networkPort", "network_port", "port"]) ??
    parsedUrl?.port;
  const environmentId =
    stringValue(context, ["environment_id", "environmentId"]) ||
    stringValue(policy, ["environment_id", "environmentId"]) ||
    stringValue(args, ["environment_id", "environmentId"]);
  const ownerCallId =
    stringValue(context, [
      "owner_call_id",
      "ownerCallId",
      "callId",
      "call_id",
    ]) ||
    stringValue(policy, [
      "owner_call_id",
      "ownerCallId",
      "callId",
      "call_id",
    ]) ||
    stringValue(args, [
      "owner_call_id",
      "ownerCallId",
      "item_id",
      "itemId",
      "tool_call_id",
      "toolCallId",
      "call_id",
      "callId",
    ]);
  const decision =
    stringValue(context, ["decision", "networkDecision", "network_decision"]) ||
    stringValue(args, [
      "decision",
      "networkDecision",
      "network_decision",
      "approvalDecision",
      "approval_decision",
    ]);
  const proposedPolicyAmendments =
    args.proposed_network_policy_amendments ??
    args.proposedNetworkPolicyAmendments ??
    context?.proposed_network_policy_amendments ??
    context?.proposedNetworkPolicyAmendments;

  if (!host && !url && !context && !proposedPolicyAmendments) {
    return undefined;
  }

  return compactRecord({
    decision,
    environment_id: environmentId,
    host,
    owner_call_id: ownerCallId,
    port,
    protocol,
    proposed_policy_amendments: proposedPolicyAmendments,
    url,
  });
}

function buildGuardianReviewFacts(
  args: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const metadata = recordValue(args.metadata);
  const review =
    recordValue(args.guardian_review) ||
    recordValue(args.guardianReview) ||
    recordValue(args.review) ||
    recordValue(metadata?.guardian_review) ||
    recordValue(metadata?.guardianReview);
  const action =
    recordValue(args.guardian_review_action) ||
    recordValue(args.guardianReviewAction) ||
    recordValue(args.action) ||
    recordValue(metadata?.guardian_review_action) ||
    recordValue(metadata?.guardianReviewAction);
  const reviewId =
    stringValue(args, ["review_id", "reviewId", "guardianReviewId"]) ||
    stringValue(metadata, ["review_id", "reviewId", "guardianReviewId"]);
  const targetItemId =
    stringValue(args, ["target_item_id", "targetItemId"]) ||
    stringValue(metadata, ["target_item_id", "targetItemId"]);
  const startedAtMs =
    numberValue(args, ["started_at_ms", "startedAtMs"]) ??
    numberValue(metadata, ["started_at_ms", "startedAtMs"]);
  const completedAtMs =
    numberValue(args, ["completed_at_ms", "completedAtMs"]) ??
    numberValue(metadata, ["completed_at_ms", "completedAtMs"]);
  const decisionSource =
    stringValue(args, ["decision_source", "decisionSource"]) ||
    stringValue(metadata, ["decision_source", "decisionSource"]);
  const status =
    stringValue(review, ["status", "review_status", "reviewStatus"]) ||
    stringValue(args, ["review_status", "reviewStatus"]);

  if (
    !reviewId &&
    !targetItemId &&
    !startedAtMs &&
    !completedAtMs &&
    !decisionSource &&
    !review &&
    !action
  ) {
    return undefined;
  }

  return compactRecord({
    action,
    completed_at_ms: completedAtMs,
    decision_source: decisionSource,
    rationale: stringValue(review, ["rationale", "reason"]),
    review_id: reviewId,
    risk_level: stringValue(review, ["risk_level", "riskLevel"]),
    started_at_ms: startedAtMs,
    status,
    target_item_id: targetItemId,
    user_authorization: stringValue(review, [
      "user_authorization",
      "userAuthorization",
    ]),
  });
}

function buildPermissionFacts(
  policy: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!policy) return undefined;
  return compactRecord({
    risk_level: stringValue(policy, [
      "risk_level",
      "riskLevel",
      "commandRiskLevel",
      "networkRiskLevel",
    ]),
    risk_reason: stringValue(policy, [
      "risk_reason",
      "riskReason",
      "reasonCode",
      "commandRiskReasonCode",
      "networkRiskReasonCode",
    ]),
    risk_reason_label: stringValue(policy, [
      "risk_reason_label",
      "riskReasonLabel",
      "reason",
      "commandRiskReason",
      "networkRiskReason",
    ]),
    scope_kind: inferScopeKind(policy),
    scope_value: stringValue(policy, [
      "scope_value",
      "scopeValue",
      "networkUrl",
      "network_url",
      "networkHost",
      "cwd",
      "working_directory",
      "workingDirectory",
      "command",
    ]),
    authorization_summary: summarizeAuthorization(policy),
  });
}

export function normalizeActionArguments(
  value: unknown,
): Record<string, unknown> | undefined {
  const args = recordValue(value);
  if (!args) return undefined;

  const additions: Record<string, unknown> = {};
  if (
    !recordValue(args.permission_facts) &&
    !recordValue(args.permissionFacts)
  ) {
    const permissionFacts = buildPermissionFacts(resolvePolicySource(args));
    if (permissionFacts) {
      additions.permission_facts = permissionFacts;
    }
  }

  const existingNetworkApproval =
    recordValue(args.network_approval) || recordValue(args.networkApproval);
  if (!existingNetworkApproval) {
    const networkApproval = buildNetworkApprovalFacts(args);
    if (networkApproval) {
      additions.network_approval = networkApproval;
    }
  }

  const existingGuardianReview =
    recordValue(args.guardian_review) || recordValue(args.guardianReview);
  if (!existingGuardianReview) {
    const guardianReview = buildGuardianReviewFacts(args);
    if (guardianReview) {
      additions.guardian_review = guardianReview;
    }
  }

  return Object.keys(additions).length > 0 ? { ...args, ...additions } : args;
}
