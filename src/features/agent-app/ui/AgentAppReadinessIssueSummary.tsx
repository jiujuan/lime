import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppCenterHostLifecycleSummary } from "./AgentAppsPageViewModel";
import type { AgentAppReadinessIssueCategory } from "./agentAppReadinessIssueClassification";

interface AgentAppReadinessIssueSummaryProps {
  summary: AppCenterHostLifecycleSummary;
  appId: string;
}

type AgentTranslate = (key: string) => string;

const CATEGORY_LABEL_KEYS: Record<AgentAppReadinessIssueCategory, string> = {
  legacy: "agentApp.apps.center.host.issueCategory.legacy",
  package: "agentApp.apps.center.host.issueCategory.package",
  cloud: "agentApp.apps.center.host.issueCategory.cloud",
  runtime: "agentApp.apps.center.host.issueCategory.runtime",
  capability: "agentApp.apps.center.host.issueCategory.capability",
  permission: "agentApp.apps.center.host.issueCategory.permission",
  resource: "agentApp.apps.center.host.issueCategory.resource",
  taskRuntime: "agentApp.apps.center.host.issueCategory.taskRuntime",
  host: "agentApp.apps.center.host.issueCategory.host",
  unknown: "agentApp.apps.center.host.issueCategory.unknown",
};

export function AgentAppReadinessIssueSummary({
  summary,
  appId,
}: AgentAppReadinessIssueSummaryProps) {
  const { t } = useTranslation("agent");
  const translate: AgentTranslate = (key) =>
    String((t as unknown as AgentTranslate)(key));
  if (summary.issueCategories.length === 0) {
    return null;
  }

  return (
    <div
      className="space-y-2 border-t border-[color:var(--lime-surface-border)] pt-3"
      data-testid={`agent-apps-host-readiness-issues-${appId}`}
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-[color:var(--lime-text-strong)]">
        <AlertTriangle size={14} className="text-amber-600" />
        {t("agentApp.apps.center.host.issueSummary.title")}
      </div>
      <div className="flex flex-wrap gap-2">
        {summary.issueCategories.map((item) => (
          <span
            key={item.category}
            className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
            data-testid={`agent-apps-host-readiness-category-${item.category}`}
          >
            {translate(CATEGORY_LABEL_KEYS[item.category])}
            <span className="ml-1 text-amber-700">{item.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
