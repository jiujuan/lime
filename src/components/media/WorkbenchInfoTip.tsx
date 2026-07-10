import { useId, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

type WorkbenchInfoTipTone = "slate" | "sky" | "mint";
type WorkbenchInfoTipVariant = "icon" | "pill";

interface WorkbenchInfoTipProps {
  content: ReactNode;
  ariaLabel: string;
  label?: string;
  tone?: WorkbenchInfoTipTone;
  variant?: WorkbenchInfoTipVariant;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

export function WorkbenchInfoTip(_props: WorkbenchInfoTipProps) {
  const {
    align = "center",
    ariaLabel,
    content,
    label,
    side = "top",
    tone = "slate",
    variant = "icon",
  } = _props;
  const tooltipId = useId();
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-describedby={visible ? tooltipId : undefined}
        className={cn(
          "inline-flex items-center justify-center border text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          toneButtonClassName[tone],
          variant === "pill"
            ? "h-7 gap-1.5 rounded-full px-2.5"
            : "h-6 w-6 rounded-full p-0",
        )}
        onBlur={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onMouseOut={() => setVisible(false)}
        onMouseOver={() => setVisible(true)}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        {variant === "pill" && label ? <span>{label}</span> : null}
      </button>
      {visible ? (
        <span
          id={tooltipId}
          role="tooltip"
          className={cn(
            "absolute z-50 w-[min(280px,calc(100vw-32px))] rounded-lg border bg-white px-3 py-2 text-left text-xs leading-5 text-slate-600 shadow-lg shadow-slate-950/10",
            tonePanelClassName[tone],
            sideClassName[side],
            alignClassName[align],
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}

const toneButtonClassName: Record<WorkbenchInfoTipTone, string> = {
  mint: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 focus-visible:ring-emerald-300",
  sky: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 focus-visible:ring-sky-300",
  slate:
    "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-300",
};

const tonePanelClassName: Record<WorkbenchInfoTipTone, string> = {
  mint: "border-emerald-100",
  sky: "border-sky-100",
  slate: "border-slate-200",
};

const sideClassName: Record<NonNullable<WorkbenchInfoTipProps["side"]>, string> = {
  bottom: "left-1/2 top-full mt-2 -translate-x-1/2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
};

const alignClassName: Record<
  NonNullable<WorkbenchInfoTipProps["align"]>,
  string
> = {
  center: "",
  end: "origin-top-right",
  start: "origin-top-left",
};
