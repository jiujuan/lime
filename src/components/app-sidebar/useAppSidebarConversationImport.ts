import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ConversationImportThreadCommitResponse } from "@/lib/api/conversationImport";
import type { SidebarOpenedProjectSummary } from "@/components/app-sidebar/sidebarConversationGroups";

interface UseAppSidebarConversationImportParams {
  addImportedSidebarSessionOptimistically: (
    response: ConversationImportThreadCommitResponse,
  ) => void;
  refreshSidebarSessions: () => Promise<void>;
  onImportedSession: (response: ConversationImportThreadCommitResponse) => void;
}

export function useAppSidebarConversationImport({
  addImportedSidebarSessionOptimistically,
  refreshSidebarSessions,
  onImportedSession,
}: UseAppSidebarConversationImportParams) {
  const { t } = useTranslation("navigation");
  const [project, setProject] = useState<SidebarOpenedProjectSummary | null>(
    null,
  );
  const [isOpen, setIsOpen] = useState(false);

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
          "Imported {{count}} historical messages",
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
    open,
  };
}
