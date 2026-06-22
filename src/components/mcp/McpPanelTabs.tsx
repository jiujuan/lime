import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { McpTab, McpTabDefinition } from "./mcpPanelModel";

interface McpPanelTabsProps {
  tabs: readonly McpTabDefinition[];
  activeTab: McpTab;
  onTabChange: (tab: McpTab) => void;
  getTabCount: (tab: McpTab) => number;
}

export function McpPanelTabs({
  tabs,
  activeTab,
  onTabChange,
  getTabCount,
}: McpPanelTabsProps) {
  const { t } = useTranslation("settings");

  return (
    <div className="rounded-[26px] border border-slate-200/80 bg-white p-1.5 shadow-sm shadow-slate-950/5">
      <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-5">
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          const tabCount = getTabCount(tab.id);
          const selected = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              data-testid={`mcp-panel-tab-${tab.id}`}
              className={cn(
                "flex items-center justify-between gap-3 rounded-[20px] px-4 py-3 text-left text-sm font-medium transition",
                selected
                  ? "bg-slate-950 text-white shadow-sm shadow-slate-950/15"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-950",
              )}
            >
              <span className="flex items-center gap-2">
                <TabIcon className="h-4 w-4" />
                {t(tab.labelKey)}
              </span>
              {tabCount > 0 && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    selected
                      ? "bg-white/15 text-white"
                      : "bg-slate-100 text-slate-500",
                  )}
                >
                  {tabCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
