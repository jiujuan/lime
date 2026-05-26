import { useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AgentThreadFileCheckpointDialog } from "../components/AgentThreadFileCheckpointDialog";
import { AgentRuntimeStrip } from "../components/AgentRuntimeStrip";
import { HarnessStatusPanel } from "../components/HarnessStatusPanel";
import { TeamMemoryShadowCard } from "../components/TeamMemoryShadowCard";
import type { TeamMemorySnapshot } from "@/lib/teamMemorySync";

type HarnessPanelBaseProps = Pick<
  ComponentProps<typeof HarnessStatusPanel>,
  | "harnessState"
  | "environment"
  | "childSubagentSessions"
  | "selectedTeamLabel"
  | "selectedTeamSummary"
  | "selectedTeamRoles"
  | "threadRead"
  | "turns"
  | "threadItems"
  | "currentTurnId"
  | "pendingActions"
  | "submittedActionsInFlight"
  | "onRespondToAction"
  | "queuedTurns"
  | "canInterrupt"
  | "onInterruptCurrentTurn"
  | "onResumeThread"
  | "onReplayPendingRequest"
  | "onPromoteQueuedTurn"
  | "onObjectiveChanged"
  | "onOpenMemoryWorkbench"
  | "messages"
  | "teamMemorySnapshot"
  | "diagnosticRuntimeContext"
  | "toolInventory"
  | "toolInventoryLoading"
  | "toolInventoryError"
  | "onRefreshToolInventory"
  | "onOpenSubagentSession"
  | "onLoadFilePreview"
  | "onOpenFile"
>;

interface GeneralWorkbenchHarnessDialogSectionProps extends HarnessPanelBaseProps {
  enabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamMemorySnapshot?: TeamMemorySnapshot | null;
}

export function GeneralWorkbenchHarnessDialogSection({
  enabled,
  open,
  onOpenChange,
  teamMemorySnapshot = null,
  ...panelBaseProps
}: GeneralWorkbenchHarnessDialogSectionProps) {
  const [fileCheckpointDialogOpen, setFileCheckpointDialogOpen] =
    useState(false);
  const diagnosticSessionId =
    panelBaseProps.diagnosticRuntimeContext?.sessionId?.trim() || "";
  const diagnosticWorkingDir =
    panelBaseProps.diagnosticRuntimeContext?.workingDir?.trim() || "";
  const fileCheckpointSummary =
    panelBaseProps.threadRead?.file_checkpoint_summary || null;
  const latestFileCheckpoint =
    fileCheckpointSummary?.latest_checkpoint || null;

  if (!enabled) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          maxWidth="max-w-7xl"
          className="lime-workbench-theme-scope lime-workbench-surface-scope flex h-[90vh] max-h-[90vh] flex-col overflow-hidden border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-0 text-[color:var(--lime-text)]"
          draggable={true}
          dragHandleSelector='[data-harness-drag-handle="true"]'
        >
          <HarnessStatusPanel
            {...panelBaseProps}
            layout="dialog"
            teamMemorySnapshot={teamMemorySnapshot}
            onOpenFileCheckpoints={
              diagnosticSessionId
                ? () => setFileCheckpointDialogOpen(true)
                : undefined
            }
            leadContent={
              teamMemorySnapshot ? (
                <TeamMemoryShadowCard snapshot={teamMemorySnapshot} />
              ) : undefined
            }
          />
        </DialogContent>
      </Dialog>

      {diagnosticSessionId ? (
        <AgentThreadFileCheckpointDialog
          open={fileCheckpointDialogOpen}
          onOpenChange={setFileCheckpointDialogOpen}
          sessionId={diagnosticSessionId}
          workingDir={diagnosticWorkingDir || null}
          defaultCheckpointId={latestFileCheckpoint?.checkpoint_id || null}
        />
      ) : null}
    </>
  );
}

