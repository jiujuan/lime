import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  FolderX,
  GitBranch,
  Monitor,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { open as openDialog } from "@/lib/desktop-host/plugin-dialog";
import { cn } from "@/lib/utils";
import {
  ensureProjectWorkspace,
  extractErrorMessage,
  getProject,
  getWorkspaceProjectsRoot,
  resolveProjectRootPath,
} from "@/lib/api/project";
import { markProjectOpened } from "../../../hooks/agentProjectStorage";

export interface InputbarOpenedProject {
  id: string;
  name: string;
  rootPath?: string | null;
}

export interface InputbarProjectContextCopy {
  projectAria: string;
  searchPlaceholder: string;
  openedLabel: string;
  currentBadge: string;
  noProjectLabel: string;
  noProjectDescription: string;
  noOpenedProjects: string;
  addNewProject: string;
  createBlankProject: string;
  useExistingFolder: string;
  selectFolderDialogTitle: string;
  newProjectNameFallback: string;
  projectCreated: string;
  projectOpened: string;
  projectCreateFailed: string;
  projectOpenFailed: string;
  noProjectAction: string;
  modeLabel: string;
  localMode: string;
  branchLabel: string;
  branchFallback: string;
}

interface InputbarProjectContextBarProps {
  projectId?: string | null;
  openedProjects?: InputbarOpenedProject[];
  onProjectChange?: (projectId: string | null) => void;
  modeLabel?: string;
  branchLabel?: string;
  copy: InputbarProjectContextCopy;
}

type ProjectActionState = "blank" | "folder" | null;

function normalizeProjectId(projectId?: string | null): string {
  return projectId?.trim() ?? "";
}

function resolveProjectNameFromId(projectId: string): string {
  if (!projectId) {
    return "";
  }

  return (
    projectId
      .split(/[\\/]/)
      .filter(Boolean)
      .pop()
      ?.trim() || projectId
  );
}

function resolveDirectoryName(path: string): string {
  return (
    path
      .split(/[\\/]/)
      .filter(Boolean)
      .pop()
      ?.trim() || path.trim()
  );
}

function formatProjectPath(path?: string | null): string | null {
  const normalized = path?.trim();
  if (!normalized) {
    return null;
  }

  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 2) {
    return normalized;
  }

  return `.../${parts.slice(-2).join("/")}`;
}

