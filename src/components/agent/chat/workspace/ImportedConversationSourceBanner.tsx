import { History } from "lucide-react";
import type { GeneralWorkbenchTaskRailContextItem } from "../components/generalWorkbenchTaskRailViewModel";

export function ImportedConversationSourceBanner({
  item,
}: {
  item: GeneralWorkbenchTaskRailContextItem;
}) {
  const detailLabels = item.detailLabels?.filter(Boolean) ?? [];

  return (
    <section
      className="rounded-[18px] border border-emerald-200/80 bg-emerald-50/75 px-3.5 py-3 text-sm text-emerald-950 shadow-sm shadow-emerald-950/5"
      data-testid="imported-source-banner"
      title={item.title || undefined}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-700">
          <History className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-emerald-950">{item.value}</span>
            {item.detailStatus ? (
              <span
                className={[
                  "rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-4",
                  item.detailStatus.tone === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-emerald-200 bg-white text-emerald-700",
                ].join(" ")}
                title={item.detailStatus.title || undefined}
              >
                {item.detailStatus.label}
              </span>
            ) : null}
          </div>
          {detailLabels.length > 0 || item.detailOverflowLabel ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {detailLabels.map((label) => (
                <span
                  key={label}
                  className="max-w-[132px] truncate rounded-md bg-white/80 px-1.5 py-0.5 text-[11px] leading-4 text-emerald-800"
                  title={label}
                >
                  {label}
                </span>
              ))}
              {item.detailOverflowLabel ? (
                <span className="rounded-md px-1.5 py-0.5 text-[11px] leading-4 text-emerald-700/75">
                  {item.detailOverflowLabel}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
