import { useCallback } from "react";
import { toast } from "sonner";
import type { AgentChatWorkspaceProps } from "../agentChatWorkspaceContract";
import { buildSkillsPageParamsFromMessage } from "../utils/skillScaffoldDraft";
import type { CreationReplayMetadata } from "../utils/creationReplayMetadata";

interface MessageSkillSaveSource {
  messageId: string;
  content: string;
}

interface UseWorkspaceMessageSkillSaveRuntimeParams {
  creationProjectId?: string | null;
  creationReplay?: CreationReplayMetadata;
  onNavigate?: AgentChatWorkspaceProps["onNavigate"];
}

export function useWorkspaceMessageSkillSaveRuntime({
  creationProjectId,
  creationReplay,
  onNavigate,
}: UseWorkspaceMessageSkillSaveRuntimeParams) {
  const handleSaveMessageAsSkill = useCallback(
    (source: MessageSkillSaveSource) => {
      if (!onNavigate) {
        toast.error("当前入口暂不支持直接跳转到 Skill 页面");
        return;
      }

      const nextPageParams = buildSkillsPageParamsFromMessage(source, {
        creationProjectId,
        creationReplay,
      });
      if (!nextPageParams?.initialScaffoldDraft) {
        toast.error("这条结果暂时还不足以生成技能草稿");
        return;
      }

      onNavigate("skills", nextPageParams);
      toast.success("已带着这条结果去新建 Skill");
    },
    [creationProjectId, creationReplay, onNavigate],
  );

  return { handleSaveMessageAsSkill };
}
