import React from "react";
import { Blocks } from "lucide-react";
import {
  resolveInputbarPluginDisplayName,
  type InputbarPluginCapability,
  type InputbarPluginSkillCapability,
} from "../pluginInputCapability";

interface InputbarPluginSelectorProps {
  plugins: readonly InputbarPluginCapability[];
  labels: {
    empty: string;
    skillPrefix: string;
    title: string;
    unavailable: string;
  };
  onSelectPlugin: (
    plugin: InputbarPluginCapability,
    skill?: InputbarPluginSkillCapability,
  ) => void;
}

export const InputbarPluginSelector: React.FC<InputbarPluginSelectorProps> = ({
  plugins,
  labels,
  onSelectPlugin,
}) => {
  if (plugins.length === 0) {
    return (
      <div className="px-3 py-3 text-xs text-slate-400">{labels.empty}</div>
    );
  }

  return (
    <div
      className="space-y-1 bg-white p-1.5"
      data-testid="inputbar-plugin-selector"
    >
      <div className="px-2 pb-1 pt-1 text-[11px] font-medium text-slate-500">
        {labels.title}
      </div>
      {plugins.map((plugin) => {
        const blocked =
          plugin.disabled === true || (plugin.blockerCodes?.length ?? 0) > 0;
        const displayName = resolveInputbarPluginDisplayName(plugin);
        return (
          <div key={plugin.pluginId} className="rounded-lg">
            <button
              type="button"
              data-testid="inputbar-plugin-option"
              disabled={blocked}
              onClick={() => onSelectPlugin(plugin)}
              className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Blocks className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">
                  {displayName}
                </span>
                <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-slate-500">
                  {blocked
                    ? labels.unavailable
                    : plugin.description?.trim() || plugin.pluginId}
                </span>
              </span>
            </button>
            {plugin.skills && plugin.skills.length > 0 ? (
              <div className="mb-1 ml-8 mr-1 grid gap-1">
                {plugin.skills.map((skill) => {
                  const skillBlocked =
                    blocked ||
                    skill.disabled === true ||
                    (skill.blockerCodes?.length ?? 0) > 0;
                  return (
                    <button
                      key={skill.skillId}
                      type="button"
                      data-testid="inputbar-plugin-skill-option"
                      disabled={skillBlocked}
                      onClick={() => onSelectPlugin(plugin, skill)}
                      className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      <span className="shrink-0 font-semibold text-emerald-700">
                        {labels.skillPrefix}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                        {skill.title.trim() || skill.skillId}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
