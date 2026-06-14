import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { GitCompare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentI18nKey } from "@/i18n/agentResources";
import type {
  AsterSessionExecutionRuntime,
  AsterSubagentSessionInfo,
  AgentRuntimeFileCheckpointThreadSummary,
} from "@/lib/api/agentRuntime";

import type { ChatToolPreferences } from "../utils/chatToolPreferences";
import type { HarnessSessionState } from "../utils/harnessState";
import { getOutputSchemaRuntimeLabel } from "../utils/sessionExecutionRuntime";
import type { RuntimeToolAvailability } from "../utils/runtimeToolAvailability";

interface AgentRuntimeStripProps {
  activeTheme?: string;
  toolPreferences: ChatToolPreferences;
  runtimeToolAvailability?: RuntimeToolAvailability | null;
  harnessState: HarnessSessionState;
  childSubagentSessions?: AsterSubagentSessionInfo[];
  variant?: "standalone" | "embedded";
  isSending?: boolean;
  executionRuntime?: AsterSessionExecutionRuntime | null;
  isExecutionRuntimeActive?: boolean;
  runtimeStatusTitle?: string | null;
  selectedTeamLabel?: string | null;
  selectedTeamSummary?: string | null;
  selectedTeamRoleCount?: number;
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null;
  onOpenFileCheckpoints?: () => void;
}

interface CapabilityItem {
  key: string;
  label: string;
  enabled: boolean;
}

interface StatusItem {
  key: string;
  label: string;
  tone?: "default" | "outline" | "secondary";
}

