import { Bot, Workflow } from "lucide-react";
import type { AsterSubagentSessionInfo } from "@/lib/api/agentRuntime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HarnessSessionState } from "../utils/harnessState";
import { resolveTeamWorkspaceStableProcessingLabel } from "../utils/teamWorkspaceCopy";
import { InteractiveText } from "./HarnessStatusPanelPrimitives";
import {
  HarnessStatusSection as Section,
  type HarnessSectionKey,
} from "./HarnessStatusSectionFrame";
import { agentText } from "./harnessPanelText";
import {
  formatUnixTimestamp,
  resolveFriendlyToolLabel,
  resolveSubagentRuntimeStatusLabel,
  resolveSubagentRuntimeStatusVariant,
  resolveSubagentSessionTypeLabel,
  type ChildSubagentSessionSummary,
} from "./harnessStatusPanelViewModel";

interface HarnessDelegationSectionProps {
  delegatedTasks: HarnessSessionState["delegatedTasks"];
  registerSectionRef: (
    key: HarnessSectionKey,
    node: HTMLElement | null,
  ) => void;
  handleOpenExternalLink: (url: string) => void | Promise<void>;
  realTeamSummary: ChildSubagentSessionSummary;
  childSubagentSessions: AsterSubagentSessionInfo[];
  onOpenSubagentSession?: (sessionId: string) => void;
}

export function HarnessDelegationSection({
  delegatedTasks,
  registerSectionRef,
  handleOpenExternalLink,
  realTeamSummary,
  childSubagentSessions,
  onOpenSubagentSession,
}: HarnessDelegationSectionProps) {
  if (realTeamSummary.total === 0 && delegatedTasks.length === 0) {
    return null;
  }

  return (
    <Section
      sectionKey="delegation"
      title={agentText("agentChat.harness.generated.2a8ce33ff0", "子任务")}
      badge={
        realTeamSummary.active > 0
          ? `处理中 ${realTeamSummary.active}`
          : realTeamSummary.total > 0
            ? `${realTeamSummary.total} 个子任务`
            : delegatedTasks.length > 0
              ? `${delegatedTasks.length} 条`
              : undefined
      }
      registerRef={registerSectionRef}
    >
      <div className="space-y-3">
        {realTeamSummary.total > 0 ? (
          <RealTeamSummaryCard realTeamSummary={realTeamSummary} />
        ) : null}

        {delegatedTasks.map((task) => (
          <div
            key={task.id}
            className="rounded-xl border border-border bg-background p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate text-sm font-medium text-foreground">
                    {task.title}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {task.role ? (
                    <span>
                      {agentText(
                        "agentChat.harness.generated.908a9f1d6a",
                        "角色：",
                      )}
                      {task.role}
                    </span>
                  ) : null}
                  {task.taskType ? (
                    <span>
                      {agentText(
                        "agentChat.harness.generated.8f3e9e1fe7",
                        "类型：",
                      )}
                      {task.taskType}
                    </span>
                  ) : null}
                  {task.model ? (
                    <span>
                      {agentText(
                        "agentChat.harness.generated.7ac64a2b44",
                        "模型：",
                      )}
                      {task.model}
                    </span>
                  ) : null}
                </div>
                {task.summary ? (
                  <InteractiveText
                    text={task.summary}
                    className="mt-2 text-xs text-muted-foreground"
                    onOpenUrl={handleOpenExternalLink}
                  />
                ) : null}
              </div>
              <Badge
                variant={
                  task.status === "completed"
                    ? "secondary"
                    : task.status === "running"
                      ? "default"
                      : "destructive"
                }
              >
                {task.status === "completed"
                  ? "已完成"
                  : task.status === "running"
                    ? "处理中"
                    : "失败"}
              </Badge>
            </div>
          </div>
        ))}

        {childSubagentSessions.length > 0 ? (
          <RuntimeSubagentSessionList
            childSubagentSessions={childSubagentSessions}
            onOpenSubagentSession={onOpenSubagentSession}
            handleOpenExternalLink={handleOpenExternalLink}
          />
        ) : null}
      </div>
    </Section>
  );
}

