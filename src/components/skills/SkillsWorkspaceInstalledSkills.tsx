import type { ReactNode } from "react";
import {
  BookOpen,
  Download,
  FolderOpen,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Skill } from "@/lib/api/skills";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { InstalledSkillPresentationCopy } from "./installedSkillPresentation";
import { resolveInstalledSkillPromise } from "./installedSkillPresentation";
import {
  isSkillAutoLoadEnabled,
  type SkillAutoLoadPreferences,
} from "./skillAutoLoadPreferences";
import { SkillTileSvg } from "./SkillsWorkspacePageVisuals";

function AutoLoadControl({
  onChange,
  preferences,
  skill,
}: {
  onChange: (skill: Skill, enabled: boolean) => void;
  preferences: SkillAutoLoadPreferences;
  skill: Skill;
}) {
  const { t } = useTranslation("agent");
  const enabled = isSkillAutoLoadEnabled(skill, preferences);

  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
      <div className="hidden min-w-[86px] sm:block">
        <div className="text-[11px] font-semibold leading-4 text-slate-700">
          {t("skills.workspace.autoLoad.label")}
        </div>
        <div className="text-[10px] leading-3 text-slate-400">
          {enabled
            ? t("skills.workspace.autoLoad.on")
            : t("skills.workspace.autoLoad.off")}
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={(nextEnabled) => onChange(skill, nextEnabled)}
        aria-label={t("skills.workspace.autoLoad.aria", {
          name: skill.name,
        })}
      />
    </div>
  );
}

