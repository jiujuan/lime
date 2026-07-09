import type { ReactNode } from "react";

interface TooltipProviderProps {
  children: ReactNode;
}

function TooltipProvider({ children }: TooltipProviderProps) {
  return <>{children}</>;
}

interface TooltipProps {
  children: ReactNode;
}

function Tooltip({ children }: TooltipProps) {
  return <>{children}</>;
}

interface TooltipTriggerProps {
  asChild?: boolean;
  children: ReactNode;
}

function TooltipTrigger({ children }: TooltipTriggerProps) {
  return <>{children}</>;
}

interface TooltipContentProps {
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  children: ReactNode;
}

function TooltipContent(_props: TooltipContentProps) {
  return null;
}

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent };
