import { Badge } from "@/components/ui/badge";
import type { HarnessSessionState } from "../utils/harnessState";
import { InteractiveText } from "./HarnessStatusPanelPrimitives";
import {
  HarnessStatusSection as Section,
  type HarnessSectionKey,
} from "./HarnessStatusSectionFrame";
import { agentText } from "./harnessPanelText";

interface HarnessPlanSectionProps {
  plan: HarnessSessionState["plan"];
  registerSectionRef: (
    key: HarnessSectionKey,
    node: HTMLElement | null,
  ) => void;
  handleOpenExternalLink: (url: string) => void | Promise<void>;
}

export function HarnessPlanSection({
  plan,
  registerSectionRef,
  handleOpenExternalLink,
}: HarnessPlanSectionProps) {
  if (plan.phase === "idle" && plan.items.length === 0) {
    return null;
  }

  return (
    <Section
      sectionKey="plan"
      title={agentText("agentChat.harness.generated.3d801c3537", "规划状态")}
      badge={
        plan.phase === "planning"
          ? "规划中"
          : plan.phase === "ready"
            ? "已就绪"
            : "空闲"
      }
      registerRef={registerSectionRef}
    >
      <div className="space-y-2">
        {plan.items.length > 0 ? (
          plan.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
            >
              <InteractiveText
                text={item.content}
                className="min-w-0 text-sm text-foreground"
                onOpenUrl={handleOpenExternalLink}
              />
              <Badge
                variant={
                  item.status === "completed"
                    ? "secondary"
                    : item.status === "in_progress"
                      ? "default"
                      : "outline"
                }
              >
                {item.status === "completed"
                  ? "已完成"
                  : item.status === "in_progress"
                    ? "进行中"
                    : "待开始"}
              </Badge>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
            {plan.summaryText || "已进入规划流程，但暂无可展示的 Todo 快照。"}
          </div>
        )}
      </div>
    </Section>
  );
}
