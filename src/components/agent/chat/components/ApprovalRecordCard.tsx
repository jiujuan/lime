import React from "react";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ApprovalRecordViewModel } from "./timeline-utils/approvalRecord";

function statusBadgeVariant(
  status: ApprovalRecordViewModel["status"],
): React.ComponentProps<typeof Badge>["variant"] {
  switch (status) {
    case "declined":
    case "cancelled":
    case "expired":
    case "failed":
      return "outline";
    default:
      return "secondary";
  }
}

export function ApprovalRecordCard({
  record,
  className,
}: {
  record: ApprovalRecordViewModel;
  className?: string;
}) {
  const { t } = useTranslation("agent");
  const title =
    record.toolName || t("agentChat.threadTimeline.approval.record.title");
  const statusLabel = t(
    `agentChat.threadTimeline.approval.record.status.${record.status}`,
  );

  return (
    <div
      data-testid="timeline-approval-record"
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 shadow-sm shadow-slate-950/5",
        className,
      )}
    >
      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
      <span className="min-w-0 truncate font-medium text-slate-800">
        {title}
      </span>
      <span aria-hidden="true" className="shrink-0 text-slate-300">
        ·
      </span>
      <Badge
        variant={statusBadgeVariant(record.status)}
        className="h-5 shrink-0 px-1.5 text-[11px] font-medium"
      >
        {statusLabel}
      </Badge>
    </div>
  );
}
