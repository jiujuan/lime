import { SkillsPage } from "@/components/skills/SkillsPage";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import { useTranslation } from "react-i18next";

export function ExtensionsSettings() {
  const { t } = useTranslation("settings");

  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span>
            {t("settings.agent.skills.advancedEntry.title", "高级技能入口")}
          </span>
          <WorkbenchInfoTip
            ariaLabel={t(
              "settings.agent.skills.advancedEntry.tipAria",
              "高级技能入口说明",
            )}
            content={t(
              "settings.agent.skills.advancedEntry.tip",
              "Claw 左侧导航已经提供面向最终用户的技能主入口；这里仅保留本地导入、仓库管理与标准检查等高级能力。",
            )}
            tone="slate"
          />
          <a
            href="https://github.com/aiclientproxy/lime/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 text-primary hover:underline"
          >
            {t("settings.agent.skills.advancedEntry.feedback", "问题反馈")}
          </a>
        </div>
      </div>

      <div>
        <SkillsPage hideHeader />
      </div>
    </div>
  );
}
