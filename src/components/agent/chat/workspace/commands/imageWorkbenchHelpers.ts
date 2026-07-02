/**
 * 图片工作台辅助函数（从 useWorkspaceSendActions.ts 提取）
 *
 * 纯函数，无 React 依赖。用于图片工作台的启动上下文和草稿构建。
 *
 * @module imageWorkbenchHelpers
 */

import type { HandleSendOptions } from "../../hooks/handleSendTypes";
import { asRecord } from "./skillSlotUtils";
import { normalizeOptionalText } from "./commandRecentDefaults";
import { buildImageTaskAssistantContent } from "../imageTaskPersona";

export function readImageSkillLaunchContext(
  requestMetadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const harness = asRecord(requestMetadata?.harness);
  const launch =
    asRecord(harness?.image_command_intent) ||
    asRecord(harness?.imageCommandIntent);
  if (!launch) {
    return undefined;
  }

  return (
    asRecord(launch.image_task) ||
    asRecord(asRecord(launch.request_context)?.image_task) ||
    asRecord(asRecord(launch.requestContext)?.image_task)
  );
}

export function buildImageWorkbenchAssistantDraft(
  requestMetadata: Record<string, unknown> | undefined,
): HandleSendOptions["assistantDraft"] {
  const imageTask = readImageSkillLaunchContext(requestMetadata);
  if (!imageTask) {
    return undefined;
  }

  const prompt =
    normalizeOptionalText(imageTask.prompt as string | undefined) ||
    normalizeOptionalText(imageTask.raw_text as string | undefined) ||
    normalizeOptionalText(imageTask.rawText as string | undefined);
  if (!prompt) {
    return undefined;
  }

  const assistantContent = buildImageTaskAssistantContent({
    prompt,
    mode: imageTask.mode as "generate" | "edit" | "variation" | undefined,
    modelName:
      normalizeOptionalText(imageTask.model as string | undefined) ||
      normalizeOptionalText(imageTask.model_name as string | undefined) ||
      normalizeOptionalText(imageTask.modelName as string | undefined),
  });

  return {
    content: assistantContent,
    fallbackContent: assistantContent,
  };
}
