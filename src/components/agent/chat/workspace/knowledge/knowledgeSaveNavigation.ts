import type { KnowledgePageParams } from "@/types/page";

interface KnowledgeSaveNavigationSource {
  messageId: string;
  content: string;
  sourceName?: string;
  description?: string | null;
}

interface BuildKnowledgeSavePageParamsOptions {
  projectRootPath?: string | null;
  selectedPackName?: string | null;
  currentSessionTitle?: string | null;
  source: KnowledgeSaveNavigationSource;
  requestKey?: number;
}

export function buildKnowledgeSavePageParams({
  projectRootPath,
  selectedPackName,
  currentSessionTitle,
  source,
  requestKey = Date.now(),
}: BuildKnowledgeSavePageParamsOptions): KnowledgePageParams | null {
  const workingDir = projectRootPath?.trim();
  const sourceText = source.content.trim();
  if (!workingDir || !sourceText) {
    return null;
  }

  const sourceName =
    source.sourceName?.trim() || `agent-output-${source.messageId}.md`;
  const description =
    source.description?.trim() || currentSessionTitle?.trim() || "对话结果资料";
  const normalizedPackName = selectedPackName?.trim();

  return {
    workingDir,
    initialView: "save",
    ...(normalizedPackName ? { selectedPackName: normalizedPackName } : {}),
    saveDraft: {
      sourceName,
      sourceText,
      description,
      packType: "custom",
      requestKey,
    },
  };
}
