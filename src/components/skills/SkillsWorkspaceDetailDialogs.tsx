import { useTranslation } from "react-i18next";
import type { Skill } from "@/lib/api/skills";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InstalledSkillPresentationCopy } from "./installedSkillPresentation";
import {
  buildMarketplaceIconPlaceholder,
  type SkillStoreItem,
} from "./SkillsWorkspacePageViewModel";
import {
  buildFallbackSkillMarkdown,
  buildInstalledSkillFallbackMarkdown,
} from "./SkillsWorkspacePageContent";
import type {
  InstalledSkillDetailContentState,
  MarketplaceSkillActionState,
  MarketplaceSkillDetailContentState,
} from "./SkillsWorkspacePageTypes";
import { renderSkillMarkdown } from "./skillMarkdownPreview";
import { SkillFileContentPreview, SkillFileTree } from "./skillFilePreview";
import { getSkillFilePreviewContent } from "./skillFilePreviewModel";
import {
  MarketplaceSkillVisual,
  SkillTileSvg,
} from "./SkillsWorkspacePageVisuals";

export function InstalledSkillDetailDialog({
  contentState,
  installedSkillPresentationCopy,
  onClose,
  onSelect,
  onSelectedFilePathChange,
  selectedFilePath,
  skill,
}: {
  contentState: InstalledSkillDetailContentState | null;
  installedSkillPresentationCopy: InstalledSkillPresentationCopy;
  onClose: () => void;
  onSelect: (skill: Skill) => void;
  onSelectedFilePathChange: (path: string) => void;
  selectedFilePath: string;
  skill: Skill | null;
}) {
  const { t } = useTranslation("agent");

  return (
    <Dialog open={Boolean(skill)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="lime-workbench-theme-scope lime-workbench-surface-scope overflow-hidden rounded-[18px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-0 text-[color:var(--lime-text)]"
        maxWidth="max-w-[920px]"
      >
        {skill ? (
          <div
            className="flex max-h-[calc(100vh-3rem)] min-h-[560px] flex-col bg-[color:var(--lime-surface)]"
            data-testid="skills-installed-detail"
          >
            <div className="shrink-0 border-b border-[color:var(--lime-surface-border)] px-6 py-5 pr-14">
              <DialogHeader className="space-y-0 text-left">
                <div className="flex items-center gap-3">
                  <SkillTileSvg tone="slate" />
                  <div className="min-w-0">
                    <DialogTitle className="line-clamp-1 text-[22px] font-semibold leading-7 tracking-[-0.02em] text-[color:var(--lime-text-strong)]">
                      {skill.name}
                    </DialogTitle>
                    <div className="mt-1 line-clamp-1 text-[13px] leading-5 text-[color:var(--lime-text-muted)]">
                      {skill.directory}
                    </div>
                  </div>
                </div>
              </DialogHeader>
            </div>
            <InstalledSkillDetailBody
              contentState={
                contentState?.directory === skill.directory
                  ? contentState
                  : null
              }
              fallback={buildInstalledSkillFallbackMarkdown(
                skill,
                installedSkillPresentationCopy,
              )}
              selectedFilePath={selectedFilePath}
              skill={skill}
              onSelectedFilePathChange={onSelectedFilePathChange}
            />
            <div className="flex shrink-0 justify-end border-t border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-6 py-4">
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-full bg-[color:var(--lime-text-strong)] px-5 text-sm font-semibold text-[color:var(--lime-surface)] shadow-none hover:opacity-90"
                onClick={() => {
                  onSelect(skill);
                  onClose();
                }}
              >
                {t("skills.workspace.installedSkill.action.use")}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function InstalledSkillDetailBody({
  contentState,
  fallback,
  onSelectedFilePathChange,
  selectedFilePath,
  skill,
}: {
  contentState: InstalledSkillDetailContentState | null;
  fallback: string;
  onSelectedFilePathChange: (path: string) => void;
  selectedFilePath: string;
  skill: Skill;
}) {
  const { t } = useTranslation("agent");

  if (!contentState || contentState.status === "loading") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-4 py-8 text-center text-sm text-[color:var(--lime-text-muted)]">
          {t("skills.workspace.marketplace.detail.loadingSkillContent")}
        </div>
      </div>
    );
  }

  if (contentState.status === "error") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700">
          {t("skills.workspace.marketplace.detail.loadSkillContentFailed", {
            message: contentState.message,
          })}
        </div>
        <article className="mx-auto max-w-[760px] pb-8 text-left">
          {renderSkillMarkdown(fallback)}
        </article>
      </div>
    );
  }

  const selectedFile = contentState.files.find(
    (entry) => entry.path === selectedFilePath,
  );
  const selectedFilePreview = getSkillFilePreviewContent(
    selectedFile,
    selectedFile?.path === "SKILL.md"
      ? contentState.content || fallback
      : null,
  );

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
      <aside className="min-h-0 border-r border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)]">
        <div className="border-b border-[color:var(--lime-surface-border)] px-4 py-3">
          <div className="text-[12px] font-semibold text-[color:var(--lime-text-strong)]">
            {t("skills.localPackage.files.title")}
          </div>
          <div className="mt-1 truncate text-[11px] text-[color:var(--lime-text-muted)]">
            {skill.directory}
          </div>
        </div>
        <div className="max-h-full min-h-0 overflow-y-auto p-2">
          <SkillFileTree
            files={contentState.files}
            selectedPath={selectedFilePath}
            onSelect={onSelectedFilePathChange}
            emptyLabel={t("skills.localPackage.files.empty")}
          />
        </div>
      </aside>
      <main className="flex min-h-0 flex-col overflow-hidden bg-[color:var(--lime-surface)]">
        <article className="flex min-h-0 flex-1 flex-col text-left">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--lime-surface-border)] px-6 py-3">
            <h3 className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
              {t("skills.localPackage.preview.title")}
            </h3>
            {selectedFile?.path ? (
              <span className="rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--lime-text-muted)]">
                {selectedFile.path}
              </span>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="mx-auto max-w-[760px] pb-8">
              {selectedFile ? (
                <SkillFileContentPreview
                  content={selectedFilePreview}
                  selectedFile={selectedFile}
                  emptyLabel={t("skills.localPackage.preview.empty")}
                />
              ) : (
                renderSkillMarkdown(contentState.content || fallback)
              )}
            </div>
          </div>
        </article>
      </main>
    </div>
  );
}

