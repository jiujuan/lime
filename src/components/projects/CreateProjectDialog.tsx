/**
 * 创建项目对话框
 *
 * 用于创建新项目
 */

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ProjectType,
  USER_PROJECT_TYPES,
  extractErrorMessage,
  getCreateProjectErrorMessage,
  getProjectTypeIcon,
  getProjectByRootPath,
  getWorkspaceProjectsRoot,
  resolveProjectRootPath,
} from "@/lib/api/project";
import { toast } from "sonner";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, type: ProjectType) => Promise<void>;
  defaultType?: ProjectType;
  defaultName?: string;
  allowedTypes?: ProjectType[];
}

type UserProjectType = (typeof USER_PROJECT_TYPES)[number];

export function CreateProjectDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultType,
  defaultName,
  allowedTypes,
}: CreateProjectDialogProps) {
  const { t } = useTranslation("common");
  const [name, setName] = useState("");
  const [type, setType] = useState<UserProjectType>("general");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [workspaceRootPath, setWorkspaceRootPath] = useState("");
  const [resolvedProjectPath, setResolvedProjectPath] = useState("");
  const [pathChecking, setPathChecking] = useState(false);
  const [pathConflictMessage, setPathConflictMessage] = useState("");

  const visibleTypes = useMemo(() => {
    const candidates =
      allowedTypes && allowedTypes.length > 0
        ? allowedTypes
        : USER_PROJECT_TYPES;

    return candidates.filter((candidate): candidate is UserProjectType =>
      USER_PROJECT_TYPES.includes(
        candidate as (typeof USER_PROJECT_TYPES)[number],
      ),
    );
  }, [allowedTypes]);

  const fallbackType = visibleTypes[0] || "general";
  const projectTypeLabels: Record<UserProjectType, string> = {
    general: t("common.createProjectDialog.projectType.general"),
  };
  const getProjectTypeDisplayLabel = (projectType: UserProjectType) =>
    projectTypeLabels[projectType];
  const createProjectErrorMessageCopy = useMemo(
    () => ({
      invalidPath: t("common.createProjectDialog.error.invalidPath"),
      objectError: t("common.createProjectDialog.error.object"),
      pathExists: t("common.createProjectDialog.error.pathExists"),
      staleSchema: t("common.createProjectDialog.error.staleSchema"),
      unknown: t("common.createProjectDialog.error.unknown"),
    }),
    [t],
  );

  // 当对话框打开且 defaultType 变化时，更新类型选择
  useEffect(() => {
    if (!open) {
      return;
    }

    if (
      defaultType &&
      USER_PROJECT_TYPES.includes(defaultType as UserProjectType) &&
      visibleTypes.includes(defaultType as UserProjectType)
    ) {
      setType(defaultType as UserProjectType);
      return;
    }

    if (!visibleTypes.includes(type)) {
      setType(fallbackType);
    }
  }, [defaultType, fallbackType, open, type, visibleTypes]);

  // 当对话框打开且 defaultName 变化时，更新项目名称
  useEffect(() => {
    if (open && defaultName) {
      setName(defaultName);
    }
  }, [open, defaultName]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let mounted = true;

    const loadWorkspaceRoot = async () => {
      try {
        const root = await getWorkspaceProjectsRoot();
        if (mounted) {
          setWorkspaceRootPath(root);
        }
      } catch (error) {
        console.error("加载 workspace 目录失败:", error);
        if (mounted) {
          setWorkspaceRootPath("");
        }
      }
    };

    void loadWorkspaceRoot();

    return () => {
      mounted = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const projectName = name.trim();
    if (!projectName) {
      setResolvedProjectPath("");
      setPathChecking(false);
      setPathConflictMessage("");
      return;
    }

    let mounted = true;

    const resolvePath = async () => {
      try {
        const path = await resolveProjectRootPath(projectName);
        if (mounted) {
          setResolvedProjectPath(path);
          setPathConflictMessage("");
        }
      } catch (error) {
        console.error("解析项目目录失败:", error);
        if (mounted) {
          setResolvedProjectPath("");
          setPathConflictMessage("");
        }
      }
    };

    void resolvePath();

    return () => {
      mounted = false;
    };
  }, [open, name]);

  useEffect(() => {
    if (!open || !resolvedProjectPath) {
      setPathChecking(false);
      setPathConflictMessage("");
      return;
    }

    let mounted = true;
    setPathChecking(true);

    const checkPathConflict = async () => {
      try {
        const existingProject = await getProjectByRootPath(resolvedProjectPath);
        if (!mounted) {
          return;
        }

        if (existingProject) {
          setPathConflictMessage(
            t("common.createProjectDialog.path.conflict", {
              name: existingProject.name,
            }),
          );
        } else {
          setPathConflictMessage("");
        }
      } catch (error) {
        console.error("检查项目路径冲突失败:", error);
        if (mounted) {
          setPathConflictMessage("");
        }
      } finally {
        if (mounted) {
          setPathChecking(false);
        }
      }
    };

    void checkPathConflict();

    return () => {
      mounted = false;
    };
  }, [open, resolvedProjectPath, t]);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(name.trim(), type);
      setName("");
      setType(
        defaultType &&
          USER_PROJECT_TYPES.includes(defaultType as UserProjectType) &&
          visibleTypes.includes(defaultType as UserProjectType)
          ? (defaultType as UserProjectType)
          : fallbackType,
      );
      onOpenChange(false);
    } catch (error) {
      console.error("创建项目失败:", error);
      const message = extractErrorMessage(error);
      const friendlyMessage = getCreateProjectErrorMessage(
        message,
        createProjectErrorMessageCopy,
      );
      toast.error(
        t("common.createProjectDialog.toast.createFailed", {
          message: friendlyMessage,
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };
  const topBadges = [
    getProjectTypeDisplayLabel(type),
    workspaceRootPath
      ? t("common.createProjectDialog.status.workspaceResolved")
      : t("common.createProjectDialog.status.waitingWorkspace"),
    pathConflictMessage
      ? t("common.createProjectDialog.status.pathConflict")
      : t("common.createProjectDialog.status.pathAvailable"),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] overflow-hidden border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(255,255,255,0.98)_38%,rgba(240,249,255,0.94)_100%)] p-0">
        <DialogHeader className="border-b border-white/80 px-6 py-5">
          <DialogTitle>{t("common.createProjectDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("common.createProjectDialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[78vh] gap-5 overflow-auto p-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(247,250,252,0.98)_0%,rgba(255,255,255,0.98)_48%,rgba(240,249,255,0.94)_100%)] p-5 shadow-sm shadow-slate-950/5">
              <div className="pointer-events-none absolute -left-10 top-[-28px] h-24 w-24 rounded-full bg-sky-200/20 blur-3xl" />
              <div className="pointer-events-none absolute right-[-14px] top-0 h-20 w-20 rounded-full bg-emerald-200/20 blur-3xl" />
              <div className="relative space-y-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {t("common.createProjectDialog.hero.title")}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    {t("common.createProjectDialog.hero.description")}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {topBadges.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/90 bg-white/85 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm"
                    >
                      {item}
                    </span>
                  ))}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="name">
                    {t("common.createProjectDialog.name.label")}
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t(
                      "common.createProjectDialog.name.placeholder",
                    )}
                    autoFocus
                    className="h-11 border-slate-200/80 bg-white/90"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-sm shadow-slate-950/5">
              <div className="mb-4">
                <div className="text-sm font-semibold text-slate-900">
                  {t("common.createProjectDialog.type.title")}
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  {t("common.createProjectDialog.type.description")}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {visibleTypes.map((projectType) => (
                  <button
                    key={projectType}
                    type="button"
                    className={cn(
                      "flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-[22px] border px-4 py-4 text-center transition",
                      type === projectType
                        ? "border-emerald-200 bg-[linear-gradient(135deg,rgba(240,253,250,0.98)_0%,rgba(236,253,245,0.96)_52%,rgba(224,242,254,0.95)_100%)] shadow-sm shadow-emerald-950/10"
                        : "border-slate-200/80 bg-slate-50/70 hover:border-slate-300 hover:bg-white",
                    )}
                    onClick={() => setType(projectType)}
                  >
                    <span className="text-2xl">
                      {getProjectTypeIcon(projectType)}
                    </span>
                    <span className="text-xs font-medium text-slate-900">
                      {getProjectTypeDisplayLabel(projectType)}
                    </span>
                    {type === projectType ? (
                      <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                        {t("common.createProjectDialog.type.selected")}
                      </Badge>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-sm shadow-slate-950/5">
              <div className="mb-4">
                <div className="text-sm font-semibold text-slate-900">
                  {t("common.createProjectDialog.path.title")}
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  {t("common.createProjectDialog.path.description")}
                </div>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="workspace-root">
                    {t("common.createProjectDialog.path.workspaceRootLabel")}
                  </Label>
                  <Input
                    id="workspace-root"
                    value={workspaceRootPath}
                    placeholder={t("common.loading")}
                    readOnly
                    className="bg-slate-50/80"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="project-path-preview">
                    {t("common.createProjectDialog.path.previewLabel")}
                  </Label>
                  <Input
                    id="project-path-preview"
                    value={resolvedProjectPath}
                    placeholder={t(
                      "common.createProjectDialog.path.nameRequired",
                    )}
                    readOnly
                    className="bg-slate-50/80"
                  />
                  <p className="break-all text-xs leading-5 text-slate-500">
                    {t("common.createProjectDialog.path.willCreateAt", {
                      path:
                        resolvedProjectPath ||
                        t("common.createProjectDialog.path.nameRequired"),
                    })}
                  </p>
                  {pathChecking && (
                    <p className="text-xs text-slate-500">
                      {t("common.createProjectDialog.path.checking")}
                    </p>
                  )}
                  {!pathChecking && pathConflictMessage && (
                    <p className="text-xs text-destructive">
                      {pathConflictMessage}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.9)_0%,rgba(255,255,255,0.98)_100%)] p-5 shadow-sm shadow-slate-950/5">
              <div className="text-sm font-semibold text-slate-900">
                {t("common.createProjectDialog.tips.title")}
              </div>
              <div className="mt-2 space-y-2 text-xs leading-5 text-slate-500">
                <p>{t("common.createProjectDialog.tips.name")}</p>
                <p>{t("common.createProjectDialog.tips.path")}</p>
                <p>{t("common.createProjectDialog.tips.type")}</p>
              </div>
            </section>
          </div>
        </div>
        <DialogFooter className="border-t border-white/80 px-6 py-4">
          <Button
            variant="outline"
            className="border-slate-200/80 bg-white"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !name.trim() ||
              isSubmitting ||
              pathChecking ||
              !!pathConflictMessage
            }
          >
            {isSubmitting
              ? t("common.createProjectDialog.action.creating")
              : t("common.createProjectDialog.action.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
