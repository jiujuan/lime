import { SkillsPage } from "@/components/skills/SkillsPage";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import {
  interceptHttpExternalLinkClick,
  resolveHttpExternalHref,
} from "@/lib/markdown/externalLinks";
import { useTranslation } from "react-i18next";

const FEEDBACK_URL = "https://github.com/aiclientproxy/lime/issues";

export function ExtensionsSettings() {
  const { t } = useTranslation("settings");
  const feedbackRel = resolveHttpExternalHref(FEEDBACK_URL)
    ? "noreferrer noopener"
    : undefined;

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
            href={FEEDBACK_URL}
            rel={feedbackRel}
            onAuxClick={(event) => {
              interceptHttpExternalLinkClick(event, FEEDBACK_URL);
            }}
            onClick={(event) => {
              interceptHttpExternalLinkClick(event, FEEDBACK_URL);
            }}
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
