import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

interface AutomationJobFocusStripProps {
  jobId: string;
  retiredMessage?: string | null;
}

export function AutomationJobFocusStrip({
  jobId,
  retiredMessage = null,
}: AutomationJobFocusStripProps) {
  const { t } = useTranslation("settings");
  const translate = t as (key: string) => string;

  return (
    <div
      data-testid={`automation-job-focus-strip-${jobId}`}
      className="mt-3 rounded-[18px] border border-sky-200/80 bg-sky-50/80 px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-sky-200 bg-white text-sky-700 hover:bg-white">
          {translate("settings.automation.focus.label")}
        </Badge>
      </div>

      {retiredMessage ? (
        <div className="mt-2 text-xs leading-6 text-amber-700">
          {retiredMessage}
        </div>
      ) : null}
    </div>
  );
}
