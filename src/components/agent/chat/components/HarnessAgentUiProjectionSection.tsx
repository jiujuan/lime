import { Badge } from "@/components/ui/badge";
import type {
  AgentUiProjectionSummary,
  AgentUiProjectionTranslation,
} from "../projection/agentUiProjectionSummary";
import {
  formatAgentUiProjectionControl,
  formatAgentUiProjectionEventDetail,
  formatAgentUiProjectionEventType,
  formatAgentUiProjectionPhase,
  formatAgentUiProjectionSourceType,
} from "../projection/agentUiProjectionSummary";
import { InventoryStatCard } from "./HarnessStatusPanelPrimitives";
import {
  HarnessStatusSection as Section,
  type HarnessSectionKey,
} from "./HarnessStatusSectionFrame";
import { agentText } from "./harnessPanelText";
import { formatIsoDateTime } from "./harnessStatusPanelViewModel";

interface HarnessAgentUiProjectionSectionProps {
  agentUiProjectionSummary: AgentUiProjectionSummary;
  translateProjection: AgentUiProjectionTranslation;
  registerSectionRef: (
    key: HarnessSectionKey,
    node: HTMLElement | null,
  ) => void;
}

export function HarnessAgentUiProjectionSection({
  agentUiProjectionSummary,
  translateProjection,
  registerSectionRef,
}: HarnessAgentUiProjectionSectionProps) {
  return (
    <Section
      sectionKey="agentui"
      title={agentText(
        "agentChat.harness.generated.bca7a0c006",
        "AgentUI 标准投影",
      )}
      badge={`${agentUiProjectionSummary.total} 条`}
      registerRef={registerSectionRef}
    >
      <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-sky-300 bg-background text-sky-800"
          >
            {agentText(
              "agentChat.harness.generated.7d96e65980",
              "current projection",
            )}
          </Badge>
          <span className="text-xs text-sky-900">
            {agentText(
              "agentChat.harness.generated.f931108be0",
              "只读取 conversationProjectionStore.agentUi；不从 assistant 文本反推工具、证据或审批状态。",
            )}
          </span>
        </div>

        <div className="grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
          <InventoryStatCard
            title={agentText(
              "agentChat.harness.generated.bf38ab4875",
              "Action / HITL",
            )}
            value={`${agentUiProjectionSummary.actionCount}`}
            hint="action.required / permission.changed"
          />
          <InventoryStatCard
            title={agentText(
              "agentChat.harness.generated.7be19a3bbe",
              "Task / Agent",
            )}
            value={`${agentUiProjectionSummary.taskCount}`}
            hint="queue.changed / task.changed / agent.changed"
          />
          <InventoryStatCard
            title={agentText(
              "agentChat.harness.generated.aa778b50a1",
              "Artifact",
            )}
            value={`${agentUiProjectionSummary.artifactCount}`}
            hint="artifact.* typed events"
          />
          <InventoryStatCard
            title={agentText(
              "agentChat.harness.generated.7ea014de7b",
              "Evidence",
            )}
            value={`${agentUiProjectionSummary.evidenceCount}`}
            hint="evidence.changed"
          />
          <InventoryStatCard
            title={agentText(
              "agentChat.harness.generated.3af2279f9e",
              "Diagnostics",
            )}
            value={`${agentUiProjectionSummary.diagnosticsCount}`}
            hint="context / metric / diagnostic"
          />
        </div>

        {agentUiProjectionSummary.latestNotableEvents.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-medium text-sky-950">
              {agentText(
                "agentChat.harness.generated.1a89b7738c",
                "最近标准事件",
              )}
            </div>
            {agentUiProjectionSummary.latestNotableEvents.map(
              (event, index) => (
                <div
                  key={[
                    event.sequence,
                    event.type,
                    event.sourceType,
                    index,
                  ].join(":")}
                  className="rounded-xl border border-sky-200 bg-background p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {formatAgentUiProjectionEventType(
                        event.type,
                        translateProjection,
                      )}
                    </Badge>
                    <Badge variant="outline">
                      {formatAgentUiProjectionPhase(
                        event.phase,
                        translateProjection,
                      )}
                    </Badge>
                    {event.control ? (
                      <Badge variant="outline">
                        {agentText(
                          "agentChat.harness.generated.74f4646cb4",
                          "control ·",
                        )}{" "}
                        {formatAgentUiProjectionControl(
                          event.control,
                          translateProjection,
                        )}
                      </Badge>
                    ) : null}
                    {event.timestamp ? (
                      <span className="text-xs text-muted-foreground">
                        {formatIsoDateTime(event.timestamp)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    <span className="text-foreground">
                      {formatAgentUiProjectionSourceType(
                        event.sourceType,
                        translateProjection,
                      )}
                    </span>
                    <span className="mx-1">·</span>
                    {formatAgentUiProjectionEventDetail(event)}
                  </div>
                </div>
              ),
            )}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
