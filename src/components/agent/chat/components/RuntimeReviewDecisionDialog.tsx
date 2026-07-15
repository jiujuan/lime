import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type {
  AgentRuntimeReviewDecisionRiskLevel,
  AgentRuntimeReviewDecisionStatus,
  AgentRuntimeReviewDecisionTemplate,
  AgentRuntimeSaveReviewDecisionRequest,
} from "@/lib/api/agentRuntime/evidenceTypes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HarnessVerificationSummarySection } from "./HarnessVerificationSummarySection";

interface RuntimeReviewDecisionDialogProps {
  open: boolean;
  template: AgentRuntimeReviewDecisionTemplate | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (request: AgentRuntimeSaveReviewDecisionRequest) => Promise<void>;
}

interface ReviewDecisionFormState {
  decision_status: AgentRuntimeReviewDecisionStatus;
  decision_summary: string;
  chosen_fix_strategy: string;
  risk_level: AgentRuntimeReviewDecisionRiskLevel;
  risk_tags_text: string;
  human_reviewer: string;
  reviewed_at?: string;
  followup_actions_text: string;
  regression_requirements_text: string;
  notes: string;
}

const DEFAULT_STATUS_OPTIONS: AgentRuntimeReviewDecisionStatus[] = [
  "accepted",
  "deferred",
  "rejected",
  "needs_more_evidence",
  "pending_review",
];

const DEFAULT_RISK_LEVEL_OPTIONS: AgentRuntimeReviewDecisionRiskLevel[] = [
  "low",
  "medium",
  "high",
  "unknown",
];

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30";
const USER_LOCKED_CAPABILITY_GAP = "user_locked_capability_gap";
const CAPABILITY_GAP_LABEL = "capabilityGap=";
const REQUEST_ID_LABEL = "request_id=";
type AgentTranslate = TFunction<"agent", undefined>;

function formatStatusLabel(
  status: AgentRuntimeReviewDecisionStatus,
  t: AgentTranslate,
): string {
  switch (status) {
    case "accepted":
      return t("agentChat.runtimeReviewDecision.status.accepted");
    case "deferred":
      return t("agentChat.runtimeReviewDecision.status.deferred");
    case "rejected":
      return t("agentChat.runtimeReviewDecision.status.rejected");
    case "needs_more_evidence":
      return t("agentChat.runtimeReviewDecision.status.needsMoreEvidence");
    case "pending_review":
      return t("agentChat.runtimeReviewDecision.status.pendingReview");
    default:
      return status;
  }
}

function formatRiskLevelLabel(
  riskLevel: AgentRuntimeReviewDecisionRiskLevel,
  t: AgentTranslate,
): string {
  switch (riskLevel) {
    case "low":
      return t("agentChat.runtimeReviewDecision.risk.low");
    case "medium":
      return t("agentChat.runtimeReviewDecision.risk.medium");
    case "high":
      return t("agentChat.runtimeReviewDecision.risk.high");
    case "unknown":
      return t("agentChat.runtimeReviewDecision.risk.unknown");
    default:
      return riskLevel;
  }
}

function formatPermissionConfirmationStatusLabel(
  status: string | undefined,
  t: AgentTranslate,
): string {
  switch (status?.trim()) {
    case "not_required":
      return t("agentChat.runtimeReviewDecision.permission.status.notRequired");
    case "not_requested":
      return t(
        "agentChat.runtimeReviewDecision.permission.status.notRequested",
      );
    case "requested":
      return t("agentChat.runtimeReviewDecision.permission.status.requested");
    case "resolved":
      return t("agentChat.runtimeReviewDecision.permission.status.resolved");
    case "denied":
      return t("agentChat.runtimeReviewDecision.permission.status.denied");
    default:
      return (
        status?.trim() ||
        t("agentChat.runtimeReviewDecision.permission.status.unexported")
      );
  }
}

function blocksAcceptedReviewDecision(
  permissionStatus?: string,
  confirmationStatus?: string,
): boolean {
  const normalizedPermissionStatus = permissionStatus?.trim();
  const normalizedConfirmationStatus = confirmationStatus?.trim();
  if (normalizedConfirmationStatus === "denied") {
    return true;
  }
  return (
    normalizedPermissionStatus === "requires_confirmation" &&
    normalizedConfirmationStatus !== "resolved"
  );
}

function userLockedCapabilityBlocksAccepted(limitStatus?: string): boolean {
  return limitStatus?.trim() === "user_locked_capability_gap";
}

