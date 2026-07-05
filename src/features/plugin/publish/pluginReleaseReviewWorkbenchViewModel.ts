import type {
  PluginReleaseSubmission,
  PluginReleaseSubmissionStatus,
} from "@/lib/api/oemCloudPluginPublish";

export type PluginReleaseReviewStatusFilter =
  | "all"
  | PluginReleaseSubmissionStatus;

export const PLUGIN_RELEASE_REVIEW_STATUS_FILTERS: PluginReleaseReviewStatusFilter[] =
  ["pending_review", "blocked", "rejected", "published", "all"];

export interface PluginReleaseReviewCounts {
  all: number;
  pending_review: number;
  blocked: number;
  rejected: number;
  published: number;
}

export interface PluginReleaseSubmissionSummary {
  displayName: string;
  targetTenantIds: string[];
  blockerCount: number;
  warningCount: number;
  targetImpactCount: number;
  signatureStatus: string;
  registrationRequired: boolean;
  registrationHint?: string;
}

function normalizeTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

export function buildPluginReleaseReviewCounts(
  submissions: PluginReleaseSubmission[],
): PluginReleaseReviewCounts {
  const counts: PluginReleaseReviewCounts = {
    all: submissions.length,
    pending_review: 0,
    blocked: 0,
    rejected: 0,
    published: 0,
  };
  for (const submission of submissions) {
    counts[submission.status] += 1;
  }
  return counts;
}

export function filterPluginReleaseReviewSubmissions(
  submissions: PluginReleaseSubmission[],
  statusFilter: PluginReleaseReviewStatusFilter,
): PluginReleaseSubmission[] {
  const filtered =
    statusFilter === "all"
      ? submissions
      : submissions.filter((submission) => submission.status === statusFilter);
  return [...filtered].sort(
    (left, right) =>
      normalizeTimestamp(right.createdAt) - normalizeTimestamp(left.createdAt),
  );
}

export function summarizePluginReleaseSubmission(
  submission: PluginReleaseSubmission,
): PluginReleaseSubmissionSummary {
  const targetTenantIds = submission.payload.targets
    .map((target) => target.tenantId)
    .filter(Boolean);
  const firstTarget = submission.payload.targets[0];

  return {
    displayName:
      normalizeText(submission.payload.catalog.displayName) ??
      submission.pluginName,
    targetTenantIds,
    blockerCount: submission.preflight?.blockers.length ?? 0,
    warningCount: submission.preflight?.warnings?.length ?? 0,
    targetImpactCount: submission.preflight?.targetImpact?.length ?? 0,
    signatureStatus:
      submission.preflight?.signatureVerification?.status ?? "unknown",
    registrationRequired: firstTarget?.registrationRequired === true,
    registrationHint: normalizeText(firstTarget?.registrationHint),
  };
}

export function isPluginReleaseReviewActionAvailable(
  submission: PluginReleaseSubmission | null,
): boolean {
  return submission?.status === "pending_review";
}
