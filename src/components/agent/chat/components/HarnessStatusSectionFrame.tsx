import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export type HarnessSectionKey =
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
      className="min-w-0 rounded-xl border border-border bg-background/80 p-4"
    >
      <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold text-foreground">
          {title}
        </h3>
        {badge ? (
          <Badge variant="secondary" className="max-w-full whitespace-normal">
            {badge}
          </Badge>
        ) : null}
      </div>
      {children}
    </section>
  );
}
