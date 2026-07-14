import { Bot, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HarnessSessionState } from "../utils/harnessState";
import type {
  CanonicalAgentStatus,
  CanonicalChildThreadSummary,
} from "../projection/canonicalChildThreadSummary";
import { InteractiveText } from "./HarnessStatusPanelPrimitives";
import {
  HarnessStatusSection as Section,
  type HarnessSectionKey,
} from "./HarnessStatusSectionFrame";
import { agentText } from "./harnessPanelText";
import type { ChildSubagentSessionSummary } from "./harnessStatusPanelViewModel";

interface HarnessDelegationSectionProps {
  delegatedTasks: HarnessSessionState["delegatedTasks"];
  registerSectionRef: (
    key: HarnessSectionKey,
    node: HTMLElement | null,
  ) => void;
  handleOpenExternalLink: (url: string) => void | Promise<void>;
  realTeamSummary: ChildSubagentSessionSummary;
  canonicalChildren: CanonicalChildThreadSummary[];
  onOpenSubagentSession?: (sessionId: string) => void;
}

export function HarnessDelegationSection({
  delegatedTasks,
  registerSectionRef,
  handleOpenExternalLink,
  realTeamSummary,
  canonicalChildren,
  onOpenSubagentSession,
}: HarnessDelegationSectionProps) {
  const { t, i18n } = useTranslation("agent");
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

        <CanonicalChildThreadList
          children={canonicalChildren}
          locale={i18n.resolvedLanguage || i18n.language}
          onOpenSubagentSession={onOpenSubagentSession}
          handleOpenExternalLink={handleOpenExternalLink}
          statusLabel={(status) =>
            String(t(canonicalStatusKey(status) as never))
          }
        />
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
        {realTeamSummary.interrupted > 0 ? (
          <span>
            {agentText("agentChat.collaboration.status.interrupted", "已中断")}
            {realTeamSummary.interrupted}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function CanonicalChildThreadList({
  children,
  handleOpenExternalLink,
  locale,
  onOpenSubagentSession,
  statusLabel,
}: {
  children: CanonicalChildThreadSummary[];
  handleOpenExternalLink: (url: string) => void | Promise<void>;
  locale: string;
  onOpenSubagentSession?: (threadId: string) => void;
  statusLabel: (status: CanonicalAgentStatus) => string;
}) {
  if (children.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground">
        {agentText("agentChat.harness.generated.f4b507ed0d", "实时子任务")}
      </div>
      {children.map((child) => (
        <div
          key={child.threadId}
          className="rounded-lg border border-border bg-background p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Workflow className="h-4 w-4 text-muted-foreground" />
                <span className="truncate text-sm font-medium text-foreground">
                  {child.name}
                </span>
                <Badge variant={canonicalStatusVariant(child.status)}>
                  {statusLabel(child.status)}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {child.role ? <span>{child.role}</span> : null}
                {child.modelProvider ? (
                  <span>{child.modelProvider}</span>
                ) : null}
                <span>
                  {new Date(child.updatedAtMs).toLocaleString(locale)}
                </span>
              </div>
              {child.taskSummary ? (
                <InteractiveText
                  text={child.taskSummary}
                  className="mt-2 text-xs text-muted-foreground"
                  onOpenUrl={handleOpenExternalLink}
                />
              ) : null}
              {child.statusMessage ? (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-900">
                  {child.statusMessage}
                </div>
              ) : null}
            </div>
            {onOpenSubagentSession && child.status !== "notFound" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onOpenSubagentSession(child.threadId)}
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

function canonicalStatusKey(status: CanonicalAgentStatus): string {
  switch (status) {
    case "pendingInit":
      return "agentChat.collaboration.status.queued";
    case "running":
      return "agentChat.collaboration.status.running";
    case "interrupted":
      return "agentChat.collaboration.status.interrupted";
    case "completed":
      return "agentChat.collaboration.status.completed";
    case "errored":
      return "agentChat.collaboration.status.failed";
    case "shutdown":
      return "agentChat.collaboration.status.shutdown";
    case "notFound":
      return "agentChat.collaboration.status.notFound";
  }
}

function canonicalStatusVariant(
  status: CanonicalAgentStatus,
): "default" | "destructive" | "outline" | "secondary" {
  switch (status) {
    case "running":
      return "default";
    case "errored":
    case "notFound":
      return "destructive";
    case "completed":
    case "interrupted":
      return "secondary";
    default:
      return "outline";
  }
}
