import { SkillsPage } from "@/components/skills/SkillsPage";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import { useTranslation } from "react-i18next";

export function ExtensionsSettings() {
  const { t } = useTranslation("settings");

  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span>{t("settings.agent.skills.advancedEntry.title")}</span>
          <WorkbenchInfoTip
            ariaLabel={t("settings.agent.skills.advancedEntry.tipAria")}
            content={t("settings.agent.skills.advancedEntry.tip")}
            tone="slate"
          />
          <a
            href="https://github.com/aiclientproxy/lime/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 text-primary hover:underline"
          >
            {t("settings.agent.skills.advancedEntry.feedback")}
          </a>
        </div>
      </div>

      <div>
        <SkillsPage hideHeader />
      </div>
    </div>
  );
}