export const AgentRuntimeStrip: React.FC<AgentRuntimeStripProps> = ({
  toolPreferences,
  runtimeToolAvailability = null,
  harnessState,
  childSubagentSessions = [],
  variant = "standalone",
  isSending = false,
  executionRuntime = null,
  isExecutionRuntimeActive = false,
  runtimeStatusTitle = null,
  selectedTeamLabel = null,
  selectedTeamSummary = null,
  selectedTeamRoleCount = 0,
  fileCheckpointSummary = null,
  onOpenFileCheckpoints,
}) => {
  const { t } = useTranslation("agent");
  const translate = useCallback(
    (key: AgentI18nKey, values?: Record<string, number | string>) =>
      t(key, values ?? {}),
    [t],
  );
  const fileCheckpointCount = fileCheckpointSummary?.count ?? 0;
  const hasRuntimeFileSignals =
    fileCheckpointCount > 0 ||
    harnessState.activeFileWrites.length > 0 ||
    harnessState.recentFileEvents.length > 0;
  const hasRuntimeOutputSignals = harnessState.outputSignals.length > 0;
  const hasRuntimeWorkbenchSignals =
    hasRuntimeFileSignals || hasRuntimeOutputSignals;
  const themeLabel = translate("agentChat.runtimeStrip.theme.general");
  const stripTitle = translate("agentChat.runtimeStrip.title.general");
  const hasSelectedTeam =
    Boolean(selectedTeamLabel?.trim()) || selectedTeamRoleCount > 0;
  const selectedTeamBadgeLabel =
    selectedTeamLabel?.trim() ||
    translate("agentChat.runtimeStrip.team.badgeRoleCount", {
      count: selectedTeamRoleCount,
    });
  const selectedTeamSummaryText =
    selectedTeamSummary?.trim() ||
    (hasSelectedTeam
      ? translate("agentChat.runtimeStrip.team.configuredSummary", {
          count: selectedTeamRoleCount,
        })
      : translate("agentChat.runtimeStrip.team.defaultSummary"));
  const canReviewFileCheckpoints =
    fileCheckpointCount > 0 &&
    Boolean(onOpenFileCheckpoints);

  const capabilities = useMemo<CapabilityItem[]>(
    () => [
      {
        key: "direct",
        label: translate("agentChat.runtimeStrip.capability.direct"),
        enabled: true,
      },
      {
        key: "thinking",
        label: translate("agentChat.runtimeStrip.capability.thinking"),
        enabled: true,
      },
      {
        key: "web_search",
        label: translate("agentChat.runtimeStrip.capability.webSearch"),
        enabled: runtimeToolAvailability?.webSearch !== false,
      },
      {
        key: "subagent",
        label: translate("agentChat.runtimeStrip.capability.subagent"),
        enabled:
          toolPreferences.subagent &&
          runtimeToolAvailability?.subagentRuntime !== false,
      },
    ],
    [
      runtimeToolAvailability?.subagentRuntime,
      runtimeToolAvailability?.webSearch,
      translate,
      toolPreferences,
    ],
  );

  const statusItems = useMemo<StatusItem[]>(() => {
    const nextItems: StatusItem[] = [];
    const outputSchemaLabel = getOutputSchemaRuntimeLabel(
      executionRuntime?.output_schema_runtime,
    );
    const runningTeamSessions = childSubagentSessions.filter(
      (session) => session.runtime_status === "running",
    ).length;
    const queuedTeamSessions = childSubagentSessions.filter(
      (session) => session.runtime_status === "queued",
    ).length;
    const activeTeamSessions = runningTeamSessions + queuedTeamSessions;
    const completedTeamSessions = childSubagentSessions.filter(
      (session) =>
        session.runtime_status === "completed" ||
        session.runtime_status === "failed" ||
        session.runtime_status === "aborted",
    ).length;
    if (hasRuntimeWorkbenchSignals) {
      nextItems.push({
        key: "runtime_outputs",
        label: translate("agentChat.runtimeStrip.status.runtimeOutputs", {
          count:
            harnessState.outputSignals.length ||
            harnessState.activeFileWrites.length ||
            harnessState.recentFileEvents.length,
        }),
        tone: "outline",
      });

      if (fileCheckpointCount > 0) {
        nextItems.push({
          key: "runtime_file_changes",
          label: translate("agentChat.runtimeStrip.status.runtimeFileChanges", {
            count: fileCheckpointCount,
          }),
          tone: "outline",
        });
      }
    }

    if (isSending) {
      nextItems.push({
        key: "sending",
        label:
          runtimeStatusTitle ||
          translate("agentChat.runtimeStrip.status.preparing"),
        tone: "secondary",
      });
    }

    if (outputSchemaLabel) {
      nextItems.push({
        key: "output_schema_runtime",
        label: translate("agentChat.runtimeStrip.status.outputSchema", {
          label: outputSchemaLabel,
        }),
        tone: isExecutionRuntimeActive ? "secondary" : "outline",
      });
    }

    if (runtimeToolAvailability?.known) {
      nextItems.push({
        key: "runtime_surface",
        label: translate("agentChat.runtimeStrip.status.runtimeSurface", {
          count: runtimeToolAvailability.availableToolCount,
        }),
        tone: "outline",
      });

      if (!runtimeToolAvailability.taskRuntime) {
        nextItems.push({
          key: "task_runtime_gap",
          label: translate("agentChat.runtimeStrip.status.taskToolGap", {
            count: runtimeToolAvailability.missingTaskTools.length,
          }),
          tone: "outline",
        });
      }

      if (!runtimeToolAvailability.webSearch) {
        nextItems.push({
          key: "web_search_gap",
          label: translate("agentChat.runtimeStrip.status.webSearchGap"),
          tone: "secondary",
        });
      }

      if (
        toolPreferences.subagent &&
        !runtimeToolAvailability.subagentRuntime
      ) {
        nextItems.push({
          key: "subagent_tool_gap",
          label: translate("agentChat.runtimeStrip.status.subagentToolGap", {
            count: [
              ...runtimeToolAvailability.missingSubagentCoreTools,
              ...runtimeToolAvailability.missingSubagentTeamTools,
            ].length,
          }),
          tone: "secondary",
        });
      }
    }

    if (harnessState.plan.phase === "planning") {
      nextItems.push({
        key: "planning",
        label: translate("agentChat.runtimeStrip.status.planning"),
        tone: "secondary",
      });
    }

    if (harnessState.plan.items.length > 0) {
      nextItems.push({
        key: "plan_items",
        label: translate("agentChat.runtimeStrip.status.planItems", {
          count: harnessState.plan.items.length,
        }),
        tone: "outline",
      });
    }

    if (harnessState.pendingApprovals.length > 0) {
      nextItems.push({
        key: "pending",
        label: translate("agentChat.runtimeStrip.status.pending", {
          count: harnessState.pendingApprovals.length,
        }),
        tone: "secondary",
      });
    }

    if (activeTeamSessions > 0) {
      nextItems.push({
        key: "team_running",
        label:
          queuedTeamSessions > 0
            ? translate("agentChat.runtimeStrip.status.teamRunningQueued", {
                active: activeTeamSessions,
                total: childSubagentSessions.length,
                queued: queuedTeamSessions,
              })
            : translate("agentChat.runtimeStrip.status.teamRunning", {
                active: activeTeamSessions,
                total: childSubagentSessions.length,
              }),
        tone: "secondary",
      });
    } else if (childSubagentSessions.length > 0) {
      nextItems.push({
        key: "team_sessions",
        label:
          completedTeamSessions > 0
            ? translate("agentChat.runtimeStrip.status.teamCompleted", {
                total: childSubagentSessions.length,
                completed: completedTeamSessions,
              })
            : translate("agentChat.runtimeStrip.status.teamSessions", {
                total: childSubagentSessions.length,
              }),
        tone: "outline",
      });
    } else if (harnessState.delegatedTasks.length > 0) {
      nextItems.push({
        key: "delegated",
        label: translate("agentChat.runtimeStrip.status.delegated", {
          count: harnessState.delegatedTasks.length,
        }),
        tone: "outline",
      });
    }

    if (harnessState.outputSignals.length > 0) {
      nextItems.push({
        key: "outputs",
        label: translate("agentChat.runtimeStrip.status.outputs", {
          count: harnessState.outputSignals.length,
        }),
        tone: "outline",
      });
    }

    if (nextItems.length === 0) {
      nextItems.push({
        key: "default_mode",
        label: translate("agentChat.runtimeStrip.status.defaultMode"),
        tone: "outline",
      });
    }

    return nextItems;
  }, [
    childSubagentSessions,
    executionRuntime,
    fileCheckpointCount,
    harnessState,
    hasRuntimeWorkbenchSignals,
    isExecutionRuntimeActive,
    isSending,
    runtimeToolAvailability,
    runtimeStatusTitle,
    translate,
    toolPreferences.subagent,
  ]);

  return (
    <div
      data-testid="agent-runtime-strip"
      data-runtime-kind={hasRuntimeWorkbenchSignals ? "runtime" : "general"}
      data-execution-strategy={executionRuntime?.execution_strategy ?? ""}
      className={
        variant === "embedded"
          ? "rounded-xl border border-border/70 bg-[linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted)/0.35))] px-4 py-3"
          : "mx-3 mb-2 mt-3 rounded-2xl border border-border/70 bg-[linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted)/0.35))] px-4 py-3"
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div
          className="text-sm font-medium text-foreground"
          data-testid="agent-runtime-strip-title"
        >
          {stripTitle}
        </div>
        <Badge variant="outline">{themeLabel}</Badge>
        {toolPreferences.subagent ? (
          <Badge variant={hasSelectedTeam ? "secondary" : "outline"}>
            {hasSelectedTeam
              ? translate("agentChat.runtimeStrip.team.badgeConfigured", {
                  label: selectedTeamBadgeLabel,
                })
              : translate("agentChat.runtimeStrip.team.badgeEnabled")}
          </Badge>
        ) : null}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {capabilities.map((item) => (
          <span
            key={item.key}
            data-testid={`agent-runtime-strip-capability-${item.key}`}
            data-capability-key={item.key}
            data-enabled={String(item.enabled)}
            className={[
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              item.enabled
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border/70 bg-background/80 text-muted-foreground",
            ].join(" ")}
          >
            {item.label}
          </span>
        ))}
      </div>
      {toolPreferences.subagent ? (
        <div className="mb-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {translate("agentChat.runtimeStrip.team.title")}
          </span>
          <span> · {selectedTeamSummaryText}</span>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {statusItems.map((item) => (
          <Badge
            key={item.key}
            variant={item.tone || "outline"}
            data-testid={`agent-runtime-strip-status-${item.key}`}
            data-status-key={item.key}
          >
            {item.label}
          </Badge>
        ))}
        {canReviewFileCheckpoints ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-full border-sky-200 bg-white px-2.5 text-xs text-sky-700 hover:bg-sky-50 dark:bg-background"
            onClick={onOpenFileCheckpoints}
            aria-label={translate(
              "agentChat.runtimeStrip.action.reviewFileChangesAria",
            )}
            title={translate(
              "agentChat.runtimeStrip.action.reviewFileChangesAria",
            )}
            data-testid="agent-runtime-strip-open-file-checkpoints"
          >
            <GitCompare className="mr-1.5 h-3.5 w-3.5" />
            {translate("agentChat.runtimeStrip.action.reviewFileChanges")}
          </Button>
        ) : null}
      </div>
    </div>
  );
};