export function InstalledSkillActionMenu({
  exportingSkillDirectory,
  onDetailOpen,
  onExport,
  onRename,
  onReplace,
  onReveal,
  onSelect,
  onUninstall,
  renamingSkillDirectory,
  replacingSkillDirectory,
  revealingSkillDirectory,
  skill,
  uninstallingSkillDirectory,
}: {
  exportingSkillDirectory: string | null;
  onDetailOpen: (directory: string) => void;
  onExport: (skill: Skill) => void;
  onRename: (skill: Skill) => void;
  onReplace: (skill: Skill) => void;
  onReveal: (skill: Skill) => void;
  onSelect: (skill: Skill) => void;
  onUninstall: (skill: Skill) => void;
  renamingSkillDirectory: string | null;
  replacingSkillDirectory: string | null;
  revealingSkillDirectory: string | null;
  skill: Skill;
  uninstallingSkillDirectory: string | null;
}) {
  const { t } = useTranslation("agent");
  const isProtected =
    skill.sourceKind === "builtin" || skill.catalogSource === "project";
  const isRenaming = renamingSkillDirectory === skill.directory;
  const isReplacing = replacingSkillDirectory === skill.directory;
  const isRevealing = revealingSkillDirectory === skill.directory;
  const isExporting = exportingSkillDirectory === skill.directory;
  const isUninstalling = uninstallingSkillDirectory === skill.directory;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          aria-label={t("skills.workspace.installedSkill.action.more", {
            name: skill.name,
          })}
          title={t("skills.workspace.installedSkill.action.more", {
            name: skill.name,
          })}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="z-[80] min-w-[210px] rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-1 text-[color:var(--lime-text)] shadow-lg"
      >
        <DropdownMenuItem
          className="rounded-lg px-3 py-2 text-[13px] font-medium hover:bg-[color:var(--lime-surface-hover)]"
          onClick={() => onSelect(skill)}
        >
          <MessageCircle className="h-4 w-4 text-slate-500" />
          {t("skills.workspace.installedSkill.action.tryInChat")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="rounded-lg px-3 py-2 text-[13px] font-medium hover:bg-[color:var(--lime-surface-hover)]"
          onClick={() => onDetailOpen(skill.directory)}
        >
          <BookOpen className="h-4 w-4 text-slate-500" />
          {t("skills.workspace.marketplace.action.detail")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className={cn(
            "rounded-lg px-3 py-2 text-[13px] font-medium hover:bg-[color:var(--lime-surface-hover)]",
            isProtected && "pointer-events-none opacity-50",
          )}
          onClick={() => onRename(skill)}
        >
          <Pencil className="h-4 w-4 text-slate-500" />
          {isRenaming
            ? t("skills.workspace.installedSkill.action.renaming")
            : t("skills.workspace.installedSkill.action.rename")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className={cn(
            "rounded-lg px-3 py-2 text-[13px] font-medium hover:bg-[color:var(--lime-surface-hover)]",
            isProtected && "pointer-events-none opacity-50",
          )}
          onClick={() => onReplace(skill)}
        >
          <Upload className="h-4 w-4 text-slate-500" />
          {isReplacing
            ? t("skills.workspace.installedSkill.action.replacing")
            : t("skills.workspace.installedSkill.action.replace")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="rounded-lg px-3 py-2 text-[13px] font-medium hover:bg-[color:var(--lime-surface-hover)]"
          onClick={() => onReveal(skill)}
        >
          <FolderOpen className="h-4 w-4 text-slate-500" />
          {isRevealing
            ? t("skills.workspace.installedSkill.action.showingInFolder")
            : t("skills.workspace.installedSkill.action.showInFolder")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className={cn(
            "rounded-lg px-3 py-2 text-[13px] font-medium hover:bg-[color:var(--lime-surface-hover)]",
            isProtected && "pointer-events-none opacity-50",
          )}
          onClick={() => onExport(skill)}
        >
          <Download className="h-4 w-4 text-slate-500" />
          {isExporting
            ? t("skills.workspace.installedSkill.action.exporting")
            : t("skills.workspace.installedSkill.action.export")}
        </DropdownMenuItem>
        {!isProtected ? (
          <>
            <DropdownMenuSeparator className="bg-[color:var(--lime-surface-border)]" />
            <DropdownMenuItem
              className="rounded-lg px-3 py-2 text-[13px] font-semibold text-rose-700 hover:bg-rose-50"
              onClick={() => onUninstall(skill)}
            >
              <Trash2 className="h-4 w-4" />
              {isUninstalling
                ? t("skills.workspace.installedSkill.action.uninstalling")
                : t("skills.workspace.installedSkill.action.uninstall")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LocalSkillRow({
  highlighted,
  installedSkillPresentationCopy,
  onAutoLoadChange,
  onDetailOpen,
  onSelect,
  preferences,
  skill,
  actionMenu,
}: {
  highlighted?: boolean;
  installedSkillPresentationCopy: InstalledSkillPresentationCopy;
  onAutoLoadChange: (skill: Skill, enabled: boolean) => void;
  onDetailOpen: (directory: string) => void;
  onSelect?: (skill: Skill) => void;
  preferences: SkillAutoLoadPreferences;
  skill: Skill;
  actionMenu?: ReactNode;
}) {
  const { t } = useTranslation("agent");

  return (
    <div
      data-testid="skills-local-skill-row"
      data-skill-directory={skill.directory}
      className={cn(
        "flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0",
        highlighted ? "bg-emerald-50/60" : "hover:bg-slate-50",
      )}
    >
      <SkillTileSvg tone={highlighted ? "emerald" : "slate"} />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-sm font-semibold text-slate-900">
          {skill.name}
        </div>
        <p className="line-clamp-1 text-xs leading-5 text-slate-500">
          {skill.description ||
            resolveInstalledSkillPromise(skill, installedSkillPresentationCopy)}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-slate-400">
          {t("skills.workspace.autoLoad.description")}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <AutoLoadControl
          skill={skill}
          preferences={preferences}
          onChange={onAutoLoadChange}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-full border-slate-200 bg-white px-3 text-xs text-slate-700 shadow-none hover:bg-slate-50"
          onClick={() => onDetailOpen(skill.directory)}
        >
          {t("skills.workspace.marketplace.action.detail")}
        </Button>
        {onSelect ? actionMenu : null}
      </div>
    </div>
  );
}
