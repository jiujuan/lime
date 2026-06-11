/**
 * 图片工作台辅助函数（从 useWorkspaceSendActions.ts 提取）
 *
 * 纯函数，无 React 依赖。用于图片工作台的启动上下文和草稿构建。
 *
 * @module imageWorkbenchHelpers
 */

import { buildImageTaskAssistantContent } from "../imageTaskPersona";
import type { HandleSendOptions } from "../../hooks/handleSendTypes";
import type { MessageImageWorkbenchPreview } from "../../types";
import { asRecord, readPositiveInteger, normalizeImageWorkbenchMode } from "./skillSlotUtils";
import { normalizeOptionalText } from "./commandRecentDefaults";

export function readImageSkillLaunchContext(
  requestMetadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const harness = asRecord(requestMetadata?.harness);
  const launch =
    asRecord(harness?.image_skill_launch) ||
    asRecord(harness?.imageSkillLaunch);
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

  const modelName =
    normalizeOptionalText(imageTask.model as string | undefined) ||
    normalizeOptionalText(imageTask.model_name as string | undefined) ||
    normalizeOptionalText(imageTask.modelName as string | undefined) ||
    null;
  const expectedImageCount =
    readPositiveInteger(imageTask.count) ||
    readPositiveInteger(imageTask.image_count) ||
    1;
  const mode = normalizeImageWorkbenchMode(imageTask.mode);
  const layoutHint =
    normalizeOptionalText(imageTask.layout_hint as string | undefined) ||
    normalizeOptionalText(imageTask.layoutHint as string | undefined) ||
    null;
  const preview: MessageImageWorkbenchPreview = {
    taskId: `draft-image-${crypto.randomUUID()}`,
    prompt,
    mode,
    status: "running",
    projectId:
      normalizeOptionalText(imageTask.project_id as string | undefined) ||
      normalizeOptionalText(imageTask.projectId as string | undefined) ||
      null,
    contentId:
      normalizeOptionalText(imageTask.content_id as string | undefined) ||
      normalizeOptionalText(imageTask.contentId as string | undefined) ||
      null,
    providerName:
      normalizeOptionalText(imageTask.provider as string | undefined) ||
      normalizeOptionalText(imageTask.provider_name as string | undefined) ||
      normalizeOptionalText(imageTask.providerName as string | undefined) ||
      normalizeOptionalText(imageTask.provider_id as string | undefined) ||
      normalizeOptionalText(imageTask.providerId as string | undefined) ||
      null,
    modelName,
    imageCount: expectedImageCount,
    expectedImageCount,
    size:
      normalizeOptionalText(imageTask.size as string | undefined) || undefined,
    layoutHint,
    caption: null,
    phase: "preparing",
    statusMessage: null,
  };

  return {
    content: "",
    fallbackContent: buildImageTaskAssistantContent({
      prompt,
      mode,
      modelName,
    }),
    imageWorkbenchPreview: preview,
  };
}
