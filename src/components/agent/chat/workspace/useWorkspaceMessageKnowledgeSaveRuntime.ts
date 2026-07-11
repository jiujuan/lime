import { useCallback } from "react";
import { toast } from "sonner";
import type { AgentChatWorkspaceProps } from "../agentChatWorkspaceContract";
import { isUsableKnowledgeSourceText } from "./agentChatWorkspaceHelpers";
import { buildKnowledgeSavePageParams } from "./knowledge/knowledgeSaveNavigation";

interface MessageKnowledgeSaveSource {
  messageId: string;
  content: string;
  sourceName?: string;
  description?: string | null;
}

interface ImportTextAsKnowledgeRequest {
  sourceName: string;
  sourceText: string;
  description: string;
  packType: "custom";
}

interface UseWorkspaceMessageKnowledgeSaveRuntimeParams {
  currentSessionTitle?: string | null;
  importTextAsKnowledge: (request: ImportTextAsKnowledgeRequest) => void;
  knowledgeSelectionWorkingDir?: string | null;
  onNavigate?: AgentChatWorkspaceProps["onNavigate"];
  projectRootPath?: string | null;
  selectedPackName?: string | null;
}

export function useWorkspaceMessageKnowledgeSaveRuntime({
  currentSessionTitle,
  importTextAsKnowledge,
  knowledgeSelectionWorkingDir,
  onNavigate,
  projectRootPath,
  selectedPackName,
}: UseWorkspaceMessageKnowledgeSaveRuntimeParams) {
  const handleSaveMessageAsKnowledge = useCallback(
    (source: MessageKnowledgeSaveSource) => {
      const sourceText = source.content.trim();
      if (!sourceText) {
        toast.error("这条结果暂时没有可沉淀的内容");
        return;
      }
      if (!isUsableKnowledgeSourceText(sourceText)) {
        toast.info("这条结果还不是可复用资料，请先补充原始内容后再沉淀。");
        return;
      }

      const savePageParams = buildKnowledgeSavePageParams({
        projectRootPath,
        knowledgeSelectionWorkingDir,
        selectedPackName,
        currentSessionTitle,
        source: {
          ...source,
          content: sourceText,
        },
      });
      if (onNavigate && savePageParams) {
        onNavigate("knowledge", savePageParams);
        return;
      }

      importTextAsKnowledge({
        sourceName:
          source.sourceName?.trim() || `agent-output-${source.messageId}.md`,
        sourceText,
        description:
          source.description?.trim() || currentSessionTitle || "对话结果资料",
        packType: "custom",
      });
    },
    [
      currentSessionTitle,
      importTextAsKnowledge,
      knowledgeSelectionWorkingDir,
      onNavigate,
      projectRootPath,
      selectedPackName,
    ],
  );

  return { handleSaveMessageAsKnowledge };
}
