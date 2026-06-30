import type { AgentRuntimeToolInventory } from "@/lib/api/agentRuntime";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { agentText } from "./harnessPanelText";
import {
  countCatalogToolsByInventoryFilter,
  formatExecutionRestrictionProfileLabel,
  formatExecutionSandboxProfileLabel,
  formatExecutionSourceLabel,
  formatExecutionWarningPolicyLabel,
  formatToolLifecycleLabel,
  formatToolPermissionPlaneLabel,
  formatToolSourceKindLabel,
  resolveExecutionSourceVariant,
  type ToolInventoryFilterValue,
} from "./harnessStatusPanelViewModel";

interface HarnessCatalogToolInventoryListProps {
  toolInventoryCatalogTools: AgentRuntimeToolInventory["catalog_tools"];
  filteredCatalogTools: AgentRuntimeToolInventory["catalog_tools"];
  toolInventoryFilter: ToolInventoryFilterValue;
  setToolInventoryFilter: (value: ToolInventoryFilterValue) => void;
}

export function HarnessCatalogToolInventoryList({
  toolInventoryCatalogTools,
  filteredCatalogTools,
  toolInventoryFilter,
  setToolInventoryFilter,
}: HarnessCatalogToolInventoryListProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-foreground">
          {agentText("agentChat.harness.generated.c6670bdd88", "Catalog 工具")}
        </div>
        <Badge variant="secondary">
          {filteredCatalogTools.length} / {toolInventoryCatalogTools.length}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          { value: "all" as const, label: "全部" },
          { value: "runtime" as const, label: "运行时覆盖" },
          { value: "persisted" as const, label: "持久化覆盖" },
          { value: "default" as const, label: "纯默认" },
        ].map((option) => {
          const active = option.value === toolInventoryFilter;
          const count = countCatalogToolsByInventoryFilter(
            toolInventoryCatalogTools,
            option.value,
          );

          return (
            <button
              key={option.value}
              type="button"
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              onClick={() => setToolInventoryFilter(option.value)}
              aria-pressed={active}
              aria-label={`工具库存筛选：${option.label}`}
            >
              {option.label} {count}
            </button>
          );
        })}
      </div>

      {filteredCatalogTools.length > 0 ? (
        filteredCatalogTools.map((entry) => (
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
                  <Badge variant="outline">
                    {formatToolLifecycleLabel(entry.lifecycle)}
                  </Badge>
                  <Badge variant="outline">
                    {formatToolSourceKindLabel(entry.source)}
                  </Badge>
                  <Badge variant="outline">
                    {formatToolPermissionPlaneLabel(entry.permission_plane)}
                  </Badge>
                  {entry.workspace_default_allow ? (
                    <Badge variant="secondary">
                      {agentText(
                        "agentChat.harness.generated.e58fb44bb8",
                        "默认允许",
                      )}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {entry.profiles.map((profile) => (
                    <Badge key={`${entry.name}-${profile}`} variant="outline">
                      {profile}
                    </Badge>
                  ))}
                  {entry.capabilities.map((capability) => (
                    <Badge
                      key={`${entry.name}-${capability}`}
                      variant="outline"
                    >
                      {capability}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3 grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
              <CatalogExecutionPolicyCard
                title={agentText(
                  "agentChat.harness.generated.e9c4556335",
                  "Warning",
                )}
                label={formatExecutionWarningPolicyLabel(
                  entry.execution_warning_policy,
                )}
                source={entry.execution_warning_policy_source}
              />
              <CatalogExecutionPolicyCard
                title={agentText(
                  "agentChat.harness.generated.5de5861112",
                  "Restriction",
                )}
                label={formatExecutionRestrictionProfileLabel(
                  entry.execution_restriction_profile,
                )}
                source={entry.execution_restriction_profile_source}
              />
              <CatalogExecutionPolicyCard
                title={agentText(
                  "agentChat.harness.generated.0a771c36be",
                  "Sandbox",
                )}
                label={formatExecutionSandboxProfileLabel(
                  entry.execution_sandbox_profile,
                )}
                source={entry.execution_sandbox_profile_source}
              />
            </div>
          </div>
        ))
      ) : (
        <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          {agentText(
            "agentChat.harness.generated.e3271612de",
            "当前筛选条件下暂无 catalog 工具。",
          )}
        </div>
      )}
    </div>
  );
}

function CatalogExecutionPolicyCard({
  title,
  label,
  source,
}: {
  title: string;
  label: string;
  source: Parameters<typeof resolveExecutionSourceVariant>[0];
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="mt-1 text-sm text-foreground">{label}</div>
      <div className="mt-2">
        <Badge variant={resolveExecutionSourceVariant(source)}>
          {formatExecutionSourceLabel(source)}
        </Badge>
      </div>
    </div>
  );
}
