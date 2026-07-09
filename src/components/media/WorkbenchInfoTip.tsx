import type { ReactNode } from "react";

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
  return null;
}