export function MarketplaceSkillDetailDialog({
  contentState,
  detailStoreItem,
  findInstalledMarketplaceLocalSkill,
  getMarketplaceSkillActionLabel,
  onClose,
  onPrimaryAction,
  onUninstall,
  resolveMarketplaceSkillActionState,
}: {
  contentState: MarketplaceSkillDetailContentState | null;
  detailStoreItem: SkillStoreItem | null;
  findInstalledMarketplaceLocalSkill: (item: SkillStoreItem) => Skill | undefined;
  getMarketplaceSkillActionLabel: (state: MarketplaceSkillActionState) => string;
  onClose: () => void;
  onPrimaryAction: (item: SkillStoreItem) => void;
  onUninstall: (item: SkillStoreItem) => void;
  resolveMarketplaceSkillActionState: (
    item: SkillStoreItem,
  ) => MarketplaceSkillActionState;
}) {
  const { t } = useTranslation("agent");

  return (
    <Dialog
      open={Boolean(detailStoreItem)}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent
        className="lime-workbench-theme-scope lime-workbench-surface-scope overflow-hidden rounded-[18px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-0 text-[color:var(--lime-text)]"
        maxWidth="max-w-[920px]"
      >
        {detailStoreItem ? (
          <div
            className="flex max-h-[calc(100vh-3rem)] min-h-[560px] flex-col bg-[color:var(--lime-surface)]"
            data-testid="skills-marketplace-detail"
          >
            <div className="shrink-0 border-b border-[color:var(--lime-surface-border)] px-6 py-5 pr-14">
              <DialogHeader className="space-y-0 text-left">
                <div className="flex items-center gap-3">
                  <MarketplaceSkillVisual
                    asset={
                      detailStoreItem.skill.icon ??
                      buildMarketplaceIconPlaceholder(
                        detailStoreItem.skill.title,
                      )
                    }
                    title={detailStoreItem.skill.title}
                  />
                  <div className="min-w-0">
                    <DialogTitle className="line-clamp-1 text-[22px] font-semibold leading-7 tracking-[-0.02em] text-[color:var(--lime-text-strong)]">
                      {detailStoreItem.skill.title}
                    </DialogTitle>
                    <div className="mt-1 line-clamp-1 text-[13px] leading-5 text-[color:var(--lime-text-muted)]">
                      {detailStoreItem.skill.name}
                    </div>
                  </div>
                </div>
              </DialogHeader>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="mb-5 rounded-lg border border-[color:var(--lime-info-border)] bg-[color:var(--lime-info-soft)] px-4 py-3 text-[13px] leading-5 text-[color:var(--lime-info)]">
                {t("skills.workspace.marketplace.detail.sourceNotice")}
              </div>
              <article className="mx-auto max-w-[760px] pb-8 text-left">
                <MarketplaceSkillDetailMarkdown
                  contentState={
                    contentState?.skillName === detailStoreItem.skill.name
                      ? contentState
                      : null
                  }
                  detailStoreItem={detailStoreItem}
                />
              </article>
            </div>
            <div className="flex shrink-0 justify-end border-t border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-6 py-4">
              <MarketplaceSkillDetailActions
                detailStoreItem={detailStoreItem}
                findInstalledMarketplaceLocalSkill={
                  findInstalledMarketplaceLocalSkill
                }
                getMarketplaceSkillActionLabel={getMarketplaceSkillActionLabel}
                onPrimaryAction={onPrimaryAction}
                onUninstall={onUninstall}
                resolveMarketplaceSkillActionState={
                  resolveMarketplaceSkillActionState
                }
              />
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MarketplaceSkillDetailMarkdown({
  contentState,
  detailStoreItem,
}: {
  contentState: MarketplaceSkillDetailContentState | null;
  detailStoreItem: SkillStoreItem;
}) {
  const { t } = useTranslation("agent");

  if (!contentState || contentState.status === "loading") {
    return (
      <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-4 py-8 text-center text-sm text-[color:var(--lime-text-muted)]">
        {t("skills.workspace.marketplace.detail.loadingSkillContent")}
      </div>
    );
  }

  if (contentState.status === "error") {
    return (
      <>
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700">
          {t("skills.workspace.marketplace.detail.loadSkillContentFailed", {
            message: contentState.message,
          })}
        </div>
        {renderSkillMarkdown(buildFallbackSkillMarkdown(detailStoreItem))}
      </>
    );
  }

  return renderSkillMarkdown(contentState.content);
}

function MarketplaceSkillDetailActions({
  detailStoreItem,
  findInstalledMarketplaceLocalSkill,
  getMarketplaceSkillActionLabel,
  onPrimaryAction,
  onUninstall,
  resolveMarketplaceSkillActionState,
}: {
  detailStoreItem: SkillStoreItem;
  findInstalledMarketplaceLocalSkill: (item: SkillStoreItem) => Skill | undefined;
  getMarketplaceSkillActionLabel: (state: MarketplaceSkillActionState) => string;
  onPrimaryAction: (item: SkillStoreItem) => void;
  onUninstall: (item: SkillStoreItem) => void;
  resolveMarketplaceSkillActionState: (
    item: SkillStoreItem,
  ) => MarketplaceSkillActionState;
}) {
  const { t } = useTranslation("agent");
  const actionState = resolveMarketplaceSkillActionState(detailStoreItem);
  const localSkill = findInstalledMarketplaceLocalSkill(detailStoreItem);
  const canUninstall =
    detailStoreItem.source === "official" &&
    Boolean(localSkill) &&
    localSkill?.sourceKind !== "builtin";

  return (
    <div className="flex items-center gap-2">
      {canUninstall ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-full border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-5 text-sm font-semibold text-[color:var(--lime-text)] shadow-none hover:bg-[color:var(--lime-surface-hover)]"
          disabled={actionState === "uninstalling"}
          onClick={() => onUninstall(detailStoreItem)}
        >
          {t("skills.workspace.marketplace.action.uninstall")}
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="h-9 rounded-full bg-[color:var(--lime-text-strong)] px-5 text-sm font-semibold text-[color:var(--lime-surface)] shadow-none hover:opacity-90"
        disabled={actionState === "installing" || actionState === "uninstalling"}
        onClick={() => onPrimaryAction(detailStoreItem)}
      >
        {getMarketplaceSkillActionLabel(actionState)}
      </Button>
    </div>
  );
}