function createFormState(
  template: AgentRuntimeReviewDecisionTemplate,
): ReviewDecisionFormState {
  return {
    decision_status: template.decision.decision_status,
    decision_summary: template.decision.decision_summary,
    chosen_fix_strategy: template.decision.chosen_fix_strategy,
    risk_level: template.decision.risk_level,
    risk_tags_text: template.decision.risk_tags.join(", "),
    human_reviewer: template.decision.human_reviewer,
    reviewed_at: template.decision.reviewed_at,
    followup_actions_text: template.decision.followup_actions.join("\n"),
    regression_requirements_text:
      template.decision.regression_requirements.join("\n"),
    notes: template.decision.notes,
  };
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function RuntimeReviewDecisionDialog({
  open,
  template,
  saving,
  onOpenChange,
  onSave,
}: RuntimeReviewDecisionDialogProps) {
  const { t } = useTranslation("agent");
  const { t: tCommon } = useTranslation("common");
  const [formState, setFormState] = useState<ReviewDecisionFormState | null>(
    template ? createFormState(template) : null,
  );

  useEffect(() => {
    if (!template) {
      setFormState(null);
      return;
    }

    if (open) {
      setFormState(createFormState(template));
    }
  }, [open, template]);

  const statusOptions = template?.decision_status_options.length
    ? template.decision_status_options
    : DEFAULT_STATUS_OPTIONS;
  const riskLevelOptions = template?.risk_level_options.length
    ? template.risk_level_options
    : DEFAULT_RISK_LEVEL_OPTIONS;
  const permissionConfirmationStatus =
    template?.permission_confirmation_status?.trim();
  const permissionStatus = template?.permission_status?.trim();
  const permissionConfirmationSummary =
    template?.permission_confirmation_summary ||
    template?.permission_confirmation_request_id ||
    t("agentChat.runtimeReviewDecision.permission.summary.unavailable");
  const limitStatus = template?.limit_status?.trim();
  const userLockedCapabilitySummary =
    template?.user_locked_capability_summary ||
    (template?.capability_gap
      ? t("agentChat.runtimeReviewDecision.capability.summary.withGap", {
          capabilityGap: template.capability_gap,
        })
      : t("agentChat.runtimeReviewDecision.capability.summary.unavailable"));
  const userLockedCapabilityBlocksReviewAccepted =
    userLockedCapabilityBlocksAccepted(limitStatus);
  const permissionConfirmationBlocksAccepted = blocksAcceptedReviewDecision(
    permissionStatus,
    permissionConfirmationStatus,
  );
  const acceptanceBlockedByPermissionConfirmation =
    permissionConfirmationBlocksAccepted &&
    formState?.decision_status === "accepted";
  const acceptanceBlockedByUserLockedCapability =
    userLockedCapabilityBlocksReviewAccepted &&
    formState?.decision_status === "accepted";

  const handleSave = async () => {
    if (!template || !formState) {
      return;
    }
    if (
      acceptanceBlockedByPermissionConfirmation ||
      acceptanceBlockedByUserLockedCapability
    ) {
      return;
    }

    await onSave({
      session_id: template.session_id,
      decision_status: formState.decision_status,
      decision_summary: formState.decision_summary,
      chosen_fix_strategy: formState.chosen_fix_strategy,
      risk_level: formState.risk_level,
      risk_tags: splitCommaSeparated(formState.risk_tags_text),
      human_reviewer: formState.human_reviewer,
      reviewed_at: formState.reviewed_at,
      followup_actions: splitLines(formState.followup_actions_text),
      regression_requirements: splitLines(
        formState.regression_requirements_text,
      ),
      notes: formState.notes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-3xl" className="p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>
            {t("agentChat.runtimeReviewDecision.dialog.title")}
          </DialogTitle>
          <DialogDescription className="space-y-1 text-xs leading-5">
            <span className="block">
              {t("agentChat.runtimeReviewDecision.dialog.description")}
            </span>
            {template ? (
              <span className="block font-mono text-[11px] text-muted-foreground">
                {template.review_relative_root}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {template && formState ? (
          <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
            {template.verification_summary ? (
              <HarnessVerificationSummarySection
                summary={template.verification_summary}
              />
            ) : null}

            {userLockedCapabilityBlocksReviewAccepted ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold">
                    {t("agentChat.runtimeReviewDecision.capability.title")}
                  </span>
                  <span className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-700">
                    {USER_LOCKED_CAPABILITY_GAP}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5">
                  {userLockedCapabilitySummary}
                </p>
                {template.capability_gap ? (
                  <p className="mt-1 font-mono text-[11px] opacity-80">
                    {CAPABILITY_GAP_LABEL}
                    {template.capability_gap}
                  </p>
                ) : null}
                <p className="mt-2 text-xs font-medium">
                  {t("agentChat.runtimeReviewDecision.capability.resolveHint")}
                </p>
              </div>
            ) : null}

            {permissionConfirmationStatus ? (
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  permissionConfirmationBlocksAccepted
                    ? "border-rose-200 bg-rose-50 text-rose-950"
                    : "border-slate-200 bg-slate-50 text-slate-800"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold">
                    {t("agentChat.runtimeReviewDecision.permission.title")}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      permissionConfirmationBlocksAccepted
                        ? "border-rose-200 bg-white text-rose-700"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {formatPermissionConfirmationStatusLabel(
                      permissionConfirmationStatus,
                      t,
                    )}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5">
                  {permissionConfirmationSummary}
                </p>
                {template.permission_confirmation_request_id ? (
                  <p className="mt-1 font-mono text-[11px] opacity-80">
                    {REQUEST_ID_LABEL}
                    {template.permission_confirmation_request_id}
                  </p>
                ) : null}
                {permissionConfirmationBlocksAccepted ? (
                  <p className="mt-2 text-xs font-medium">
                    {t(
                      "agentChat.runtimeReviewDecision.permission.deliveryBlocked",
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="review-decision-status"
                  className="text-xs font-medium text-foreground"
                >
                  {t("agentChat.runtimeReviewDecision.field.decisionStatus")}
                </label>
                <select
                  id="review-decision-status"
                  aria-label={t(
                    "agentChat.runtimeReviewDecision.field.decisionStatus",
                  )}
                  className={selectClassName}
                  value={formState.decision_status}
                  onChange={(event) =>
                    setFormState((current) =>
                      current
                        ? {
                            ...current,
                            decision_status: event.target
                              .value as AgentRuntimeReviewDecisionStatus,
                          }
                        : current,
                    )
                  }
                >
                  {statusOptions.map((status) => (
                    <option
                      key={status}
                      value={status}
                      disabled={
                        (permissionConfirmationBlocksAccepted ||
                          userLockedCapabilityBlocksReviewAccepted) &&
                        status === "accepted"
                      }
                    >
                      {formatStatusLabel(status, t)}
                    </option>
                  ))}
                </select>
                {permissionConfirmationBlocksAccepted ? (
                  <p className="text-xs leading-5 text-rose-700">
                    {t(
                      "agentChat.runtimeReviewDecision.warning.permissionBlocksAccepted",
                    )}
                  </p>
                ) : null}
                {userLockedCapabilityBlocksReviewAccepted ? (
                  <p className="text-xs leading-5 text-rose-700">
                    {t(
                      "agentChat.runtimeReviewDecision.warning.capabilityBlocksAccepted",
                    )}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="review-risk-level"
                  className="text-xs font-medium text-foreground"
                >
                  {t("agentChat.runtimeReviewDecision.field.riskLevel")}
                </label>
                <select
                  id="review-risk-level"
                  aria-label={t(
                    "agentChat.runtimeReviewDecision.field.riskLevel",
                  )}
                  className={selectClassName}
                  value={formState.risk_level}
                  onChange={(event) =>
                    setFormState((current) =>
                      current
                        ? {
                            ...current,
                            risk_level: event.target
                              .value as AgentRuntimeReviewDecisionRiskLevel,
                          }
                        : current,
                    )
                  }
                >
                  {riskLevelOptions.map((riskLevel) => (
                    <option key={riskLevel} value={riskLevel}>
                      {formatRiskLevelLabel(riskLevel, t)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="review-human-reviewer"
                  className="text-xs font-medium text-foreground"
                >
                  {t("agentChat.runtimeReviewDecision.field.reviewer")}
                </label>
                <Input
                  id="review-human-reviewer"
                  aria-label={t(
                    "agentChat.runtimeReviewDecision.field.reviewer",
                  )}
                  value={formState.human_reviewer}
                  onChange={(event) =>
                    setFormState((current) =>
                      current
                        ? {
                            ...current,
                            human_reviewer: event.target.value,
                          }
                        : current,
                    )
                  }
                  placeholder={t(
                    "agentChat.runtimeReviewDecision.placeholder.reviewer",
                  )}
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="review-risk-tags"
                  className="text-xs font-medium text-foreground"
                >
                  {t("agentChat.runtimeReviewDecision.field.riskTags")}
                </label>
                <Input
                  id="review-risk-tags"
                  aria-label={t(
                    "agentChat.runtimeReviewDecision.field.riskTags",
                  )}
                  value={formState.risk_tags_text}
                  onChange={(event) =>
                    setFormState((current) =>
                      current
                        ? {
                            ...current,
                            risk_tags_text: event.target.value,
                          }
                        : current,
                    )
                  }
                  placeholder={t(
                    "agentChat.runtimeReviewDecision.placeholder.riskTags",
                  )}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="review-decision-summary"
                className="text-xs font-medium text-foreground"
              >
                {t("agentChat.runtimeReviewDecision.field.decisionSummary")}
              </label>
              <Textarea
                id="review-decision-summary"
                aria-label={t(
                  "agentChat.runtimeReviewDecision.field.decisionSummary",
                )}
                value={formState.decision_summary}
                onChange={(event) =>
                  setFormState((current) =>
                    current
                      ? {
                          ...current,
                          decision_summary: event.target.value,
                        }
                      : current,
                  )
                }
                rows={4}
                placeholder={t(
                  "agentChat.runtimeReviewDecision.placeholder.decisionSummary",
                )}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="review-fix-strategy"
                className="text-xs font-medium text-foreground"
              >
                {t("agentChat.runtimeReviewDecision.field.fixStrategy")}
              </label>
              <Textarea
                id="review-fix-strategy"
                aria-label={t(
                  "agentChat.runtimeReviewDecision.field.fixStrategy",
                )}
                value={formState.chosen_fix_strategy}
                onChange={(event) =>
                  setFormState((current) =>
                    current
                      ? {
                          ...current,
                          chosen_fix_strategy: event.target.value,
                        }
                      : current,
                  )
                }
                rows={4}
                placeholder={t(
                  "agentChat.runtimeReviewDecision.placeholder.fixStrategy",
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="review-regressions"
                  className="text-xs font-medium text-foreground"
                >
                  {t(
                    "agentChat.runtimeReviewDecision.field.regressionRequirements",
                  )}
                </label>
                <Textarea
                  id="review-regressions"
                  aria-label={t(
                    "agentChat.runtimeReviewDecision.field.regressionRequirements",
                  )}
                  value={formState.regression_requirements_text}
                  onChange={(event) =>
                    setFormState((current) =>
                      current
                        ? {
                            ...current,
                            regression_requirements_text: event.target.value,
                          }
                        : current,
                    )
                  }
                  rows={5}
                  placeholder={t(
                    "agentChat.runtimeReviewDecision.placeholder.regressionRequirements",
                  )}
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="review-followups"
                  className="text-xs font-medium text-foreground"
                >
                  {t("agentChat.runtimeReviewDecision.field.followupActions")}
                </label>
                <Textarea
                  id="review-followups"
                  aria-label={t(
                    "agentChat.runtimeReviewDecision.field.followupActions",
                  )}
                  value={formState.followup_actions_text}
                  onChange={(event) =>
                    setFormState((current) =>
                      current
                        ? {
                            ...current,
                            followup_actions_text: event.target.value,
                          }
                        : current,
                    )
                  }
                  rows={5}
                  placeholder={t(
                    "agentChat.runtimeReviewDecision.placeholder.followupActions",
                  )}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="review-notes"
                className="text-xs font-medium text-foreground"
              >
                {t("agentChat.runtimeReviewDecision.field.notes")}
              </label>
              <Textarea
                id="review-notes"
                aria-label={t("agentChat.runtimeReviewDecision.field.notes")}
                value={formState.notes}
                onChange={(event) =>
                  setFormState((current) =>
                    current
                      ? {
                          ...current,
                          notes: event.target.value,
                        }
                      : current,
                  )
                }
                rows={4}
                placeholder={t(
                  "agentChat.runtimeReviewDecision.placeholder.notes",
                )}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter className="border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {tCommon("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={
              !template ||
              !formState ||
              saving ||
              acceptanceBlockedByPermissionConfirmation ||
              acceptanceBlockedByUserLockedCapability
            }
          >
            {saving
              ? t("agentChat.runtimeReviewDecision.action.saving")
              : t("agentChat.runtimeReviewDecision.action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
