import type { AutomationJobRecord } from "@/lib/api/automation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

interface AutomationOverviewFocusCardProps {
  job: AutomationJobRecord | null;
  workspaceName: string | null;
  retiredMessage?: string | null;
  onOpenJobDetails?: () => void;
}

export function AutomationOverviewFocusCard({
  job,
  workspaceName: _workspaceName,
  retiredMessage = null,
  onOpenJobDetails,
}: AutomationOverviewFocusCardProps) {
  const { t } = useTranslation("settings");

  return (
    <Card
      className="rounded-[28px] border-slate-200/80 bg-white shadow-sm shadow-slate-950/5"
      data-testid="automation-overview-focus-card"
    >
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl text-slate-900">
              {t("settings.automation.focus.title")}
            </CardTitle>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {t("settings.automation.focus.description")}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!job ? (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm leading-6 text-slate-500">
            {t("settings.automation.focus.empty")}
          </div>
        ) : null}

        {job ? (
          <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white bg-white px-3 py-1 text-xs font-medium text-slate-700">
                {job.name}
              </span>
            </div>

            {retiredMessage ? (
              <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700">
                {retiredMessage}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {onOpenJobDetails ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-testid="automation-overview-open-job-details"
                  onClick={onOpenJobDetails}
                >
                  {t("settings.automation.focus.action.openJobDetails")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
