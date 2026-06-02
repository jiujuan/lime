import type { AgentRuntimeToolInventory } from "@/lib/api/agentRuntime";
import { Badge } from "@/components/ui/badge";
import { agentText } from "./harnessPanelText";
import { formatRuntimeToolSourceKindLabel } from "./harnessStatusPanelViewModel";

interface HarnessRuntimeToolInventoryListProps {
  runtimeToolVisibleTotal: number;
  runtimeToolTotal: number;
  toolInventoryRuntimeTools: NonNullable<
    AgentRuntimeToolInventory["runtime_tools"]
  >;
}

export function HarnessRuntimeToolInventoryList({
  runtimeToolVisibleTotal,
  runtimeToolTotal,
  toolInventoryRuntimeTools,
}: HarnessRuntimeToolInventoryListProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-foreground">
          {agentText(
            "agentChat.harness.generated.37e40f8034",
            "实际 Runtime 工具面",
          )}
        </div>
        <Badge variant="secondary">
          {runtimeToolVisibleTotal} / {runtimeToolTotal}
        </Badge>
      </div>
      {toolInventoryRuntimeTools.length > 0 ? (
        toolInventoryRuntimeTools.map((entry) => (
          <div
            key={`${entry.source_kind}:${entry.name}`}
            className="rounded-xl border border-border bg-background p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {entry.name}
              </span>
              <Badge variant="outline">
                {formatRuntimeToolSourceKindLabel(entry.source_kind)}
              </Badge>
              {entry.source_label ? (
                <Badge variant="outline">{entry.source_label}</Badge>
              ) : null}
              {entry.status ? (
                <Badge variant="outline">{entry.status}</Badge>
              ) : null}
              {entry.visible_in_context ? (
                <Badge variant="secondary">
                  {agentText(
                    "agentChat.harness.generated.87dfd0b2c8",
                    "上下文可见",
                  )}
                </Badge>
              ) : null}
              {entry.deferred_loading ? (
                <Badge variant="outline">
                  {agentText(
                    "agentChat.harness.generated.714ae55e88",
                    "Deferred",
                  )}
                </Badge>
              ) : null}
              {!entry.caller_allowed ? (
                <Badge variant="destructive">
                  {agentText(
                    "agentChat.harness.generated.8a1c797eb2",
                    "Caller 拒绝",
                  )}
                </Badge>
              ) : null}
              {entry.catalog_entry_name ? (
                <Badge variant="outline">
                  {agentText("agentChat.harness.generated.43353e0245", "映射")}
                  {entry.catalog_entry_name}
                </Badge>
              ) : null}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {entry.description}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {entry.allowed_callers.length > 0 ? (
                <Badge variant="outline">
                  {agentText(
                    "agentChat.harness.generated.e8835d1775",
                    "callers：",
                  )}
                  {entry.allowed_callers.join(", ")}
                </Badge>
              ) : (
                <Badge variant="outline">
                  {agentText(
                    "agentChat.harness.generated.1ba5809394",
                    "callers：全部",
                  )}
                </Badge>
              )}
              {entry.always_visible ? (
                <Badge variant="outline">
                  {agentText(
                    "agentChat.harness.generated.6aec99f141",
                    "Always Visible",
                  )}
                </Badge>
              ) : null}
              <Badge variant="outline">
                {agentText(
                  "agentChat.harness.generated.d434319af0",
                  "input_examples：",
                )}
                {entry.input_examples_count}
              </Badge>
              {entry.tags.map((tag) => (
                <Badge
                  key={`${entry.name}-${entry.source_kind}-${tag}`}
                  variant="outline"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          {agentText(
            "agentChat.harness.generated.27cc47a711",
            "当前尚未构建统一 runtime 工具面。",
          )}
        </div>
      )}
    </div>
  );
}
