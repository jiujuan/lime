import type { KnowledgePackStatus } from "@/lib/api/knowledge";

export type KnowledgeView =
  | "overview"
  | "import"
  | "detail"
  | "save"
  | "states";
export type DetailTab =
  | "overview"
  | "content"
  | "sources"
  | "runtime"
  | "risks"
  | "runs";

export const STATUS_LABELS: Record<string, string> = {
  draft: "待确认",
  ready: "已可用",
  "needs-review": "待确认",
  stale: "需要补充",
  disputed: "需要补充",
  missing: "需要补充",
  partial: "需要补充",
  failed: "整理失败",
  error: "整理失败",
  archived: "已归档",
};

export const STATUS_CLASS_NAMES: Record<string, string> = {
  draft: "border-amber-200 bg-amber-50 text-amber-700",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "needs-review": "border-amber-200 bg-amber-50 text-amber-700",
  stale: "border-rose-200 bg-rose-50 text-rose-700",
  disputed: "border-rose-200 bg-rose-50 text-rose-700",
  missing: "border-rose-200 bg-rose-50 text-rose-700",
  partial: "border-rose-200 bg-rose-50 text-rose-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  error: "border-red-200 bg-red-50 text-red-700",
  archived: "border-slate-200 bg-slate-100 text-slate-500",
};

export const PACK_TYPES = [
  {
    value: "personal-ip",
    label: "个人 IP",
    description: "创始人介绍、故事素材、表达风格和商务话术。",
  },
  {
    value: "brand-product",
    label: "品牌产品",
    description: "品牌定位、产品事实、功效边界和客服口径。",
  },
  {
    value: "organization-knowhow",
    label: "组织 Know-how",
    description: "团队 SOP、交付方法、升级路径和不可回答边界。",
  },
  {
    value: "content-operations",
    label: "内容运营",
    description: "选题日历、栏目节奏、素材复用和发布复盘。",
  },
  {
    value: "private-domain-operations",
    label: "私域 / 社群运营",
    description: "社群 SOP、触达节奏、分层转化和话术边界。",
  },
  {
    value: "live-commerce-operations",
    label: "直播运营",
    description: "直播排期、场控流程、互动话术和复盘指标。",
  },
  {
    value: "campaign-operations",
    label: "活动 / Campaign",
    description: "活动节奏、渠道分工、物料清单和风险预案。",
  },
  {
    value: "growth-strategy",
    label: "增长策略",
    description: "渠道策略、投放假设、转化漏斗和复盘结论。",
  },
] as const;

export const VIEW_TABS: Array<{
  id: KnowledgeView;
  label: string;
  description: string;
}> = [
  { id: "overview", label: "资料首页", description: "状态和下一步" },
  { id: "import", label: "整理新资料", description: "添加原始资料" },
  { id: "detail", label: "确认资料", description: "检查完整文档" },
  { id: "save", label: "保存到项目资料", description: "把好内容存回来" },
  { id: "states", label: "状态说明", description: "看懂每类状态" },
];

export const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "确认清单" },
  { id: "content", label: "完整资料文档" },
  { id: "sources", label: "原始资料" },
  { id: "runtime", label: "本轮使用摘要" },
  { id: "risks", label: "缺口与风险" },
  { id: "runs", label: "高级信息" },
];

export function resolveStatusLabel(status: KnowledgePackStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function resolveStatusClassName(status: KnowledgePackStatus): string {
  return STATUS_CLASS_NAMES[status] ?? STATUS_CLASS_NAMES.draft;
}

export function getPackTypeLabel(value?: string | null): string {
  const normalized =
    value === "personal-profile"
      ? "personal-ip"
      : value === "custom:lime-growth-strategy"
        ? "growth-strategy"
        : value;
  return (
    PACK_TYPES.find((type) => type.value === normalized)?.label ??
    normalized ??
    "自定义"
  );
}
