import React from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import type { Skill } from "@/lib/api/skills";

interface SkillBadgeProps {
  skill: Skill;
  onClear: () => void;
}

export const SkillBadge: React.FC<SkillBadgeProps> = ({ skill, onClear }) => {
  const { t } = useTranslation("agent");
  const removeLabel = t("skills.inputBadge.remove", {
    name: skill.name,
  });

  return (
    <div
      data-testid="input-skill-badge"
      className="mx-1 mt-1 inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-800 shadow-sm shadow-sky-950/5"
      title={`@ ${skill.name}`}
    >
      <span className="text-sky-500">@</span>
      <span className="truncate">{skill.name}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={removeLabel}
        title={removeLabel}
        className="ml-0.5 rounded-full text-sky-700/70 transition hover:bg-sky-100 hover:text-sky-900"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};
