import { useTranslation } from "react-i18next";
import type { Skill } from "@/lib/api/skills";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ServiceSkillTone } from "@/components/agent/chat/service-skills/types";
import {
  buildMarketplaceIconPlaceholder,
  type SkillStoreItem,
} from "./SkillsWorkspacePageViewModel";
import type { MarketplaceSkillActionState } from "./SkillsWorkspacePageTypes";
import { MarketplaceSkillVisual } from "./SkillsWorkspacePageVisuals";

interface MarketplaceSkillCardActionProps {
  findInstalledMarketplaceLocalSkill: (item: SkillStoreItem) => Skill | undefined;
  getMarketplaceSkillActionLabel: (state: MarketplaceSkillActionState) => string;
  onDetailOpen: (skillName: string) => void;
  onPrimaryAction: (item: SkillStoreItem) => void;
  onUninstall: (item: SkillStoreItem) => void;
  resolveMarketplaceSkillActionState: (
    item: SkillStoreItem,
  ) => MarketplaceSkillActionState;
  selectedStoreItem: SkillStoreItem | null;
}

function MarketplaceSkillCard({
  item,
  index,
  selectedStoreItem,
  findInstalledMarketplaceLocalSkill,
  getMarketplaceSkillActionLabel,
  onDetailOpen,
  onPrimaryAction,
  onUninstall,
  resolveMarketplaceSkillActionState,
}: {
  item: SkillStoreItem;
  index: number;
} & MarketplaceSkillCardActionProps) {
  const { t } = useTranslation("agent");
  const skill = item.skill;
  const tone: ServiceSkillTone =
    index % 4 === 0
      ? "emerald"
      : index % 4 === 1
        ? "sky"
        : index % 4 === 2
          ? "amber"
          : "slate";
  const actionState = resolveMarketplaceSkillActionState(item);
  const iconAsset = skill.icon ?? buildMarketplaceIconPlaceholder(skill.title);
  const isSelected = selectedStoreItem?.skill.name === skill.name;
  const summary =
    skill.summary ||
    skill.bundle?.description ||
    t("skills.workspace.marketplace.defaultOutputHint");
  const secondaryText =
    skill.version ||
    skill.category ||
    t("skills.workspace.marketplace.defaultCategory");
  const localSkill = findInstalledMarketplaceLocalSkill(item) ?? null;
  const canUninstall =
    item.source === "official" &&
    Boolean(localSkill) &&
    localSkill?.sourceKind !== "builtin";
  const actionDisabled =
    actionState === "installing" || actionState === "uninstalling";

  return (
    <article
      className={cn(
        "group flex min-h-[132px] flex-col rounded-[10px] border bg-[color:var(--lime-surface)] p-4 text-left shadow-sm shadow-[color:var(--lime-shadow-color)] transition hover:border-[color:var(--lime-surface-border-strong)] hover:bg-[color:var(--lime-surface-hover)] hover:shadow-md",
        isSelected
          ? "border-[color:var(--lime-surface-border-strong)] ring-1 ring-[color:var(--lime-surface-border-strong)]"
          : "border-[color:var(--lime-surface-border)]",
      )}
      data-testid="skills-marketplace-card"
    >
      <div className="flex items-start gap-3">
        <MarketplaceSkillVisual
          asset={iconAsset}
          title={skill.title}
          tone={tone}
        />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 text-[15px] font-semibold leading-5 text-[color:var(--lime-text-strong)]">
            {skill.title}
          </h3>
          <p className="mt-0.5 line-clamp-1 text-[12px] leading-4 text-[color:var(--lime-text-muted)]">
            {skill.name}
          </p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 flex-1 text-[13px] leading-5 text-[color:var(--lime-text)]">
        {summary}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3 text-[12px] leading-4 text-[color:var(--lime-text-muted)]">
        <span className="line-clamp-1">{secondaryText}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {canUninstall ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-full px-2.5 text-[12px] font-semibold text-[color:var(--lime-warning)] hover:bg-[color:var(--lime-warning-soft)]"
              disabled={actionDisabled}
              onClick={() => onUninstall(item)}
            >
              {t("skills.workspace.marketplace.action.uninstall")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-full px-2.5 text-[12px] font-semibold text-[color:var(--lime-text)] hover:bg-[color:var(--lime-surface-hover)]"
            onClick={() => onDetailOpen(skill.name)}
          >
            {t("skills.workspace.marketplace.action.detail")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 rounded-full bg-[color:var(--lime-text-strong)] px-3 text-[12px] font-semibold text-[color:var(--lime-surface)] shadow-none hover:opacity-90"
            disabled={actionDisabled}
            onClick={() => onPrimaryAction(item)}
          >
            {getMarketplaceSkillActionLabel(actionState)}
          </Button>
        </div>
      </div>
    </article>
  );
}

export function MarketplaceSkillSection({
  title,
  items,
  startIndex = 0,
  meta,
  ...cardProps
}: {
  title: string;
  items: SkillStoreItem[];
  startIndex?: number;
  meta?: string;
} & MarketplaceSkillCardActionProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[color:var(--lime-text-strong)]">
          {title}
        </h2>
        {meta ? (
          <span className="text-[12px] leading-5 text-[color:var(--lime-text-muted)]">
            {meta}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <MarketplaceSkillCard
            key={`${item.source}:${item.skill.name}`}
            item={item}
            index={startIndex + index}
            {...cardProps}
          />
        ))}
      </div>
    </section>
  );
}
