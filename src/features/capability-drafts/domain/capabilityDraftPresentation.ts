import type {
  CapabilityDraftRecord,
  CapabilityDraftStatus,
  CapabilityDraftVerificationReport,
} from "@/lib/api/capabilityDrafts";

export type CapabilityDraftTone = "amber" | "emerald" | "rose" | "slate";

export interface CapabilityDraftStatusPresentation {
  label: string;
  description: string;
  tone: CapabilityDraftTone;
}

export interface CapabilityDraftPresentationCopy {
  failedChecksPassed?: string;
  filesEmpty?: string;
  formatFilesWithMore?: (shown: string, totalCount: number) => string;
  formatRegistrationDirectory?: (directory: string) => string;
  permissionEmpty?: string;
  registrationEmpty?: string;
  registrationFallback?: string;
  separator?: string;
  status?: Partial<
    Record<CapabilityDraftStatus, { label?: string; description?: string }>
  >;
  verificationEmpty?: string;
}

const STATUS_PRESENTATION: Record<
  CapabilityDraftStatus,
  CapabilityDraftStatusPresentation
> = {
  unverified: {
    label: "未验证",
    description: "只能查看和继续修复，不能运行、注册或接入自动化。",
    tone: "amber",
  },
  failed_self_check: {
    label: "自检未通过",
    description: "需要先修复草案内容，再进入验证门禁。",
    tone: "rose",
  },
  verification_failed: {
    label: "验证未通过",
    description:
      "verification gate 发现结构、权限或 contract 问题，需要修复后重试。",
    tone: "rose",
  },
  verified_pending_registration: {
    label: "验证通过，待注册",
    description:
      "最小验证已通过，可以注册到当前 Workspace，但仍不会运行或接入自动化。",
    tone: "slate",
  },
  registered: {
    label: "已注册",
    description:
      "已写入当前 Workspace 的本地 Skill 目录；运行与自动化仍需后续 runtime gate。",
    tone: "emerald",
  },
};

export function getCapabilityDraftStatusPresentation(
  status: CapabilityDraftStatus,
  copy: CapabilityDraftPresentationCopy = {},
): CapabilityDraftStatusPresentation {
  const fallback =
    STATUS_PRESENTATION[status] ?? STATUS_PRESENTATION.unverified;
  const statusCopy = copy.status?.[status];
  return {
    ...fallback,
    description: statusCopy?.description ?? fallback.description,
    label: statusCopy?.label ?? fallback.label,
  };
}

export function canExecuteCapabilityDraft(
  draft: Pick<CapabilityDraftRecord, "verificationStatus">,
): boolean {
  void draft;
  return false;
}

export function canRegisterCapabilityDraft(
  draft: Pick<CapabilityDraftRecord, "verificationStatus">,
): boolean {
  return draft.verificationStatus === "verified_pending_registration";
}

export function canVerifyCapabilityDraft(
  draft: Pick<CapabilityDraftRecord, "verificationStatus">,
): boolean {
  return draft.verificationStatus !== "registered";
}

export function summarizeCapabilityDraftPermissions(
  draft: Pick<CapabilityDraftRecord, "permissionSummary">,
  copy: CapabilityDraftPresentationCopy = {},
): string {
  if (draft.permissionSummary.length === 0) {
    return (
      copy.permissionEmpty ?? "未声明额外权限，默认停留在只读发现与草案内写入。"
    );
  }
  return draft.permissionSummary.slice(0, 3).join(copy.separator ?? " / ");
}

export function summarizeCapabilityDraftFiles(
  draft: Pick<CapabilityDraftRecord, "generatedFiles">,
  copy: CapabilityDraftPresentationCopy = {},
): string {
  if (draft.generatedFiles.length === 0) {
    return copy.filesEmpty ?? "暂无文件清单";
  }
  const shown = draft.generatedFiles
    .slice(0, 3)
    .map((file) => file.relativePath)
    .join(copy.separator ?? " / ");
  return draft.generatedFiles.length > 3
    ? (copy.formatFilesWithMore?.(shown, draft.generatedFiles.length) ??
        `${shown} 等 ${draft.generatedFiles.length} 个文件`)
    : shown;
}

export function summarizeCapabilityDraftVerification(
  draft: Pick<CapabilityDraftRecord, "lastVerification">,
  copy: CapabilityDraftPresentationCopy = {},
): string {
  if (!draft.lastVerification) {
    return copy.verificationEmpty ?? "还没有运行 verification gate。";
  }
  return draft.lastVerification.summary;
}

export function summarizeCapabilityDraftRegistration(
  draft: Pick<CapabilityDraftRecord, "lastRegistration">,
  copy: CapabilityDraftPresentationCopy = {},
): string {
  if (!draft.lastRegistration) {
    return copy.registrationEmpty ?? "还没有注册到 Workspace。";
  }
  const directory = draft.lastRegistration.skillDirectory.trim();
  return directory
    ? (copy.formatRegistrationDirectory?.(directory) ??
        `已注册目录：${directory}`)
    : (copy.registrationFallback ?? "已注册到当前 Workspace。");
}

export function summarizeCapabilityDraftFailedChecks(
  report: Pick<CapabilityDraftVerificationReport, "checks">,
  copy: CapabilityDraftPresentationCopy = {},
): string {
  const failedChecks = report.checks.filter(
    (check) => check.status === "failed",
  );
  if (failedChecks.length === 0) {
    return copy.failedChecksPassed ?? "所有检查均已通过。";
  }
  return failedChecks
    .slice(0, 3)
    .map((check) => check.label || check.id)
    .join(copy.separator ?? " / ");
}
