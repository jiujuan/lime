import type { ReactNode } from "react";

interface HelpTipProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  variant?: "blue" | "amber" | "green";
}

export function HelpTip({
  title: _title,
  children: _children,
  defaultOpen: _defaultOpen = false,
  variant: _variant = "blue",
}: HelpTipProps) {
  return null;
}