interface GeneralWorkbenchDialogSectionProps extends HarnessPanelBaseProps {
  enabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTheme: ComponentProps<typeof AgentRuntimeStrip>["activeTheme"];
  toolPreferences: ComponentProps<typeof AgentRuntimeStrip>["toolPreferences"];
  runtimeToolAvailability: ComponentProps<
    typeof AgentRuntimeStrip
  >["runtimeToolAvailability"];
  isSending: ComponentProps<typeof AgentRuntimeStrip>["isSending"];
  executionRuntime: ComponentProps<
    typeof AgentRuntimeStrip
  >["executionRuntime"];
  isExecutionRuntimeActive: ComponentProps<
    typeof AgentRuntimeStrip
  >["isExecutionRuntimeActive"];
  runtimeStatusTitle: ComponentProps<
    typeof AgentRuntimeStrip
  >["runtimeStatusTitle"];
  selectedTeamRoleCount: ComponentProps<
    typeof AgentRuntimeStrip
  >["selectedTeamRoleCount"];
  teamMemorySnapshot?: TeamMemorySnapshot | null;
}

export function GeneralWorkbenchDialogSection({
  enabled,
  open,
  onOpenChange,
  activeTheme,
  toolPreferences,
  runtimeToolAvailability,
  isSending,
  executionRuntime,
  isExecutionRuntimeActive,
  runtimeStatusTitle,
  selectedTeamRoleCount,
  teamMemorySnapshot = null,
  ...panelBaseProps
}: GeneralWorkbenchDialogSectionProps) {
  const { t } = useTranslation("agent");
  const [fileCheckpointDialogOpen, setFileCheckpointDialogOpen] =
    useState(false);
  const diagnosticSessionId =
    panelBaseProps.diagnosticRuntimeContext?.sessionId?.trim() || "";
  const diagnosticWorkingDir =
    panelBaseProps.diagnosticRuntimeContext?.workingDir?.trim() || "";
  const fileCheckpointSummary =
    panelBaseProps.threadRead?.file_checkpoint_summary || null;
  const latestFileCheckpoint =
    fileCheckpointSummary?.latest_checkpoint || null;

  if (!enabled) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          maxWidth="max-w-6xl"
          className="lime-workbench-theme-scope lime-workbench-surface-scope flex h-[90vh] max-h-[90vh] flex-col overflow-hidden border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-0 text-[color:var(--lime-text)]"
          draggable={true}
          dragHandleSelector='[data-harness-drag-handle="true"]'
        >
          <HarnessStatusPanel
            {...panelBaseProps}
            layout="dialog"
            teamMemorySnapshot={teamMemorySnapshot}
            onOpenFileCheckpoints={
              diagnosticSessionId
                ? () => setFileCheckpointDialogOpen(true)
                : undefined
            }
            title={t("agentChat.workspaceHarnessDialog.title")}
            description={t("agentChat.workspaceHarnessDialog.description")}
            toggleLabel={t("agentChat.workspaceHarnessDialog.toggleLabel")}
            leadContent={
              <div className="space-y-3">
                <AgentRuntimeStrip
                  activeTheme={activeTheme}
                  toolPreferences={toolPreferences}
                  runtimeToolAvailability={runtimeToolAvailability}
                  harnessState={panelBaseProps.harnessState}
                  childSubagentSessions={panelBaseProps.childSubagentSessions}
                  variant="embedded"
                  isSending={isSending}
                  executionRuntime={executionRuntime}
                  isExecutionRuntimeActive={isExecutionRuntimeActive}
                  runtimeStatusTitle={runtimeStatusTitle}
                  selectedTeamLabel={panelBaseProps.selectedTeamLabel}
                  selectedTeamSummary={panelBaseProps.selectedTeamSummary}
                  selectedTeamRoleCount={selectedTeamRoleCount}
                  fileCheckpointSummary={fileCheckpointSummary}
                  onOpenFileCheckpoints={
                    diagnosticSessionId
                      ? () => setFileCheckpointDialogOpen(true)
                      : undefined
                  }
                />
                {teamMemorySnapshot ? (
                  <TeamMemoryShadowCard snapshot={teamMemorySnapshot} />
                ) : null}
              </div>
            }
          />
        </DialogContent>
      </Dialog>

      {diagnosticSessionId ? (
        <AgentThreadFileCheckpointDialog
          open={fileCheckpointDialogOpen}
          onOpenChange={setFileCheckpointDialogOpen}
          sessionId={diagnosticSessionId}
          workingDir={diagnosticWorkingDir || null}
          defaultCheckpointId={latestFileCheckpoint?.checkpoint_id || null}
        />
      ) : null}
    </>
  );
}
