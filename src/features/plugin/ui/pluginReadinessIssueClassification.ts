export type PluginReadinessIssueCategory =
  | "legacy"
  | "package"
  | "cloud"
  | "runtime"
  | "capability"
  | "permission"
  | "resource"
  | "taskRuntime"
  | "host"
  | "unknown";

export interface PluginReadinessIssueCategorySummary {
  category: PluginReadinessIssueCategory;
  count: number;
  codes: string[];
}

const ISSUE_CATEGORY_BY_CODE: Record<string, PluginReadinessIssueCategory> = {
  LEGACY_OR_DEPRECATED_APP: "legacy",
  MANIFEST_VERSION_UNSUPPORTED: "runtime",
  RUNTIME_TARGET_UNSUPPORTED: "runtime",
  INSTALL_MODE_UNSUPPORTED: "runtime",
  RUNTIME_VERSION_UNSUPPORTED: "runtime",
  RUNTIME_PROFILE_MISSING: "runtime",
  UI_RUNTIME_DISABLED: "runtime",
  WORKER_RUNTIME_DISABLED: "runtime",
  CAPABILITY_MISSING: "capability",
  CAPABILITY_VERSION_UNSUPPORTED: "capability",
  PERMISSION_REQUIRED: "permission",
  SECRET_REQUIRED: "permission",
  STORAGE_DECLARED_BUT_DISABLED: "resource",
  KNOWLEDGE_BINDING_REQUIRED: "resource",
  SKILL_REQUIRED: "resource",
  TOOL_REQUIRED: "resource",
  ARTIFACT_TYPE_REQUIRED: "resource",
  EVAL_REQUIRED: "resource",
  OVERLAY_REQUIRED: "resource",
  SERVICE_REQUIRED: "resource",
  WORKFLOW_REQUIRED: "resource",
  PACKAGE_HASH_MISSING: "package",
  MANIFEST_HASH_MISSING: "package",
  PACKAGE_HASH_MISMATCH: "package",
  MANIFEST_HASH_MISMATCH: "package",
  PACKAGE_VERIFICATION_FAILED: "package",
  PACKAGE_HASH_UNVERIFIED: "package",
  MANIFEST_HASH_UNVERIFIED: "package",
  CLOUD_APP_DISABLED: "cloud",
  CLOUD_LICENSE_UNAVAILABLE: "cloud",
  CLOUD_REGISTRATION_REQUIRED: "cloud",
  CLOUD_TOOL_UNAVAILABLE: "cloud",
  CLOUD_POLICY_UNSUPPORTED: "cloud",
  CLOUD_ENTRY_NOT_ENABLED: "cloud",
  CLOUD_SIGNATURE_MISSING: "cloud",
  CLOUD_SIGNATURE_UNVERIFIED: "cloud",
  CLOUD_SIGNATURE_VERIFICATION_FAILED: "cloud",
  TASK_RUNTIME_WORKER_ENTRYPOINT_MISSING: "taskRuntime",
  TASK_RUNTIME_TASKS_MISSING: "taskRuntime",
  TASK_RUNTIME_DIRECT_PROVIDER_ACCESS_UNSUPPORTED: "taskRuntime",
  TASK_RUNTIME_DIRECT_FILESYSTEM_ACCESS_UNSUPPORTED: "taskRuntime",
  WORKBENCH_PRODUCTION_OBJECTS_MISSING: "runtime",
  WORKBENCH_HISTORY_RESTORE_MISSING: "runtime",
  SERVER_HOST_GATE_BLOCKED: "host",
};

const CATEGORY_PRIORITY: PluginReadinessIssueCategory[] = [
  "legacy",
  "package",
  "cloud",
  "runtime",
  "capability",
  "permission",
  "resource",
  "taskRuntime",
  "host",
  "unknown",
];

function normalizeCode(code: string | null | undefined): string | null {
  const normalized = code?.trim();
  return normalized || null;
}

export function classifyPluginReadinessIssueCode(
  code: string | null | undefined,
): PluginReadinessIssueCategory {
  const normalized = normalizeCode(code);
  if (!normalized) {
    return "unknown";
  }
  return ISSUE_CATEGORY_BY_CODE[normalized] ?? "unknown";
}

export function summarizePluginReadinessIssueCategories(
  codes: readonly (string | null | undefined)[] | null | undefined,
): PluginReadinessIssueCategorySummary[] {
  const buckets = new Map<
    PluginReadinessIssueCategory,
    { count: number; codes: Set<string> }
  >();

  for (const code of codes ?? []) {
    const normalized = normalizeCode(code);
    if (!normalized) {
      continue;
    }
    const category = classifyPluginReadinessIssueCode(normalized);
    const bucket =
      buckets.get(category) ?? { count: 0, codes: new Set<string>() };
    bucket.count += 1;
    bucket.codes.add(normalized);
    buckets.set(category, bucket);
  }

  return CATEGORY_PRIORITY.flatMap((category) => {
    const bucket = buckets.get(category);
    if (!bucket) {
      return [];
    }
    return [
      {
        category,
        count: bucket.count,
        codes: Array.from(bucket.codes).sort(),
      },
    ];
  });
}

export function getPrimaryPluginReadinessIssueCategory(
  summaries: readonly PluginReadinessIssueCategorySummary[],
): PluginReadinessIssueCategory | null {
  return summaries[0]?.category ?? null;
}
