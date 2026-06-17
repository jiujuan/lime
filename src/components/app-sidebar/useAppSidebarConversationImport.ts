import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  scanConversationImportSource,
  type ConversationImportThreadCommitResponse,
} from "@/lib/api/conversationImport";
import type { SidebarOpenedProjectSummary } from "@/components/app-sidebar/sidebarConversationGroups";

interface UseAppSidebarConversationImportParams {
  projects?: SidebarOpenedProjectSummary[];
  addImportedSidebarSessionOptimistically: (
    response: ConversationImportThreadCommitResponse,
  ) => void;
  refreshSidebarSessions: () => Promise<void>;
  onImportedSession: (response: ConversationImportThreadCommitResponse) => void;
}

const PROJECT_IMPORT_SCAN_LIMIT = 40;

function normalizeOptional(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function buildProjectImportProbeTargets(
  projects: SidebarOpenedProjectSummary[],
) {
  return projects.flatMap((project) => {
    const projectId = normalizeOptional(project.id);
    const projectPath = normalizeOptional(project.rootPath);
    return projectId && projectPath ? [{ projectId, projectPath }] : [];
  });
}

export function useAppSidebarConversationImport({
  projects = [],
  addImportedSidebarSessionOptimistically,
  refreshSidebarSessions,
  onImportedSession,
}: UseAppSidebarConversationImportParams) {
  const { t } = useTranslation("navigation");
  const [project, setProject] = useState<SidebarOpenedProjectSummary | null>(
    null,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [importableProjectIds, setImportableProjectIds] = useState<Set<string>>(
    () => new Set(),
  );
  const projectImportProbeTargets = useMemo(
    () => buildProjectImportProbeTargets(projects),
    [projects],
  );
  const projectImportProbeKey = useMemo(
    () =>
      projectImportProbeTargets
        .map((target) => `${target.projectId}\u0000${target.projectPath}`)
        .sort()
        .join("\n"),
    [projectImportProbeTargets],
  );
  const stableProjectImportProbeTargets = useMemo(
    () =>
      projectImportProbeKey
        .split("\n")
        .filter(Boolean)
        .map((value) => {
          const [projectId, projectPath] = value.split("\u0000");
          return { projectId, projectPath };
        })
        .filter((target) => target.projectId && target.projectPath),
    [projectImportProbeKey],
  );

  useEffect(() => {
    if (stableProjectImportProbeTargets.length === 0) {
      setImportableProjectIds(new Set());
      return;
    }

    let cancelled = false;
    const activeProjectIds = new Set(
      stableProjectImportProbeTargets.map((target) => target.projectId),
    );
    setImportableProjectIds((current) => {
      const next = new Set(
        [...current].filter((projectId) => activeProjectIds.has(projectId)),
      );
      return next.size === current.size ? current : next;
    });

    void Promise.all(
      stableProjectImportProbeTargets.map(async (target) => {
        try {
          const result = await scanConversationImportSource({
            sourceClient: "codex",
            projectPath: target.projectPath,
            includeArchived: false,
            limit: PROJECT_IMPORT_SCAN_LIMIT,
          });
          return {
            projectId: target.projectId,
            importable:
              result.source.status === "ready" &&
              result.source.readable &&
              (result.threads.length > 0 || result.source.threadCount > 0),
          };
        } catch {
          return {
            projectId: target.projectId,
            importable: false,
          };
        }
      }),
    ).then((results) => {
      if (cancelled) {
        return;
      }
      setImportableProjectIds(() => {
        const next = new Set<string>();
        for (const result of results) {
          if (result.importable) {
            next.add(result.projectId);
          }
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [stableProjectImportProbeTargets]);

  const open = useCallback((nextProject?: SidebarOpenedProjectSummary) => {
    setProject(nextProject ?? null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setProject(null);
  }, []);

  const handleImported = useCallback(
    (responses: ConversationImportThreadCommitResponse[]) => {
      close();
      const totalMessages = responses.reduce(
        (sum, response) => sum + response.importedMessages,
        0,
      );
      toast.success(
        t(
          "navigation.sidebar.importDialog.toast.success",
          "已导入 {{count}} 条历史消息",
          {
            count: totalMessages,
          },
        ),
      );
      for (const response of responses) {
        addImportedSidebarSessionOptimistically(response);
      }
      void refreshSidebarSessions();
      const latestResponse = responses.at(-1);
      if (latestResponse) {
        onImportedSession(latestResponse);
      }
    },
    [
      addImportedSidebarSessionOptimistically,
      close,
      onImportedSession,
      refreshSidebarSessions,
      t,
    ],
  );

  const dialogProps = useMemo(
    () => ({
      isOpen,
      workspaceId: project?.id ?? null,
      projectPath: project?.rootPath ?? null,
      projectName: project?.name ?? null,
      onClose: close,
      onImported: handleImported,
    }),
    [close, handleImported, isOpen, project],
  );

  return {
    dialogProps,
    importableProjectIds,
    open,
  };
}
