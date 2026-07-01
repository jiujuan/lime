import { ListChecks } from "lucide-react";
import "./WorkspacePluginOrchestrationRail.css";

export interface WorkspacePluginOrchestrationRailStep {
  id: string;
  title: string;
  subagent: string | null;
  skillRefs: string[];
  status: string | null;
  summary: string | null;
  done: boolean | null;
}

export interface WorkspacePluginOrchestrationRailModel {
  workflowKey: string | null;
  steps: WorkspacePluginOrchestrationRailStep[];
  subagentRefs: string[];
  skillRefs: string[];
  cliRefs: string[];
  connectorRefs: string[];
  hookLabels: string[];
}

interface WorkspacePluginOrchestrationRailCopy {
  title: string;
  detail: string;
  workflowLabel: string;
  subagentsLabel: string;
  skillsLabel: string;
  cliLabel: string;
  connectorsLabel: string;
  hooksLabel: string;
  doneLabel: string;
  pendingLabel: string;
}

interface WorkspacePluginOrchestrationRailProps {
  copy: WorkspacePluginOrchestrationRailCopy;
  model: WorkspacePluginOrchestrationRailModel;
  rootTestId: string;
  testIdPrefix: string;
}

export function WorkspacePluginOrchestrationRail({
  copy,
  model,
  rootTestId,
  testIdPrefix,
}: WorkspacePluginOrchestrationRailProps) {
  return (
    <div
      className="workspace-plugin-orchestration-rail"
      data-testid={rootTestId}
    >
      <div className="workspace-plugin-orchestration-rail-heading">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] text-[color:var(--lime-text-muted)]">
          <ListChecks className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-[color:var(--lime-text-strong)]">
            {copy.title}
          </div>
          <div className="truncate text-[11px] text-[color:var(--lime-text-muted)]">
            {copy.detail}
          </div>
        </div>
      </div>

      <div className="workspace-plugin-orchestration-rail-body">
        {model.steps.length > 0 ? (
          <div className="workspace-plugin-orchestration-rail-steps">
            {model.steps.map((step, index) => (
              <div
                key={step.id}
                className="workspace-plugin-orchestration-rail-step"
                data-testid={`${testIdPrefix}-step`}
              >
                <span className="workspace-plugin-orchestration-rail-index">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-[color:var(--lime-text-strong)]">
                    {step.title}
                  </span>
                  <span
                    className="block truncate text-[11px] text-[color:var(--lime-text-muted)]"
                    data-testid={`${testIdPrefix}-subagent`}
                    data-subagent-ref={step.subagent ?? ""}
                  >
                    {step.subagent ?? "-"}
                  </span>
                  {step.skillRefs.length > 0 ? (
                    <span
                      className="block truncate text-[11px] text-[color:var(--lime-text-muted)]"
                      data-testid={`${testIdPrefix}-skill-ref`}
                      data-skill-ref={step.skillRefs.join(",")}
                    >
                      {step.skillRefs.join(" · ")}
                    </span>
                  ) : null}
                </span>
                {step.done !== null || step.status ? (
                  <span className="workspace-plugin-orchestration-rail-status">
                    {step.done === null
                      ? step.status
                      : step.done
                        ? copy.doneLabel
                        : copy.pendingLabel}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="workspace-plugin-orchestration-rail-chips">
          {model.workflowKey ? (
            <WorkspacePluginOrchestrationChip
              label={copy.workflowLabel}
              testId={`${testIdPrefix}-workflow`}
              value={model.workflowKey}
              valueAttr="data-workflow-key"
            />
          ) : null}
          {model.subagentRefs.map((subagentRef) => (
            <WorkspacePluginOrchestrationChip
              key={`subagent:${subagentRef}`}
              label={copy.subagentsLabel}
              testId={`${testIdPrefix}-subagent-ref`}
              value={subagentRef}
              valueAttr="data-subagent-ref"
            />
          ))}
          {model.cliRefs.map((cliRef) => (
            <WorkspacePluginOrchestrationChip
              key={`cli:${cliRef}`}
              label={copy.cliLabel}
              testId={`${testIdPrefix}-cli`}
              value={cliRef}
              valueAttr="data-cli-ref"
            />
          ))}
          {model.skillRefs.map((skillRef) => (
            <WorkspacePluginOrchestrationChip
              key={`skill:${skillRef}`}
              label={copy.skillsLabel}
              testId={`${testIdPrefix}-skill`}
              value={skillRef}
              valueAttr="data-skill-ref"
            />
          ))}
          {model.connectorRefs.map((connectorRef) => (
            <WorkspacePluginOrchestrationChip
              key={`connector:${connectorRef}`}
              label={copy.connectorsLabel}
              testId={`${testIdPrefix}-connector`}
              value={connectorRef}
              valueAttr="data-connector-ref"
            />
          ))}
          {model.hookLabels.map((hookLabel) => (
            <WorkspacePluginOrchestrationChip
              key={`hook:${hookLabel}`}
              label={copy.hooksLabel}
              testId={`${testIdPrefix}-hook`}
              value={hookLabel}
              valueAttr="data-hook-ref"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkspacePluginOrchestrationChip({
  label,
  testId,
  value,
  valueAttr,
}: {
  label: string;
  testId: string;
  value: string;
  valueAttr: string;
}) {
  return (
    <span
      className="workspace-plugin-orchestration-rail-chip"
      data-testid={testId}
      {...{ [valueAttr]: value }}
    >
      <span>{label}</span>
      <span className="truncate font-medium text-[color:var(--lime-text-strong)]">
        {value}
      </span>
    </span>
  );
}
