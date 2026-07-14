import { Eye, ShieldAlert } from "lucide-react";
import type {
  AgentRuntimeEvidenceBrowserActionIndex,
  AgentRuntimeEvidenceLimeCorePolicyIndex,
  AgentRuntimeEvidenceLimeCorePolicyItem,
} from "@/lib/api/agentRuntime/evidenceTypes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  collectLimeCorePolicyMissingInputs,
  collectLimeCorePolicyRefKeys,
  formatBrowserActionArtifactKindLabel,
  formatBrowserActionStatusLabel,
  formatLimeCorePolicyDecisionLabel,
  formatLimeCorePolicyInputSourceLabel,
  formatLimeCorePolicyInputStatusLabel,
  formatLimeCorePolicyStatusLabel,
  summarizeLimeCorePolicyDecision,
  uniqueNonEmptyStrings,
} from "./harnessStatusPanelViewModel";
import { InventoryStatCard } from "./HarnessStatusPanelPrimitives";
import { agentText } from "./harnessPanelText";

export function BrowserActionIndexSummarySection({
  index,
  onOpenReplay,
}: {
  index: AgentRuntimeEvidenceBrowserActionIndex;
  onOpenReplay?: () => void;
}) {
  if (index.action_count <= 0 && index.items.length === 0) {
    return null;
  }

  const recentItems = index.items.slice(-3).reverse();
  const latestUrl =
    index.last_url ||
    recentItems.find((item) => item.last_url)?.last_url ||
    "暂无 URL";

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-sky-950">
        <Eye className="h-4 w-4 text-sky-700" />
        <span>
          {agentText(
            "agentChat.harness.generated.a8d571b990",
            "Browser Assist 索引",
          )}
        </span>
      </div>
      <p className="mt-1 text-xs text-sky-800">
        {agentText(
          "agentChat.harness.generated.47e2036a10",
          "来自 modalityRuntimeContracts.snapshotIndex.browserActionIndex，复盘 browser_session / browser_snapshot 的执行证据。",
        )}
      </p>

      {onOpenReplay ? (
        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2 bg-background"
            onClick={onOpenReplay}
            aria-label={agentText(
              "agentChat.harness.generated.38ccfba4fd",
              "打开 Browser Assist 复盘",
            )}
          >
            <Eye className="h-4 w-4" />
            {agentText("agentChat.harness.generated.e0dfe06ac9", "打开复盘")}
          </Button>
        </div>
      ) : null}

      <div className="mt-3 grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.e5d6795411",
            "浏览器动作",
          )}
          value={`${index.action_count}`}
          hint="browser_control action"
        />
        <InventoryStatCard
          title={agentText("agentChat.harness.generated.836ffe0e10", "会话")}
          value={`${index.session_count}`}
          hint={
            index.profile_keys.length > 0
              ? `profile ${index.profile_keys.slice(0, 2).join(" / ")}`
              : "session / target"
          }
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.17e12280d3",
            "观察 / 截图",
          )}
          value={`${index.observation_count} / ${index.screenshot_count}`}
          hint="observation / screenshot"
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.bf662d18eb",
            "最近 URL",
          )}
          value={latestUrl === "暂无 URL" ? latestUrl : "已记录"}
          hint={latestUrl}
        />
      </div>

      {recentItems.length > 0 ? (
        <div className="mt-3 space-y-2">
          {recentItems.map((item, indexInList) => {
            const itemKey = [
              item.request_id,
              item.session_id,
              item.action,
              indexInList,
            ]
              .filter(Boolean)
              .join(":");
            return (
              <div
                key={itemKey}
                className="rounded-lg border border-sky-200/80 bg-background/85 p-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {item.action || item.tool_name || "browser action"}
                  </span>
                  <Badge variant="outline">
                    {formatBrowserActionArtifactKindLabel(item.artifact_kind)}
                  </Badge>
                  <Badge
                    variant={
                      item.success === false ? "destructive" : "secondary"
                    }
                  >
                    {formatBrowserActionStatusLabel(item)}
                  </Badge>
                  {item.backend ? (
                    <Badge variant="outline">{item.backend}</Badge>
                  ) : null}
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {item.last_url ? (
                    <div className="break-all">
                      {agentText(
                        "agentChat.harness.generated.6e1359115e",
                        "URL：",
                      )}
                      <span className="ml-1 font-mono text-foreground">
                        {item.last_url}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {item.session_id ? (
                      <span>
                        {agentText(
                          "agentChat.harness.generated.d0d6758917",
                          "session：",
                        )}
                        <span className="ml-1 font-mono text-foreground">
                          {item.session_id}
                        </span>
                      </span>
                    ) : null}
                    {item.target_id ? (
                      <span>
                        {agentText(
                          "agentChat.harness.generated.2b252e0cfe",
                          "target：",
                        )}
                        <span className="ml-1 font-mono text-foreground">
                          {item.target_id}
                        </span>
                      </span>
                    ) : null}
                    {item.entry_source ? (
                      <span>
                        {agentText(
                          "agentChat.harness.generated.dd1909c1cb",
                          "entry：",
                        )}
                        <span className="ml-1 font-mono text-foreground">
                          {item.entry_source}
                        </span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function LimeCorePolicyItemCard({
  item,
}: {
  item: AgentRuntimeEvidenceLimeCorePolicyItem;
}) {
  const missingInputs = uniqueNonEmptyStrings([
    ...(item.missing_inputs ?? []),
    ...(item.unresolved_refs ?? []),
  ]);
  const policyInputs = item.policy_inputs ?? [];
  const policyInputPreview = policyInputs.slice(0, 4);
  const contractLabel = item.contract_key || "runtime_contract";

  return (
    <div className="rounded-lg border border-amber-200/80 bg-background/85 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">
          {contractLabel}
        </span>
        <Badge variant="outline">
          {formatLimeCorePolicyStatusLabel(item.status)}
        </Badge>
        <Badge variant={item.decision === "deny" ? "destructive" : "secondary"}>
          {formatLimeCorePolicyDecisionLabel(item.decision)}
        </Badge>
        {item.decision_source ? (
          <Badge variant="outline">{item.decision_source}</Badge>
        ) : null}
      </div>

      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {item.execution_profile_key ? (
            <span>
              {agentText("agentChat.harness.generated.6a0ea95fa7", "profile：")}
              <span className="ml-1 font-mono text-foreground">
                {item.execution_profile_key}
              </span>
            </span>
          ) : null}
          {item.executor_adapter_key ? (
            <span>
              {agentText("agentChat.harness.generated.adc8d92098", "adapter：")}
              <span className="ml-1 font-mono text-foreground">
                {item.executor_adapter_key}
              </span>
            </span>
          ) : null}
          {item.decision_scope ? (
            <span>
              {agentText("agentChat.harness.generated.09819d76d1", "scope：")}
              <span className="ml-1 font-mono text-foreground">
                {item.decision_scope}
              </span>
            </span>
          ) : null}
        </div>
        {item.decision_reason ? (
          <div>
            {agentText("agentChat.harness.generated.0f93c2bb0a", "原因：")}
            <span className="ml-1 text-foreground">{item.decision_reason}</span>
          </div>
        ) : null}
        <div>
          {agentText("agentChat.harness.generated.5a00a7de0d", "refs：")}
          <span className="ml-1 font-mono text-foreground">
            {item.refs.length > 0 ? item.refs.join(" / ") : "暂无"}
          </span>
        </div>
        {missingInputs.length > 0 ? (
          <div>
            {agentText("agentChat.harness.generated.dcd0ea07f2", "missing：")}
            <span className="ml-1 font-mono text-foreground">
              {missingInputs.join(" / ")}
            </span>
          </div>
        ) : null}
      </div>

      {policyInputPreview.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {policyInputPreview.map((input) => (
            <Badge
              key={`${contractLabel}:${input.ref_key}`}
              variant="outline"
              className="border-amber-300 bg-amber-50 text-amber-800"
            >
              {input.ref_key} ·{" "}
              {formatLimeCorePolicyInputStatusLabel(input.status)} ·{" "}
              {formatLimeCorePolicyInputSourceLabel(input.value_source)}
            </Badge>
          ))}
          {policyInputs.length > policyInputPreview.length ? (
            <Badge variant="outline">
              +{policyInputs.length - policyInputPreview.length}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function LimeCorePolicyIndexSummarySection({
  index,
}: {
  index: AgentRuntimeEvidenceLimeCorePolicyIndex;
}) {
  const refKeys = collectLimeCorePolicyRefKeys(index);
  const missingInputs = collectLimeCorePolicyMissingInputs(index);
  const recentItems = index.items.slice(-3).reverse();

  if (index.snapshot_count <= 0 && recentItems.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-950">
        <ShieldAlert className="h-4 w-4 text-amber-700" />
        <span>
          {agentText(
            "agentChat.harness.generated.5ff0237c2a",
            "LimeCore 策略缺口",
          )}
        </span>
      </div>
      <p className="mt-1 text-xs text-amber-800">
        {agentText(
          "agentChat.harness.generated.dd61dfc98f",
          "来自 modalityRuntimeContracts.snapshotIndex.limecorePolicyIndex；当前 allow 仅代表本地默认未阻断，missing inputs 仍等待 LimeCore 控制面命中。",
        )}
      </p>

      <div className="mt-3 grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.9862eec754",
            "策略快照",
          )}
          value={`${index.snapshot_count}`}
          hint="runtime contract snapshots"
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.1bdaad7e35",
            "控制面引用",
          )}
          value={`${refKeys.length}`}
          hint={refKeys.slice(0, 3).join(" / ") || "暂无 refs"}
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.f60047f6ac",
            "缺失输入",
          )}
          value={`${missingInputs.length}`}
          hint={missingInputs.slice(0, 3).join(" / ") || "暂无缺口"}
        />
        <InventoryStatCard
          title={agentText(
            "agentChat.harness.generated.6b803cba6a",
            "策略决策",
          )}
          value={summarizeLimeCorePolicyDecision(index)}
          hint="allow / ask / deny"
        />
      </div>

      {missingInputs.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {missingInputs.map((input) => (
            <Badge
              key={input}
              variant="outline"
              className="border-amber-300 bg-background text-amber-800"
            >
              {input}
            </Badge>
          ))}
        </div>
      ) : null}

      {recentItems.length > 0 ? (
        <div className="mt-3 space-y-2">
          {recentItems.map((item, indexInList) => (
            <LimeCorePolicyItemCard
              key={[
                item.contract_key,
                item.execution_profile_key,
                item.executor_adapter_key,
                indexInList,
              ]
                .filter(Boolean)
                .join(":")}
              item={item}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
