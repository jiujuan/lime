import { useTranslation } from "react-i18next";
import type { InstalledAppPreview } from "../types";

export function CapabilityTable({ preview }: { preview: InstalledAppPreview }) {
  const { t } = useTranslation("agent");
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">
              {t("plugin.lab.capability.name")}
            </th>
            <th className="px-4 py-3 font-medium">
              {t("plugin.lab.capability.range")}
            </th>
            <th className="px-4 py-3 font-medium">
              {t("plugin.lab.capability.source")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {preview.projection.requiredCapabilities.map((requirement) => (
            <tr
              key={`${requirement.capability}:${requirement.entryKey ?? "app"}`}
            >
              <td className="px-4 py-3 font-mono text-xs text-slate-700">
                {requirement.capability}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">
                {requirement.requestedRange}
              </td>
              <td className="px-4 py-3 text-xs text-slate-600">
                {requirement.declaredBy.join(" / ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
