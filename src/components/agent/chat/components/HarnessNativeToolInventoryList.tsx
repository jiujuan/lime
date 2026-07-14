import type { AgentRuntimeToolInventory } from "@/lib/api/agentRuntime/toolInventoryTypes";
import { Badge } from "@/components/ui/badge";
import { agentText } from "./harnessPanelText";
import {
  collectNativeExecutionSources,
  formatExecutionSourceLabel,
  resolveExecutionSourceVariant,
} from "./harnessStatusPanelViewModel";

interface HarnessNativeToolInventoryListProps {
  toolInventoryNativeTools: AgentRuntimeToolInventory["native_tools"];
}

export function HarnessNativeToolInventoryList({
  toolInventoryNativeTools,
}: HarnessNativeToolInventoryListProps) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-foreground">
        {agentText("agentChat.harness.generated.bf99f1197c", "Native Tools")}
      </div>
      {toolInventoryNativeTools.length > 0 ? (
        toolInventoryNativeTools.map((entry) => (
          <div
            key={entry.name}
            className="rounded-xl border border-border bg-background p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {entry.name}
                  </span>
                  {entry.catalog_entry_name ? (
                    <Badge variant="outline">
                      {agentText(
                        "agentChat.harness.generated.43353e0245",
                        "映射",
                      )}
                      {entry.catalog_entry_name}
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      {agentText(
                        "agentChat.harness.generated.8ff2d94cfe",
                        "未映射 catalog",
                      )}
                    </Badge>
                  )}
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
                  {entry.tags.map((tag) => (
                    <Badge key={`${entry.name}-${tag}`} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                  <Badge variant="outline">
                    {agentText(
                      "agentChat.harness.generated.d434319af0",
                      "input_examples：",
                    )}
                    {entry.input_examples_count}
                  </Badge>
                </div>
              </div>
            </div>

            {collectNativeExecutionSources(entry).length > 0 ? (
              <NativeExecutionSourceBadges entry={entry} />
            ) : null}
          </div>
        ))
      ) : (
        <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          {agentText(
            "agentChat.harness.generated.421a99f0ff",
            "当前 native tools 为空。",
          )}
        </div>
      )}
    </div>
  );
}

function NativeExecutionSourceBadges({
  entry,
}: {
  entry: AgentRuntimeToolInventory["native_tools"][number];
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {entry.catalog_execution_warning_policy &&
      entry.catalog_execution_warning_policy_source ? (
        <Badge
          variant={resolveExecutionSourceVariant(
            entry.catalog_execution_warning_policy_source,
          )}
        >
          {agentText("agentChat.harness.generated.3ec66d862b", "Warning：")}
          {formatExecutionSourceLabel(
            entry.catalog_execution_warning_policy_source,
          )}
        </Badge>
      ) : null}
      {entry.catalog_execution_restriction_profile &&
      entry.catalog_execution_restriction_profile_source ? (
        <Badge
          variant={resolveExecutionSourceVariant(
            entry.catalog_execution_restriction_profile_source,
          )}
        >
          {agentText("agentChat.harness.generated.8624f470d1", "Restriction：")}
          {formatExecutionSourceLabel(
            entry.catalog_execution_restriction_profile_source,
          )}
        </Badge>
      ) : null}
      {entry.catalog_execution_sandbox_profile &&
      entry.catalog_execution_sandbox_profile_source ? (
        <Badge
          variant={resolveExecutionSourceVariant(
            entry.catalog_execution_sandbox_profile_source,
          )}
        >
          {agentText("agentChat.harness.generated.9a6d423d73", "Sandbox：")}
          {formatExecutionSourceLabel(
            entry.catalog_execution_sandbox_profile_source,
          )}
        </Badge>
      ) : null}
    </div>
  );
}