function RealTeamSummaryCard({
  realTeamSummary,
}: {
  realTeamSummary: ChildSubagentSessionSummary;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-foreground">
          {agentText("agentChat.harness.generated.2e18241824", "当前子任务")}
        </div>
        <Badge variant="outline">
          {realTeamSummary.total}{" "}
          {agentText("agentChat.harness.generated.f7b2a6ee68", "个")}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>
          {agentText("agentChat.harness.generated.fcb979ef0b", "处理中")}
          {realTeamSummary.running}
        </span>
        <span>
          {agentText("agentChat.harness.generated.bd3488d0a9", "等待中")}
          {realTeamSummary.queued}
        </span>
        <span>
          {agentText("agentChat.harness.generated.e99b48a29b", "已完成")}
          {realTeamSummary.settled}
        </span>
        <span>
          {agentText("agentChat.harness.generated.ed5909bac1", "需处理")}
          {realTeamSummary.failed}
        </span>
      </div>
    </div>
  );
}

function RuntimeSubagentSessionList({
  childSubagentSessions,
  onOpenSubagentSession,
  handleOpenExternalLink,
}: {
  childSubagentSessions: AsterSubagentSessionInfo[];
  onOpenSubagentSession?: (sessionId: string) => void;
  handleOpenExternalLink: (url: string) => void | Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground">
        {agentText("agentChat.harness.generated.f4b507ed0d", "实时子任务")}
      </div>
      {childSubagentSessions.map((session) => (
        <div
          key={session.id}
          className="rounded-xl border border-border bg-background p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-muted-foreground" />
                <span className="truncate text-sm font-medium text-foreground">
                  {session.name}
                </span>
                <Badge
                  variant={resolveSubagentRuntimeStatusVariant(
                    session.runtime_status,
                  )}
                >
                  {resolveSubagentRuntimeStatusLabel(session.runtime_status)}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>
                  {agentText(
                    "agentChat.harness.generated.8f3e9e1fe7",
                    "类型：",
                  )}
                  {resolveSubagentSessionTypeLabel(session.session_type)}
                </span>
                {session.role_hint ? (
                  <span>
                    {agentText(
                      "agentChat.harness.generated.908a9f1d6a",
                      "角色：",
                    )}
                    {session.role_hint}
                  </span>
                ) : null}
                {session.model ? (
                  <span>
                    {agentText(
                      "agentChat.harness.generated.7ac64a2b44",
                      "模型：",
                    )}
                    {session.model}
                  </span>
                ) : null}
                {session.provider_name ? (
                  <span>
                    {agentText(
                      "agentChat.harness.generated.74dd99b7b0",
                      "提供方：",
                    )}
                    {session.provider_name}
                  </span>
                ) : null}
                {session.team_parallel_budget !== undefined &&
                session.team_active_count !== undefined ? (
                  <span>
                    {agentText(
                      "agentChat.harness.generated.9375445b14",
                      "处理窗口：",
                    )}
                    {session.team_active_count}/{session.team_parallel_budget}
                  </span>
                ) : null}
                {session.provider_parallel_budget === 1 &&
                session.provider_concurrency_group ? (
                  <span>
                    {resolveTeamWorkspaceStableProcessingLabel()}
                    {agentText(
                      "agentChat.harness.generated.d057313512",
                      "： 当前服务按顺序处理",
                    )}
                  </span>
                ) : null}
                {session.origin_tool ? (
                  <span>
                    {agentText(
                      "agentChat.harness.generated.64b3b59a15",
                      "来源：",
                    )}
                    {resolveFriendlyToolLabel(session.origin_tool) ||
                      session.origin_tool}
                  </span>
                ) : null}
                <span>
                  {agentText(
                    "agentChat.harness.generated.943f4e3ee6",
                    "更新：",
                  )}
                  {formatUnixTimestamp(session.updated_at)}
                </span>
              </div>
              {session.task_summary ? (
                <InteractiveText
                  text={session.task_summary}
                  className="mt-2 text-xs text-muted-foreground"
                  onOpenUrl={handleOpenExternalLink}
                />
              ) : null}
              {session.queue_reason ? (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-900">
                  {session.queue_reason}
                </div>
              ) : null}
            </div>
            {onOpenSubagentSession ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onOpenSubagentSession(session.id)}
              >
                {agentText(
                  "agentChat.harness.generated.faea8c1db9",
                  "查看详情",
                )}
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
