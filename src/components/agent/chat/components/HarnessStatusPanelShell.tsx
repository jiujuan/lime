import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, Loader2, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { SummaryCard } from "./HarnessStatusPanelPrimitives";
import type {
  HarnessSectionKey,
  HarnessSectionNavItem,
} from "./HarnessStatusSectionFrame";
import type {
  HarnessStatusPanelLayout,
  HarnessSummaryCard,
} from "./HarnessStatusPanelTypes";
import { agentText } from "./harnessPanelText";

interface HarnessStatusPanelShellProps {
  layout: HarnessStatusPanelLayout;
  title: string;
  description: string;
  toggleLabel: string;
  isDetailsExpanded: boolean;
  realTeamActive: boolean;
  leadContent?: ReactNode;
  summaryCards: HarnessSummaryCard[];
  availableSections: HarnessSectionNavItem[];
  children: ReactNode;
  onToggleExpanded: () => void;
  onScrollToSection: (key: HarnessSectionKey) => void;
}

export function HarnessStatusPanelShell({
  layout,
  title,
  description,
  toggleLabel,
  isDetailsExpanded,
  realTeamActive,
  leadContent,
  summaryCards,
  availableSections,
  children,
  onToggleExpanded,
  onScrollToSection,
}: HarnessStatusPanelShellProps) {
  const isDialogLayout = layout === "dialog";

  return (
    <div
      data-testid="harness-status-panel"
      data-layout={layout}
      className={cn(
        "lime-workbench-theme-scope lime-workbench-surface-scope text-[color:var(--lime-text)]",
        layout === "sidebar"
          ? "rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)]"
          : layout === "dialog"
            ? "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)]"
            : "mx-3 mt-2 rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)]",
      )}
    >
      <HarnessPanelHeader
        isDialogLayout={isDialogLayout}
        title={title}
        description={description}
        toggleLabel={toggleLabel}
        isDetailsExpanded={isDetailsExpanded}
        realTeamActive={realTeamActive}
        onToggleExpanded={onToggleExpanded}
      />

      {!isDialogLayout && leadContent ? (
        <div className="border-b border-border px-4 py-4">{leadContent}</div>
      ) : null}

      {!isDialogLayout ? (
        <HarnessSummaryCardsGrid
          layout={layout}
          summaryCards={summaryCards}
          compact={false}
          onScrollToSection={onScrollToSection}
        />
      ) : null}

      {isDetailsExpanded ? (
        <ScrollArea
          className={cn(
            "border-t border-border px-4 py-4",
            layout === "sidebar"
              ? "max-h-[24rem]"
              : layout === "dialog"
                ? "flex-1 min-h-0 overscroll-contain px-5"
                : "max-h-[28rem]",
          )}
        >
          <div className="space-y-4 pb-1">
            {isDialogLayout && leadContent ? (
              <div className="pt-4">{leadContent}</div>
            ) : null}

            {isDialogLayout ? (
              <HarnessSummaryCardsGrid
                layout={layout}
                summaryCards={summaryCards}
                compact={true}
                onScrollToSection={onScrollToSection}
              />
            ) : null}

            <HarnessSectionJumpNav
              availableSections={availableSections}
              onScrollToSection={onScrollToSection}
            />

            {children}
          </div>
        </ScrollArea>
      ) : null}
    </div>
  );
}

function HarnessPanelHeader({
  isDialogLayout,
  title,
  description,
  toggleLabel,
  isDetailsExpanded,
  realTeamActive,
  onToggleExpanded,
}: {
  isDialogLayout: boolean;
  title: string;
  description: string;
  toggleLabel: string;
  isDetailsExpanded: boolean;
  realTeamActive: boolean;
  onToggleExpanded: () => void;
}) {
  return (
    <div
      data-harness-drag-handle={isDialogLayout ? "true" : undefined}
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border px-4 py-3",
        isDialogLayout &&
          "shrink-0 cursor-grab select-none px-5 py-4 active:cursor-grabbing",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {realTeamActive ? (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {agentText(
                "agentChat.harness.generated.8e5dbad1d1",
                "任务进行中",
              )}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {!isDialogLayout ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="shrink-0"
          onClick={onToggleExpanded}
          aria-expanded={isDetailsExpanded}
          aria-label={
            isDetailsExpanded ? `折叠${toggleLabel}` : `展开${toggleLabel}`
          }
        >
          {isDetailsExpanded ? (
            <ChevronDown className="mr-1 h-4 w-4" />
          ) : (
            <ChevronRight className="mr-1 h-4 w-4" />
          )}
          {isDetailsExpanded ? `收起${toggleLabel}` : `展开${toggleLabel}`}
        </Button>
      ) : null}
    </div>
  );
}

function HarnessSummaryCardsGrid({
  layout,
  summaryCards,
  compact,
  onScrollToSection,
}: {
  layout: HarnessStatusPanelLayout;
  summaryCards: HarnessSummaryCard[];
  compact: boolean;
  onScrollToSection: (key: HarnessSectionKey) => void;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        compact ? "pt-1 sm:grid-cols-2 xl:grid-cols-5" : "px-4 py-4",
        !compact &&
          (layout === "sidebar"
            ? "grid-cols-1"
            : "md:grid-cols-2 xl:grid-cols-4"),
      )}
    >
      {summaryCards.map((card) => (
        <SummaryCard
          key={card.title}
          title={card.title}
          value={card.value}
          hint={card.hint}
          icon={card.icon}
          onClick={() => onScrollToSection(card.sectionKey)}
          compact={compact}
        />
      ))}
    </div>
  );
}

function HarnessSectionJumpNav({
  availableSections,
  onScrollToSection,
}: {
  availableSections: HarnessSectionNavItem[];
  onScrollToSection: (key: HarnessSectionKey) => void;
}) {
  if (availableSections.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {availableSections.map((item) => (
        <button
          key={item.key}
          type="button"
          className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          onClick={() => onScrollToSection(item.key)}
          aria-label={`跳转到${item.label}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
