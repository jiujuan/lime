import type {
  AgentRuntimeArtifactValidatorVerificationSummary,
  AgentRuntimeBrowserVerificationSummary,
  AgentRuntimeEvidenceVerificationOutcome,
  AgentRuntimeEvidenceVerificationSummary,
  AgentRuntimeGuiSmokeVerificationSummary,
} from "@/lib/api/agentRuntime";
import type { TFunction } from "i18next";
import { formatNumber } from "@/i18n/format";

export type HarnessVerificationBadgeVariant =
  | "secondary"
  | "destructive"
  | "outline";

export interface HarnessVerificationOutcomeBadgePresentation {
  label: string;
  variant: HarnessVerificationBadgeVariant;
}

export interface HarnessEvidenceVerificationCardPresentation {
  key: "artifact_validator" | "browser_verification" | "gui_smoke";
  title: string;
  badge: HarnessVerificationOutcomeBadgePresentation;
  description: string;
}

type AgentTranslate = TFunction<"agent", undefined>;

export interface HarnessVerificationPresentationOptions {
  locale: string;
  t: AgentTranslate;
}

export function resolveHarnessVerificationOutcomeBadgePresentation(
  outcome: AgentRuntimeEvidenceVerificationOutcome | undefined,
  t: AgentTranslate,
): HarnessVerificationOutcomeBadgePresentation {
  switch (outcome) {
    case "success":
      return {
        label: t("agentChat.harnessVerification.badge.success"),
        variant: "secondary",
      };
    case "blocking_failure":
      return {
        label: t("agentChat.harnessVerification.badge.blockingFailure"),
        variant: "destructive",
      };
    case "advisory_failure":
      return {
        label: t("agentChat.harnessVerification.badge.advisoryFailure"),
        variant: "outline",
      };
    case "recovered":
      return {
        label: t("agentChat.harnessVerification.badge.recovered"),
        variant: "outline",
      };
    default:
      return {
        label: t("agentChat.harnessVerification.badge.unknown"),
        variant: "outline",
      };
  }
}

export function describeHarnessArtifactValidatorVerification(
  summary: AgentRuntimeArtifactValidatorVerificationSummary | undefined,
  options: HarnessVerificationPresentationOptions,
): string {
  if (!summary?.applicable) {
    return options.t("agentChat.harnessVerification.artifact.empty");
  }

  return options.t("agentChat.harnessVerification.artifact.description", {
    fallbackCount: formatNumber(summary.fallback_used_count, {
      locale: options.locale,
    }),
    issueCount: formatNumber(summary.issue_count, {
      locale: options.locale,
    }),
    recordCount: formatNumber(summary.record_count, {
      locale: options.locale,
    }),
    repairedCount: formatNumber(summary.repaired_count, {
      locale: options.locale,
    }),
  });
}

export function describeHarnessBrowserVerification(
  summary: AgentRuntimeBrowserVerificationSummary | undefined,
  options: HarnessVerificationPresentationOptions,
): string {
  if (!summary) {
    return options.t("agentChat.harnessVerification.browser.empty");
  }

  return options.t("agentChat.harnessVerification.browser.description", {
    failureCount: formatNumber(summary.failure_count, {
      locale: options.locale,
    }),
    recordCount: formatNumber(summary.record_count, {
      locale: options.locale,
    }),
    successCount: formatNumber(summary.success_count, {
      locale: options.locale,
    }),
    unknownCount: formatNumber(summary.unknown_count, {
      locale: options.locale,
    }),
  });
}

export function describeHarnessGuiSmokeVerification(
  summary: AgentRuntimeGuiSmokeVerificationSummary | undefined,
  options: HarnessVerificationPresentationOptions,
): string {
  if (!summary) {
    return options.t("agentChat.harnessVerification.guiSmoke.empty");
  }

  const status =
    summary.status?.trim() ||
    options.t("agentChat.harnessVerification.guiSmoke.unknown");
  const exitCode =
    typeof summary.exit_code === "number"
      ? formatNumber(summary.exit_code, { locale: options.locale })
      : options.t("agentChat.harnessVerification.guiSmoke.unknown");
  const result = summary.passed
    ? options.t("agentChat.harnessVerification.guiSmoke.passed")
    : options.t("agentChat.harnessVerification.guiSmoke.failed");

  return options.t("agentChat.harnessVerification.guiSmoke.description", {
    exitCode,
    result,
    status,
  });
}

export function buildHarnessEvidenceVerificationCardPresentations(
  summary: AgentRuntimeEvidenceVerificationSummary | undefined,
  options: HarnessVerificationPresentationOptions,
): HarnessEvidenceVerificationCardPresentation[] {
  if (!summary) {
    return [];
  }

  const cards: HarnessEvidenceVerificationCardPresentation[] = [];

  if (summary.artifact_validator) {
    cards.push({
      key: "artifact_validator",
      title: options.t("agentChat.harnessVerification.artifact.title"),
      badge: resolveHarnessVerificationOutcomeBadgePresentation(
        summary.artifact_validator.outcome,
        options.t,
      ),
      description: describeHarnessArtifactValidatorVerification(
        summary.artifact_validator,
        options,
      ),
    });
  }

  if (summary.browser_verification) {
    cards.push({
      key: "browser_verification",
      title: options.t("agentChat.harnessVerification.browser.title"),
      badge: resolveHarnessVerificationOutcomeBadgePresentation(
        summary.browser_verification.outcome,
        options.t,
      ),
      description: describeHarnessBrowserVerification(
        summary.browser_verification,
        options,
      ),
    });
  }

  if (summary.gui_smoke) {
    cards.push({
      key: "gui_smoke",
      title: options.t("agentChat.harnessVerification.guiSmoke.title"),
      badge: resolveHarnessVerificationOutcomeBadgePresentation(
        summary.gui_smoke.outcome,
        options.t,
      ),
      description: describeHarnessGuiSmokeVerification(
        summary.gui_smoke,
        options,
      ),
    });
  }

  return cards;
}