export function InputbarProjectContextBar({
  projectId,
  openedProjects,
  onProjectChange,
  modeLabel,
  branchLabel,
  copy,
}: InputbarProjectContextBarProps) {
  const normalizedProjectId = normalizeProjectId(projectId);
  const [resolvedProject, setResolvedProject] =
    useState<InputbarOpenedProject | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [actionState, setActionState] = useState<ProjectActionState>(null);

  const openedProjectsContainCurrent = Boolean(
    normalizedProjectId &&
      openedProjects?.some(
        (project) => normalizeProjectId(project.id) === normalizedProjectId,
      ),
  );

  useEffect(() => {
    if (!normalizedProjectId || openedProjectsContainCurrent) {
      setResolvedProject(null);
      return;
    }

    let cancelled = false;
    void getProject(normalizedProjectId)
      .then((project) => {
        if (cancelled) {
          return;
        }
        setResolvedProject(
          project
            ? {
                id: project.id,
                name: project.name,
                rootPath: project.rootPath,
              }
            : {
                id: normalizedProjectId,
                name: resolveProjectNameFromId(normalizedProjectId),
              },
        );
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setResolvedProject({
          id: normalizedProjectId,
          name: resolveProjectNameFromId(normalizedProjectId),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedProjectId, openedProjectsContainCurrent]);

  const currentProjectFallback = useMemo(
    () =>
      normalizedProjectId
        ? {
            id: normalizedProjectId,
            name: resolveProjectNameFromId(normalizedProjectId),
            rootPath: null,
          }
        : null,
    [normalizedProjectId],
  );
  const visibleOpenedProjects = useMemo(() => {
    const source: InputbarOpenedProject[] = [
      ...(openedProjects ?? []),
      ...(resolvedProject
        ? [resolvedProject]
        : currentProjectFallback
          ? [currentProjectFallback]
          : []),
    ];
    const seen = new Set<string>();
    return source.filter((project) => {
      const id = normalizeProjectId(project.id);
      if (!id || seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
  }, [currentProjectFallback, openedProjects, resolvedProject]);
  const activeProject =
    visibleOpenedProjects.find(
      (project) => normalizeProjectId(project.id) === normalizedProjectId,
    ) ?? null;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredOpenedProjects = normalizedSearch
    ? visibleOpenedProjects.filter(
        (project) =>
          project.name.toLowerCase().includes(normalizedSearch) ||
          project.id.toLowerCase().includes(normalizedSearch),
      )
    : visibleOpenedProjects;
  const resolvedModeLabel = modeLabel?.trim() || copy.localMode;
  const resolvedBranchLabel = branchLabel?.trim() || copy.branchFallback;

  const openEnsuredProject = (project: InputbarOpenedProject) => {
    markProjectOpened(project.id);
    onProjectChange?.(project.id);
    setPopoverOpen(false);
  };

  const handleCreateBlankProject = async () => {
    if (actionState) {
      return;
    }
    setActionState("blank");
    try {
      const projectsRoot = await getWorkspaceProjectsRoot();
      const name = copy.newProjectNameFallback.trim() || "Untitled Project";
      const rootPath = await resolveProjectRootPath(name, projectsRoot);
      const project = await ensureProjectWorkspace({
        name,
        rootPath,
        workspaceType: "general",
      });
      openEnsuredProject(project);
      toast.success(copy.projectCreated);
    } catch (error) {
      toast.error(`${copy.projectCreateFailed}: ${extractErrorMessage(error)}`);
    } finally {
      setActionState(null);
    }
  };

  const handleUseExistingFolder = async () => {
    if (actionState) {
      return;
    }
    setActionState("folder");
    try {
      const selectedPath = await openDialog({
        directory: true,
        multiple: false,
        title: copy.selectFolderDialogTitle,
      });
      if (typeof selectedPath !== "string" || !selectedPath.trim()) {
        return;
      }

      const rootPath = selectedPath.trim();
      const project = await ensureProjectWorkspace({
        name:
          resolveDirectoryName(rootPath) ||
          copy.newProjectNameFallback.trim() ||
          "Untitled Project",
        rootPath,
        workspaceType: "general",
      });
      openEnsuredProject(project);
      toast.success(copy.projectOpened);
    } catch (error) {
      toast.error(`${copy.projectOpenFailed}: ${extractErrorMessage(error)}`);
    } finally {
      setActionState(null);
    }
  };

  return (
    <div
      className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-1.5 text-slate-600"
      data-testid="inputbar-project-context-bar"
    >
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-7 min-w-0 max-w-[180px] items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition",
              "text-slate-700 hover:bg-white hover:text-slate-950 hover:shadow-sm hover:shadow-slate-950/5",
            )}
            aria-label={copy.projectAria}
            title={activeProject?.name || copy.noProjectLabel}
            data-testid="inputbar-project-context-project-trigger"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
            <span className="truncate">
              {activeProject?.name || copy.noProjectLabel}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={8}
          className="z-[70] w-[292px] overflow-visible rounded-xl border border-slate-200 bg-white p-1.5 text-slate-900 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.52)]"
          data-testid="inputbar-project-context-menu"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <div className="flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-slate-900 outline-none placeholder:text-slate-400"
              value={searchQuery}
              placeholder={copy.searchPlaceholder}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          <div className="px-2 pb-1 pt-2 text-[11px] font-semibold text-slate-500">
            {copy.openedLabel}
          </div>

          <div className="max-h-[210px] overflow-auto">
            {filteredOpenedProjects.length > 0 ? (
              filteredOpenedProjects.map((project) => {
                const isActive =
                  normalizeProjectId(project.id) === normalizedProjectId;
                const pathPreview = formatProjectPath(project.rootPath);
                return (
                  <button
                    key={project.id}
                    type="button"
                    className={cn(
                      "flex h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left transition",
                      isActive
                        ? "bg-slate-100 text-slate-950"
                        : "text-slate-700 hover:bg-slate-50 hover:text-slate-950",
                    )}
                    data-testid="inputbar-project-context-opened-project"
                    onClick={() => openEnsuredProject(project)}
                  >
                    <FolderOpen
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isActive ? "text-emerald-700" : "text-slate-500",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">
                        {project.name}
                      </span>
                      {pathPreview ? (
                        <span className="block truncate text-[10.5px] font-medium text-slate-400">
                          {pathPreview}
                        </span>
                      ) : null}
                    </span>
                    {isActive ? (
                      <Check
                        aria-label={copy.currentBadge}
                        className="h-3.5 w-3.5 shrink-0 text-emerald-700"
                      />
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="rounded-lg px-2 py-3 text-[13px] text-slate-500">
                {visibleOpenedProjects.length > 0
                  ? copy.noOpenedProjects
                  : copy.noProjectDescription}
              </div>
            )}
          </div>

          <div className="my-1 h-px bg-slate-100" />

          <div
            className="relative"
            onMouseEnter={() => setSubmenuOpen(true)}
            onMouseLeave={() => setSubmenuOpen(false)}
          >
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 focus:bg-slate-50 focus:outline-none"
              data-testid="inputbar-project-context-add-project"
              onFocus={() => setSubmenuOpen(true)}
            >
              <Plus className="h-4 w-4 text-slate-500" />
              <span className="min-w-0 flex-1 truncate">
                {copy.addNewProject}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
            {submenuOpen ? (
              <div
                className="absolute left-[calc(100%+8px)] top-0 z-[80] w-[186px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.52)]"
                data-testid="inputbar-project-context-add-submenu"
              >
                <button
                  type="button"
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                  data-testid="inputbar-project-context-create-blank"
                  disabled={Boolean(actionState)}
                  onClick={() => void handleCreateBlankProject()}
                >
                  <FolderPlus className="h-4 w-4 text-emerald-700" />
                  <span className="truncate">{copy.createBlankProject}</span>
                </button>
                <button
                  type="button"
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                  data-testid="inputbar-project-context-use-existing"
                  disabled={Boolean(actionState)}
                  onClick={() => void handleUseExistingFolder()}
                >
                  <FolderOpen className="h-4 w-4 text-sky-700" />
                  <span className="truncate">{copy.useExistingFolder}</span>
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
            data-testid="inputbar-project-context-no-project"
            onClick={() => {
              onProjectChange?.(null);
              setPopoverOpen(false);
            }}
          >
            <FolderX className="h-4 w-4 text-slate-500" />
            <span className="min-w-0 flex-1 truncate">
              {copy.noProjectAction}
            </span>
            {!normalizedProjectId ? (
              <Check
                aria-label={copy.currentBadge}
                className="h-3.5 w-3.5 text-emerald-700"
              />
            ) : null}
          </button>
        </PopoverContent>
      </Popover>

      <span className="h-4 w-px bg-slate-200" aria-hidden />
      <button
        type="button"
        className="inline-flex h-7 min-w-0 max-w-[180px] items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-950"
        title={`${copy.modeLabel}: ${resolvedModeLabel}`}
        data-testid="inputbar-project-context-mode"
      >
        <Monitor className="h-3.5 w-3.5 shrink-0 text-sky-700" />
        <span className="truncate">{resolvedModeLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
      </button>
      <button
        type="button"
        className="inline-flex h-7 min-w-0 max-w-[180px] items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-950"
        title={`${copy.branchLabel}: ${resolvedBranchLabel}`}
        data-testid="inputbar-project-context-branch"
      >
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <span className="truncate">{resolvedBranchLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
      </button>
    </div>
  );
}
