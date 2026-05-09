import React from "react";
import { Brain, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModelCapabilities } from "@/lib/types/modelRegistry";

interface CapabilityBadgeProps {
  active: boolean;
  icon: React.ReactNode;
  activeLabel: string;
  inactiveLabel: string;
  activeClassName: string;
  compact?: boolean;
}

interface ModelCapabilityBadgesProps {
  capabilities: ModelCapabilities;
  className?: string;
  compact?: boolean;
  showNegative?: boolean;
}

function CapabilityBadge({
  active,
  icon,
  activeLabel,
  inactiveLabel,
  activeClassName,
  compact = false,
}: CapabilityBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
        compact ? "text-[10px] leading-4" : "text-[11px] leading-4",
        active
          ? activeClassName
          : "border-slate-200/80 bg-slate-100/80 text-slate-500",
      )}
    >
      {icon}
      <span>{active ? activeLabel : inactiveLabel}</span>
    </span>
  );
}

export const ModelCapabilityBadges: React.FC<ModelCapabilityBadgesProps> = ({
  capabilities,
  className,
  compact = false,
  showNegative = true,
}) => {
  const capabilityItems = [
    {
      key: "reasoning",
      active: capabilities.reasoning,
      icon: <Brain className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />,
      activeLabel: "支持思考",
      inactiveLabel: "无思考",
      activeClassName:
        "border-violet-200/90 bg-violet-50/90 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200",
    },
    {
      key: "vision",
      active: capabilities.vision,
      icon: <Eye className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />,
      activeLabel: "支持多模态",
      inactiveLabel: "无多模态",
      activeClassName:
        "border-sky-200/90 bg-sky-50/90 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
    },
  ];

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {capabilityItems
        .filter((item) => item.active || showNegative)
        .map((item) => (
          <CapabilityBadge
            key={item.key}
            active={item.active}
            icon={item.icon}
            activeLabel={item.activeLabel}
            inactiveLabel={item.inactiveLabel}
            activeClassName={item.activeClassName}
            compact={compact}
          />
        ))}
    </div>
  );
};
