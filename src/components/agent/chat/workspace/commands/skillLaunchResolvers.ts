//! Skill launch request resolvers（从 useWorkspaceSendActions.ts 提取）
//!
//! 用于解析技能启动请求上下文。
//!
//! @module skillLaunchResolvers

import { toast } from "sonner";
import { normalizeMediaGenerationPreference } from "@/lib/mediaGeneration";
import {
  VOICE_GENERATION_DEFAULT_ENTRY_SOURCE,
  resolveVoiceGenerationRuntimeContractBinding,
} from "@/lib/governance/modalityRuntimeContracts";
import { normalizeOptionalText } from "./commandRecentDefaults";
import {
  normalizeLocalServiceSkillExecutionKind,
  resolveGrowthCommandServiceSkill,
  resolveVoiceCommandServiceSkill,
} from "./serviceSkillMatch";
import { composeServiceSkillPrompt } from "../../service-skills/promptComposer";
import type {
  ServiceSkillHomeItem,
  ServiceSkillSlotValues,
} from "../../service-skills/types";
import type {
  ParsedGrowthWorkbenchCommand,
  ParsedVoiceWorkbenchCommand,
} from "./commandRecentDefaults";

export interface VoiceSkillLaunchRequest {
  dispatchText: string;
  requestContext: Record<string, unknown>;
}

export async function resolveGrowthSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedGrowthWorkbenchCommand;
  serviceSkills: ServiceSkillHomeItem[];
  projectId?: string | null;
  contentId?: string | null;
}): Promise<VoiceSkillLaunchRequest | null> {
  const skill = resolveGrowthCommandServiceSkill(params.serviceSkills);
  if (!skill) {
    toast.error("当前未安装可用的增长跟踪技能，请先同步技能目录后再试");
    return null;
  }

  const prompt = params.parsedCommand.prompt.trim();
  const slotValues: ServiceSkillSlotValues = {
    ...(params.parsedCommand.platformType
      ? {
          platform: params.parsedCommand.platformType,
        }
      : {}),
    ...(params.parsedCommand.accountList
      ? {
          account_list: params.parsedCommand.accountList,
        }
      : {}),
    ...(params.parsedCommand.reportCadence
      ? {
          report_cadence: params.parsedCommand.reportCadence,
        }
      : {}),
    ...(params.parsedCommand.alertThreshold
      ? {
          alert_threshold: params.parsedCommand.alertThreshold,
        }
      : {}),
  };

  if (!slotValues.account_list && !prompt) {
    toast.error("请至少补充目标账号或增长目标后再提交");
    return null;
  }

  const resolvedProjectId = normalizeOptionalText(params.projectId);

  if (!resolvedProjectId && skill.readinessRequirements?.requiresProject) {
    toast.error("请先选择项目后再开始增长跟踪");
    return null;
  }

  return {
    dispatchText: composeServiceSkillPrompt({
      skill,
      slotValues,
      userInput: prompt || undefined,
    }),
    requestContext: {
      kind: "local_service_skill",
      service_scene_run: {
        raw_text: params.rawText,
        user_input: prompt || undefined,
        entry_id: "command:growth_runtime",
        scene_key: "growth_runtime",
        command_prefix: params.parsedCommand.trigger,
        linked_skill_id: skill.id,
        skill_id: skill.id,
        skill_key: skill.skillKey || undefined,
        skill_title: skill.title,
        skill_summary: skill.summary,
        runner_type: skill.runnerType,
        execution_kind: normalizeLocalServiceSkillExecutionKind(
          skill.defaultExecutorBinding,
        ),
        execution_location: "client_default",
        project_id: resolvedProjectId,
        content_id: normalizeOptionalText(params.contentId),
        entry_source: "at_growth_command",
        platform: params.parsedCommand.platformType,
        platform_label: params.parsedCommand.platformLabel,
        account_list: params.parsedCommand.accountList,
        report_cadence: params.parsedCommand.reportCadence,
        alert_threshold: params.parsedCommand.alertThreshold,
        slot_values:
          Object.keys(slotValues).length > 0 ? slotValues : undefined,
      },
    },
  };
}

export async function resolveVoiceSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedVoiceWorkbenchCommand;
  serviceSkills: ServiceSkillHomeItem[];
  projectId?: string | null;
  contentId?: string | null;
  voicePreference?: {
    preferredProviderId?: string;
    preferredModelId?: string;
    allowFallback?: boolean;
  } | null;
}): Promise<VoiceSkillLaunchRequest | null> {
  const skill = resolveVoiceCommandServiceSkill(params.serviceSkills);
  if (!skill) {
    toast.error("当前未安装可用的配音技能，请先同步技能目录后再试");
    return null;
  }

  const prompt =
    params.parsedCommand.prompt.trim() || params.parsedCommand.body.trim();
  if (!prompt) {
    toast.error("请补充清晰的配音要求后再提交");
    return null;
  }

  const resolvedProjectId = normalizeOptionalText(params.projectId);

  if (!resolvedProjectId && skill.readinessRequirements?.requiresProject) {
    toast.error("请先选择项目后再开始配音");
    return null;
  }

  const slotValues: ServiceSkillSlotValues = {
    ...(params.parsedCommand.targetLanguage
      ? {
          target_language: params.parsedCommand.targetLanguage,
        }
      : {}),
    ...(params.parsedCommand.voiceStyle
      ? {
          voice_style: params.parsedCommand.voiceStyle,
        }
      : {}),
  };
  const resolvedVoicePreference = normalizeMediaGenerationPreference(
    params.voicePreference,
  );
  const runtimeContract = resolveVoiceGenerationRuntimeContractBinding();
  const entrySource =
    runtimeContract.boundEntrySources[0] ||
    VOICE_GENERATION_DEFAULT_ENTRY_SOURCE;

  return {
    dispatchText: composeServiceSkillPrompt({
      skill,
      slotValues,
      userInput: prompt,
    }),
    requestContext: {
      kind: "local_service_skill",
      service_scene_run: {
        raw_text: params.rawText,
        user_input: prompt,
        entry_id: "command:voice_runtime",
        scene_key: "voice_runtime",
        command_prefix: params.parsedCommand.trigger,
        linked_skill_id: skill.id,
        skill_id: skill.id,
        skill_key: skill.skillKey || undefined,
        skill_title: skill.title,
        skill_summary: skill.summary,
        runner_type: skill.runnerType,
        execution_kind: normalizeLocalServiceSkillExecutionKind(
          skill.defaultExecutorBinding,
        ),
        execution_location: "client_default",
        project_id: resolvedProjectId,
        content_id: normalizeOptionalText(params.contentId),
        entry_source: entrySource,
        modality_contract_key: runtimeContract.contractKey,
        modality: runtimeContract.modality,
        required_capabilities: runtimeContract.requiredCapabilities,
        routing_slot: runtimeContract.routingSlot,
        runtime_contract: runtimeContract.runtimeContract,
        target_language: params.parsedCommand.targetLanguage,
        voice_style: params.parsedCommand.voiceStyle,
        slot_values:
          Object.keys(slotValues).length > 0 ? slotValues : undefined,
        preferred_provider_id: resolvedVoicePreference.preferredProviderId,
        preferred_model_id: resolvedVoicePreference.preferredModelId,
        allow_fallback: resolvedVoicePreference.allowFallback ?? true,
      },
    },
  };
}
