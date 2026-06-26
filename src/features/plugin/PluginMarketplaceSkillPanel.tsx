import { Play } from "lucide-react";
import { resolvePluginMarketplaceItemLabel } from "./marketplace/pluginMarketplaceActions";
import type { PluginMarketplaceViewItem } from "./marketplace/pluginMarketplaceViewModel";
import type { PluginSkillDeclaration } from "./manifest/types";

export interface PluginMarketplaceSkillPanelProps {
  item: PluginMarketplaceViewItem;
  pending: boolean;
  onOpenSkill: (
    item: PluginMarketplaceViewItem,
    skill: PluginSkillDeclaration,
  ) => void;
  t: (key: string, options?: Record<string, string>) => string;
}

function skillLabel(skill: PluginSkillDeclaration): string {
  return skill.title.trim() || skill.id.trim();
}

export function PluginMarketplaceSkillPanel({
  item,
  pending,
  onOpenSkill,
  t,
}: PluginMarketplaceSkillPanelProps) {
  if (item.skills.length === 0) {
    return null;
  }

  const disabled =
    pending || item.primaryAction.kind !== "open" || item.primaryAction.disabled;
  const itemName = resolvePluginMarketplaceItemLabel(item);

  return (
    <section
      className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
      data-testid="plugin-marketplace-skill-panel"
    >
      <h3 className="m-0 text-sm font-semibold text-emerald-800">
        {t("plugin.marketplace.detail.skills")}
      </h3>
      <p className="mt-2 text-sm leading-6 text-emerald-800">
        {t(
          disabled
            ? "plugin.marketplace.detail.skillsBlocked"
            : "plugin.marketplace.detail.skillsDescription",
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {item.skills.map((skill) => (
          <button
            key={skill.id}
            type="button"
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid={`plugin-marketplace-skill-${item.pluginId}-${skill.id}`}
            disabled={disabled}
            onClick={() => onOpenSkill(item, skill)}
            title={t("plugin.marketplace.skillActionTitle", {
              plugin: itemName,
              skill: skillLabel(skill),
            })}
          >
            <Play className="size-4" aria-hidden="true" />
            {skillLabel(skill)}
          </button>
        ))}
      </div>
    </section>
  );
}
