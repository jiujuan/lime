import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export type HarnessSectionKey =
  | "team_config"
  | "runtime"
  | "objective"
  | "agentui"
  | "handoff"
  | "reliability"
  | "runtime-facts"
  | "inventory"
  | "file_review"
  | "approvals"
  | "writes"
  | "files"
  | "outputs"
  | "plan"
  | "delegation"
  | "context"
  | "capabilities";

export interface HarnessSectionNavItem {
  key: HarnessSectionKey;
  label: string;
}

export function HarnessStatusSection({
  sectionKey,
  title,
  badge,
  children,
  registerRef,
}: {
  sectionKey?: HarnessSectionKey;
  title: string;
  badge?: string;
  children: ReactNode;
  registerRef?: (key: HarnessSectionKey, node: HTMLElement | null) => void;
}) {
  return (
    <section
      ref={(node) =>
        sectionKey && registerRef ? registerRef(sectionKey, node) : undefined
      }
      data-harness-section={sectionKey}
      className="rounded-xl border border-border bg-background/80 p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </div>
      {children}
    </section>
  );
}
