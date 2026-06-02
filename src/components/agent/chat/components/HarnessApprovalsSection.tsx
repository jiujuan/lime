import { CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActionRequired } from "../types";
import type { HarnessSessionState } from "../utils/harnessState";
import type { TranslationFunction } from "./HarnessActivityTypes";
import { InteractiveText, PathTextLink } from "./HarnessStatusPanelPrimitives";
import {
  HarnessStatusSection as Section,
  type HarnessSectionKey,
} from "./HarnessStatusSectionFrame";
import { agentText } from "./harnessPanelText";
import {
  describeApproval,
  pickCommandFromArguments,
  pickPathFromArguments,
  resolveApprovalActionLabelKey,
  resolveApprovalRiskKind,
  resolveApprovalRiskLabelKey,
} from "./harnessStatusPanelViewModel";

interface HarnessApprovalsSectionProps {
  pendingApprovals: HarnessSessionState["pendingApprovals"];
  registerSectionRef: (
    key: HarnessSectionKey,
    node: HTMLElement | null,
  ) => void;
  t: TranslationFunction;
  handleOpenExternalLink: (url: string) => void | Promise<void>;
  handleOpenPathValue: (path: string) => void | Promise<void>;
  handleApprovalResponse: (
    item: ActionRequired,
    accepted: boolean,
  ) => void | Promise<void>;
  submittedActionIds: ReadonlySet<string>;
  canRespondToActions: boolean;
}

export function HarnessApprovalsSection({
  pendingApprovals,
  registerSectionRef,
  t,
  handleOpenExternalLink,
  handleOpenPathValue,
  handleApprovalResponse,
  submittedActionIds,
  canRespondToActions,
}: HarnessApprovalsSectionProps) {
  if (pendingApprovals.length === 0) {
    return null;
  }

  return (
    <Section
      sectionKey="approvals"
      title={agentText("agentChat.harness.generated.e862f8292d", "待处理审批")}
      badge={`${pendingApprovals.length} 条`}
      registerRef={registerSectionRef}
    >
      <div className="space-y-3">
        {pendingApprovals.map((item) => {
          const approvalPath = pickPathFromArguments(item.arguments);
          const approvalCommand = pickCommandFromArguments(item.arguments);
          const approvalSummary = describeApproval(item);
          const riskKind = resolveApprovalRiskKind(item);
          const approvalTarget =
            approvalSummary || item.toolName || item.requestId;
          const canInlineRespond =
            item.actionType === "tool_confirmation" && canRespondToActions;
          const approvalSubmitting =
            submittedActionIds.has(item.requestId) ||
            item.status === "submitted";
          const approvalOutcomeHint = (
            <div
              className="rounded-lg border border-amber-100 bg-white/70 px-3 py-2 text-xs leading-5 text-amber-800"
              data-testid="harness-approval-outcome-hint"
            >
              {String(t("agentChat.harness.approvals.outcomeHint" as never))}
            </div>
          );

          return (
            <div
              key={item.requestId}
              className="rounded-xl border border-amber-200 bg-amber-50/80 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-950">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <InteractiveText
                      text={
                        item.prompt ||
                        String(
                          t("agentChat.harness.approvals.waiting" as never),
                        )
                      }
                      className="text-sm"
                      onOpenUrl={handleOpenExternalLink}
                    />
                  </div>
                </div>
                <Badge variant="secondary">
                  {String(t(resolveApprovalActionLabelKey(item) as never))}
                </Badge>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div className="rounded-lg border border-amber-100 bg-white/70 px-3 py-2">
                  <div className="text-[11px] font-medium text-amber-950">
                    {String(
                      t("agentChat.harness.approvals.impactScope" as never),
                    )}
                  </div>
                  {approvalPath ? (
                    <PathTextLink
                      path={approvalPath}
                      className="mt-1 text-xs"
                      onOpenPath={handleOpenPathValue}
                    />
                  ) : approvalCommand ? (
                    <InteractiveText
                      text={approvalCommand}
                      mono={true}
                      className="mt-1 text-xs text-amber-900"
                      onOpenUrl={handleOpenExternalLink}
                    />
                  ) : (
                    <div className="mt-1 text-xs text-amber-800">
                      {String(
                        t(
                          "agentChat.harness.approvals.scope.currentRun" as never,
                        ),
                      )}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-amber-100 bg-white/70 px-3 py-2">
                  <div className="text-[11px] font-medium text-amber-950">
                    {String(
                      t("agentChat.harness.approvals.riskTitle" as never),
                    )}
                  </div>
                  <div className="mt-1 text-xs text-amber-800">
                    {String(t(resolveApprovalRiskLabelKey(riskKind) as never))}
                  </div>
                </div>
              </div>
              {approvalSummary ? (
                <div className="mt-3 rounded-lg bg-amber-100/60 px-3 py-2">
                  <div className="text-[11px] font-medium text-amber-950">
                    {String(
                      t("agentChat.harness.approvals.argumentSummary" as never),
                    )}
                  </div>
                  <InteractiveText
                    text={approvalSummary}
                    className="mt-1 text-xs text-amber-800"
                    onOpenUrl={handleOpenExternalLink}
                  />
                </div>
              ) : null}
              <div className="mt-2 text-xs text-amber-700">
                {String(
                  t(
                    "agentChat.harness.approvals.requestRef" as never,
                    { id: item.requestId } as never,
                  ),
                )}
              </div>
              {canInlineRespond ? (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={approvalSubmitting}
                      aria-label={String(
                        t(
                          "agentChat.harness.approvals.approveAria" as never,
                          { target: approvalTarget } as never,
                        ),
                      )}
                      onClick={() => handleApprovalResponse(item, true)}
                    >
                      {approvalSubmitting ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-1 h-4 w-4" />
                      )}
                      {String(
                        t(
                          approvalSubmitting
                            ? ("agentChat.harness.approvals.submitting" as never)
                            : ("agentChat.harness.approvals.approve" as never),
                        ),
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={approvalSubmitting}
                      aria-label={String(
                        t(
                          "agentChat.harness.approvals.rejectAria" as never,
                          { target: approvalTarget } as never,
                        ),
                      )}
                      onClick={() => handleApprovalResponse(item, false)}
                    >
                      <XCircle className="mr-1 h-4 w-4" />
                      {String(t("agentChat.harness.approvals.reject" as never))}
                    </Button>
                  </div>
                  {approvalOutcomeHint}
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <div className="rounded-lg border border-amber-100 bg-white/70 px-3 py-2 text-xs text-amber-800">
                    {String(
                      t("agentChat.harness.approvals.responseHint" as never),
                    )}
                  </div>
                  {approvalOutcomeHint}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
