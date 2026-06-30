/**
 * 服务模型辅助函数（从 useWorkspaceSendActions.ts 提取）
 *
 * 纯函数，无 React 依赖。用于解析服务模型配置和发送覆盖。
 *
 * @module serviceModelHelpers
 */

import type {
  ServiceModelPreferenceConfig,
  ServiceModelsConfig,
} from "@/lib/api/appConfigTypes";
import type { HandleSendOptions } from "../../hooks/handleSendTypes";
import { asRecord } from "./skillSlotUtils";
import { hasHarnessLaunchRequestMetadata } from "./sendHelpers";

type RewritePurpose = NonNullable<HandleSendOptions["purpose"]>;

const PROMPT_REWRITE_PURPOSES = new Set<RewritePurpose>([
  "content_review",
  "text_stylize",
  "style_rewrite",
  "style_audit",
]);

export function resolveServiceModelSendOverrides(params: {
  requestMetadata: Record<string, unknown> | undefined;
  purpose?: HandleSendOptions["purpose"];
  serviceModels?: ServiceModelsConfig;
}): Pick<HandleSendOptions, "providerOverride" | "modelOverride"> {
  const { requestMetadata, purpose, serviceModels } = params;

  const harnessMetadata = asRecord(requestMetadata?.harness);
  const serviceSceneLaunch =
    asRecord(harnessMetadata?.service_scene_launch) ??
    asRecord(harnessMetadata?.serviceSceneLaunch);
  const serviceSceneRun =
    asRecord(serviceSceneLaunch?.service_scene_run) ??
    asRecord(serviceSceneLaunch?.serviceSceneRun);

  let preference: ServiceModelPreferenceConfig | undefined;
  if (
    hasHarnessLaunchRequestMetadata(requestMetadata, "translation_skill_launch")
  ) {
    preference = serviceModels?.translation;
  } else if (
    hasHarnessLaunchRequestMetadata(
      requestMetadata,
      "resource_search_skill_launch",
    )
  ) {
    preference = serviceModels?.resource_prompt_rewrite;
  } else if (purpose && PROMPT_REWRITE_PURPOSES.has(purpose)) {
    preference = serviceModels?.prompt_rewrite;
  }

  if (!preference && serviceSceneRun) {
    const sceneModel =
      typeof serviceSceneRun.model === "string"
        ? serviceSceneRun.model
        : undefined;
    if (sceneModel) {
      return { modelOverride: sceneModel };
    }
  }

  if (!preference) {
    return {};
  }

  return {
    providerOverride: preference.preferredProviderId ?? undefined,
    modelOverride: preference.preferredModelId ?? undefined,
  };
}

export function shouldRefreshServiceModelsBeforeSend(params: {
  requestMetadata: Record<string, unknown> | undefined;
  purpose?: HandleSendOptions["purpose"];
}): boolean {
  const { requestMetadata, purpose } = params;
  return (
    hasHarnessLaunchRequestMetadata(requestMetadata, "translation_skill_launch") ||
    hasHarnessLaunchRequestMetadata(
      requestMetadata,
      "resource_search_skill_launch",
    ) ||
    Boolean(purpose && PROMPT_REWRITE_PURPOSES.has(purpose))
  );
}
