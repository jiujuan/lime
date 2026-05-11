import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ResourceManagerItem } from "./types";

interface PdfResourceRendererProps {
  item: ResourceManagerItem;
}

export function PdfResourceRenderer({ item }: PdfResourceRendererProps) {
  const { t } = useTranslation("workspace");
  const src = item.src?.trim();

  if (!src) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#f5f6f8] px-6 text-center text-slate-500">
        <div className="max-w-sm rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm shadow-slate-950/5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-slate-950">
            {t("workspace.resourceManager.pdf.missingTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {t("workspace.resourceManager.pdf.missingDescription")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      key={item.id}
      src={src}
      title={item.title || t("workspace.resourceManager.pdf.frameTitle")}
      data-testid="resource-manager-pdf-frame"
      className="min-h-0 flex-1 border-0 bg-white"
    />
  );
}
