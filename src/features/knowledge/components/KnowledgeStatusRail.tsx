import { Check, ClipboardCheck, FileText } from "lucide-react";

const STATUS_STEPS = [
  {
    label: "已添加原始资料",
    description: "访谈、产品介绍、规则等内容已保存",
    icon: FileText,
  },
  {
    label: "Lime 已整理",
    description: "已提炼口吻、事实、规则和待补充项",
    icon: ClipboardCheck,
  },
  {
    label: "确认后可用于创作",
    description: "只有确认后的资料才会被创作任务参考",
    icon: Check,
  },
];

export function KnowledgeStatusRail({
  sourceCount,
  compiledCount,
  readyCount,
}: {
  sourceCount: number;
  compiledCount: number;
  readyCount: number;
}) {
  const values = [sourceCount, compiledCount, readyCount];

  return (
    <section className="grid gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 md:grid-cols-3">
      {STATUS_STEPS.map((step, index) => {
        const Icon = step.icon;
        const active = values[index] > 0;
        return (
          <div
            key={step.label}
            className="flex items-start gap-3 rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3"
          >
            <div
              className={
                active
                  ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400"
              }
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-950">
                {step.label}
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                {step.description}
              </div>
              <div className="mt-2 text-xs font-semibold text-slate-700">
                {values[index]} 份
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
