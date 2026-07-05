import type { Project } from "@/lib/api/project";
import type { AutomationJobRequest } from "@/lib/api/automation";
import type { AutomationJobDialogInitialValues } from "@/components/settings-v2/system/automation/AutomationJobDialog";
import { normalizeThemeType } from "@/lib/workspace/workbenchContract";
import {
  composeServiceSkillPrompt,
  createDefaultServiceSkillSlotValues,
  validateServiceSkillSlotValues,
} from "../service-skills/promptComposer";
import {
  buildServiceSkillAutomationAgentTurnPayloadContext,
  buildServiceSkillAutomationInitialValues,
} from "../service-skills/automationDraft";
import { resolveServiceSkillLaunchPrefill } from "../service-skills/serviceSkillLaunchPrefill";
import { isServiceSkillExecutableAsSiteAdapter } from "../service-skills/siteCapabilityBinding";
import type {
  RecordServiceSkillUsageInput,
  ServiceSkillHomeItem,
  ServiceSkillSlotValues,
} from "../service-skills/types";
import type { CreationReplayMetadata } from "../utils/creationReplayMetadata";
import { normalizeProjectId } from "../utils/topicProjectResolution";

export interface ServiceSkillLaunchUserInputOptions {
  launchUserInput?: string | null;
}

export interface ServiceSkillSelectionOptions {
  requestKey?: number | string;
  initialSlotValues?: ServiceSkillSlotValues;
  prefillHint?: string;
  launchUserInput?: string | null;
}

export interface PendingServiceSkillLaunchInputState {
  requestKey: string;
  skill: ServiceSkillHomeItem;
  initialSlotValues: ServiceSkillSlotValues;
  prefillHint?: string;
  launchUserInput?: string;
}

export interface PendingServiceSkillAutomationLaunch {
  skill: ServiceSkillHomeItem;
  prompt: string;
  slotValues: ServiceSkillSlotValues;
  userInput?: string;
  threadLineage: ServiceSkillAutomationThreadLineage;
  usage: RecordServiceSkillUsageInput;
}

export interface ServiceSkillAutomationThreadLineage {
  sessionId: string;
  threadId: string;
}

export interface ServiceSkillAutomationSetupState {
  dialogInitialValues: AutomationJobDialogInitialValues;
  pendingAutomation: PendingServiceSkillAutomationLaunch;
}

export type ServiceSkillSelectionPlan =
  | {
      kind: "launch";
      slotValues: ServiceSkillSlotValues;
      launchUserInput?: string;
    }
  | {
      kind: "pending";
      pendingInput: PendingServiceSkillLaunchInputState;
    };

export interface BuildServiceSkillSelectionPlanInput {
  skill: ServiceSkillHomeItem;
  options?: ServiceSkillSelectionOptions;
  creationReplay?: CreationReplayMetadata;
  nextRequestCount: number;
}

export interface BuildServiceSkillAutomationSetupStateInput {
  skill: ServiceSkillHomeItem;
  slotValues: ServiceSkillSlotValues;
  input: string;
  workspaceId: string;
  threadLineage: ServiceSkillAutomationThreadLineage;
}

export interface ShouldCreateServiceSkillAutomationContentInput {
  pendingAutomation?: PendingServiceSkillAutomationLaunch | null;
  request: AutomationJobRequest;
  contentId?: string | null;
}

export interface BuildServiceSkillAutomationSubmitRequestInput {
  pendingAutomation?: PendingServiceSkillAutomationLaunch | null;
  request: AutomationJobRequest;
  contentId?: string | null;
}

export interface ServiceSkillAutomationSubmitRequestPlan {
  request: AutomationJobRequest;
  automationContentId: string | null;
}

export function getWorkspaceServiceSkillErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "请稍后重试";
}

