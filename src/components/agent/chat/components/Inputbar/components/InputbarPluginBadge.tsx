import React from "react";
import { Blocks, X } from "lucide-react";
import {
  resolveInputbarPluginDisplayName,
  type InputbarPluginSelection,
} from "../pluginInputCapability";

interface InputbarPluginBadgeProps {
  selection: InputbarPluginSelection;
  removeLabel: string;
  onClear: () => void;
}

export const InputbarPluginBadge: React.FC<InputbarPluginBadgeProps> = ({
  selection,
  removeLabel,
  onClear,
}) => {
  const pluginLabel = resolveInputbarPluginDisplayName(selection.plugin);
  const skillLabel =
    selection.skill?.title.trim() || selection.skill?.skillId.trim();
  const label = skillLabel ? `${pluginLabel}:${skillLabel}` : pluginLabel;

  return (
    <div
      data-testid="inputbar-plugin-badge"
      className="mx-1 mt-1 inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm shadow-emerald-950/5"
      title={selection.trigger}
    >
      <Blocks className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={removeLabel}
        title={removeLabel}
        className="ml-0.5 rounded-full text-emerald-700/70 transition hover:bg-emerald-100 hover:text-emerald-900"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};
