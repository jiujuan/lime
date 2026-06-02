import { AlertCircle, Clock3, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { InteractiveText } from "./HarnessStatusPanelPrimitives";
import {
  HarnessStatusSection as Section,
  type HarnessSectionKey,
} from "./HarnessStatusSectionFrame";
import { agentText } from "./harnessPanelText";
import type { RuntimeTaskPresentation } from "./harnessStatusPanelViewModel";

interface HarnessRuntimeTaskSectionProps {
  runtimeTaskPresentation: RuntimeTaskPresentation;
  handleOpenExternalLink: (url: string) => void | Promise<void>;
  registerSectionRef: (
    key: HarnessSectionKey,
    node: HTMLElement | null,
  ) => void;
}

export function HarnessRuntimeTaskSection({
  runtimeTaskPresentation,
  handleOpenExternalLink,
  registerSectionRef,
}: HarnessRuntimeTaskSectionProps) {
  return (
    <Section
      sectionKey="runtime"
      title={agentText("agentChat.harness.generated.f7fc8b8014", "任务进行时")}
      badge={
        runtimeTaskPresentation.checkpoints.length > 0
          ? `${runtimeTaskPresentation.checkpoints.length} 个节点`
          : runtimeTaskPresentation.phaseLabel
      }
      registerRef={registerSectionRef}
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-background p-4 shadow-sm shadow-slate-950/5">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
                runtimeTaskPresentation.stepStatus === "error" &&
                  "bg-destructive/10 text-destructive",
                runtimeTaskPresentation.stepStatus === "skipped" &&
                  "bg-muted text-muted-foreground",
                runtimeTaskPresentation.stepStatus === "active" &&
                  "bg-primary/10 text-primary",
              )}
            >
              <RuntimeStepIcon status={runtimeTaskPresentation.stepStatus} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-muted-foreground">
                {agentText(
                  "agentChat.harness.generated.e94d425276",
                  "当前任务",
                )}
              </div>
              <div className="mt-1 text-sm font-semibold leading-6 text-foreground">
                {runtimeTaskPresentation.title}
              </div>
              <InteractiveText
                text={runtimeTaskPresentation.summaryText}
                className="mt-2 text-sm leading-6 text-muted-foreground"
                onOpenUrl={handleOpenExternalLink}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge
                  variant={
                    runtimeTaskPresentation.stepStatus === "error"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {runtimeTaskPresentation.statusLabel}
                </Badge>
                <Badge variant="outline">
                  {runtimeTaskPresentation.phaseLabel}
                </Badge>
                <Badge variant="outline">
                  {runtimeTaskPresentation.progressLabel}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {runtimeTaskPresentation.checkpoints.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-muted-foreground">
                {agentText(
                  "agentChat.harness.generated.67c022795d",
                  "任务节点",
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {runtimeTaskPresentation.progressLabel}
              </div>
            </div>
            <div className="space-y-2">
              {runtimeTaskPresentation.checkpoints.map((checkpoint, index) => {
                const isCurrentCheckpoint =
                  index === runtimeTaskPresentation.checkpoints.length - 1;
                return (
                  <RuntimeCheckpointRow
                    key={`${checkpoint}-${index}`}
                    checkpoint={checkpoint}
                    index={index}
                    isCurrentCheckpoint={isCurrentCheckpoint}
                    stepStatus={runtimeTaskPresentation.stepStatus}
                    onOpenUrl={handleOpenExternalLink}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
            {runtimeTaskPresentation.progressLabel}
          </div>
        )}
      </div>
    </Section>
  );
}

function RuntimeStepIcon({
  status,
}: {
  status: RuntimeTaskPresentation["stepStatus"];
}) {
  if (status === "error") {
    return <AlertCircle className="h-4 w-4" />;
  }
  if (status === "skipped") {
    return <Clock3 className="h-4 w-4" />;
  }
  return <Loader2 className="h-4 w-4 animate-spin" />;
}

interface RuntimeCheckpointRowProps {
  checkpoint: string;
  index: number;
  isCurrentCheckpoint: boolean;
  stepStatus: RuntimeTaskPresentation["stepStatus"];
  onOpenUrl: (url: string) => void | Promise<void>;
}

function RuntimeCheckpointRow({
  checkpoint,
  index,
  isCurrentCheckpoint,
  stepStatus,
  onOpenUrl,
}: RuntimeCheckpointRowProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-3 py-2.5",
        isCurrentCheckpoint &&
          stepStatus === "error" &&
          "border-destructive/30 bg-destructive/5",
        isCurrentCheckpoint &&
          stepStatus === "active" &&
          "border-primary/20 bg-primary/5",
        isCurrentCheckpoint &&
          stepStatus === "skipped" &&
          "border-border bg-muted/30",
        !isCurrentCheckpoint && "border-border bg-muted/20",
      )}
    >
      <div
        className={cn(
          "mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
          isCurrentCheckpoint &&
            stepStatus === "error" &&
            "bg-destructive/10 text-destructive",
          isCurrentCheckpoint &&
            stepStatus === "active" &&
            "bg-primary/10 text-primary",
          isCurrentCheckpoint &&
            stepStatus === "skipped" &&
            "bg-background text-muted-foreground",
          !isCurrentCheckpoint && "bg-background text-muted-foreground",
        )}
      >
        {isCurrentCheckpoint ? (
          <RuntimeCheckpointIcon status={stepStatus} />
        ) : (
          index + 1
        )}
      </div>
      <div className="min-w-0 flex-1">
        <InteractiveText
          text={checkpoint}
          className="text-sm leading-6 text-foreground"
          onOpenUrl={onOpenUrl}
        />
      </div>
      <Badge variant={isCurrentCheckpoint ? "secondary" : "outline"}>
        {isCurrentCheckpoint ? "当前" : "已记录"}
      </Badge>
    </div>
  );
}

function RuntimeCheckpointIcon({
  status,
}: {
  status: RuntimeTaskPresentation["stepStatus"];
}) {
  if (status === "error") {
    return <AlertCircle className="h-3.5 w-3.5" />;
  }
  if (status === "skipped") {
    return <Clock3 className="h-3.5 w-3.5" />;
  }
  return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
}