export function normalizeWorkspaceServiceSkillOptionalText(
  value?: string | null,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

export function siteSkillRequiresProject(skill: ServiceSkillHomeItem): boolean {
  if (!isServiceSkillExecutableAsSiteAdapter(skill)) {
    return false;
  }

  return (
    skill.readinessRequirements?.requiresProject ||
    (skill.siteCapabilityBinding.saveMode ?? "project_resource") ===
      "project_resource"
  );
}

export function resolveServiceSkillLaunchUserInput(
  currentInput: string,
  options?: ServiceSkillLaunchUserInputOptions,
): string | undefined {
  if (options && "launchUserInput" in options) {
    return normalizeWorkspaceServiceSkillOptionalText(options.launchUserInput);
  }

  return normalizeWorkspaceServiceSkillOptionalText(currentInput);
}

export function buildServiceSkillSelectionPlan({
  skill,
  options,
  creationReplay,
  nextRequestCount,
}: BuildServiceSkillSelectionPlanInput): ServiceSkillSelectionPlan {
  const replayPrefill = resolveServiceSkillLaunchPrefill({
    skill,
    creationReplay,
  });
  const launchUserInput =
    normalizeWorkspaceServiceSkillOptionalText(options?.launchUserInput) ??
    replayPrefill?.launchUserInput;
  const initialSlotValues = {
    ...createDefaultServiceSkillSlotValues(skill),
    ...(replayPrefill?.slotValues || {}),
    ...(options?.initialSlotValues || {}),
  };
  const validation = validateServiceSkillSlotValues(skill, initialSlotValues);

  if (skill.slotSchema.length === 0 || validation.valid) {
    return {
      kind: "launch",
      slotValues: initialSlotValues,
      launchUserInput,
    };
  }

  return {
    kind: "pending",
    pendingInput: {
      requestKey:
        options?.requestKey === undefined
          ? `${skill.id}:${nextRequestCount}`
          : `${skill.id}:${options.requestKey}`,
      skill,
      initialSlotValues,
      prefillHint: options?.prefillHint ?? replayPrefill?.hint,
      launchUserInput,
    },
  };
}

export function buildServiceSkillAutomationSetupState({
  skill,
  slotValues,
  input,
  workspaceId,
  threadLineage,
}: BuildServiceSkillAutomationSetupStateInput): ServiceSkillAutomationSetupState {
  const userInput = normalizeWorkspaceServiceSkillOptionalText(input);
  const prompt = composeServiceSkillPrompt({
    skill,
    slotValues,
    userInput,
  });

  return {
    dialogInitialValues: buildServiceSkillAutomationInitialValues({
      skill,
      slotValues,
      userInput,
      workspaceId,
    }),
    pendingAutomation: {
      skill,
      prompt,
      slotValues,
      userInput,
      threadLineage,
      usage: {
        skillId: skill.id,
        runnerType: skill.runnerType,
        slotValues,
      },
    },
  };
}

export function shouldCreateServiceSkillAutomationContent({
  pendingAutomation,
  request,
  contentId,
}: ShouldCreateServiceSkillAutomationContentInput): boolean {
  return Boolean(
    pendingAutomation && request.payload.kind === "agent_turn" && !contentId,
  );
}

export function buildServiceSkillAutomationSubmitRequest({
  pendingAutomation,
  request,
  contentId,
}: BuildServiceSkillAutomationSubmitRequestInput): ServiceSkillAutomationSubmitRequestPlan {
  const automationContentId = contentId ?? null;

  if (!pendingAutomation || request.payload.kind !== "agent_turn") {
    return {
      request,
      automationContentId,
    };
  }

  return {
    request: {
      ...request,
      payload: {
        ...request.payload,
        session_id: pendingAutomation.threadLineage.sessionId,
        thread_id: pendingAutomation.threadLineage.threadId,
        ...buildServiceSkillAutomationAgentTurnPayloadContext({
          skill: pendingAutomation.skill,
          slotValues: pendingAutomation.slotValues,
          userInput: pendingAutomation.userInput,
          contentId: automationContentId,
        }),
      },
    },
    automationContentId,
  };
}

export function resolveFallbackProjectType(
  theme?: string,
): Project["workspaceType"] {
  return normalizeThemeType(theme);
}

export function buildFallbackAutomationWorkspace(
  projectId: string,
  theme?: string,
): Project {
  return {
    id: projectId,
    name: projectId,
    workspaceType: resolveFallbackProjectType(theme),
    rootPath: "",
    isDefault: false,
    createdAt: 0,
    updatedAt: 0,
    isFavorite: false,
    isArchived: false,
    tags: [],
  };
}

export function prioritizeAutomationWorkspaces(
  workspaces: Project[],
  projectId?: string | null,
  theme?: string,
): Project[] {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) {
    return workspaces;
  }

  const matched = workspaces.find(
    (workspace) => workspace.id === normalizedProjectId,
  );
  const fallbackWorkspace =
    matched ?? buildFallbackAutomationWorkspace(normalizedProjectId, theme);
  const remaining = workspaces.filter(
    (workspace) => workspace.id !== normalizedProjectId,
  );

  return [fallbackWorkspace, ...remaining];
}
