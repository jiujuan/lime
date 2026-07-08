import type { Skill } from "@/lib/api/skills";
import type { AgentAccessMode } from "../hooks/agentChatStorage";
import type { InputCapabilitySelection } from "../skill-selection/inputCapabilitySelection";
import type { CuratedTaskReferenceEntry } from "../utils/curatedTaskReferenceSelection";

export interface EmptyStateActiveCapabilityViewModel {
  activeBuiltinCommand:
    | Extract<InputCapabilitySelection, { kind: "builtin_command" }>["command"]
    | null;
  activeRuntimeScene:
    | Extract<InputCapabilitySelection, { kind: "runtime_scene" }>["command"]
    | null;
  activeCuratedTask:
    | Extract<InputCapabilitySelection, { kind: "curated_task" }>["task"]
    | null;
  activeCuratedTaskReferenceEntries?: CuratedTaskReferenceEntry[];
  activeSkill: Skill | null;
}

export interface EmptyStateAdvancedControlsState {
  currentModelSummary: string | null;
  trimmedModel: string;
  hasHighlightedAdvancedPreference: boolean;
  shouldShowAdvancedToggle: boolean;
  shouldShowLeftExtra: boolean;
}

export function resolveEmptyStateActiveCapability({
  activeCapability,
  fallbackActiveSkill,
}: {
  activeCapability: InputCapabilitySelection | null;
  fallbackActiveSkill: Skill | null;
}): EmptyStateActiveCapabilityViewModel {
  const activeBuiltinCommand =
    activeCapability?.kind === "builtin_command" &&
    activeCapability.command.key !== "knowledge_pack" &&
    activeCapability.command.key !== "knowledge_settle"
      ? activeCapability.command
      : null;
  const activeRuntimeScene =
    activeCapability?.kind === "runtime_scene"
      ? activeCapability.command
      : null;
  const activeCuratedTask =
    activeCapability?.kind === "curated_task" ? activeCapability.task : null;
  const activeCuratedTaskReferenceEntries =
    activeCapability?.kind === "curated_task"
      ? activeCapability.referenceEntries
      : undefined;
  const activeSkill =
    activeCapability?.kind === "installed_skill"
      ? activeCapability.skill
      : fallbackActiveSkill;

  return {
    activeBuiltinCommand,
    activeRuntimeScene,
    activeCuratedTask,
    activeCuratedTaskReferenceEntries,
    activeSkill,
  };
}

export function resolveCurrentModelSummary({
  providerType,
  model,
  getProviderLabel,
}: {
  providerType: string;
  model: string;
  getProviderLabel: (providerType: string) => string;
}): { currentModelSummary: string | null; trimmedModel: string } {
  const trimmedProviderType = providerType.trim();
  const trimmedModel = model.trim();
  const hasConfiguredModel = Boolean(trimmedProviderType && trimmedModel);

  return {
    currentModelSummary: hasConfiguredModel
      ? `${getProviderLabel(trimmedProviderType)} / ${trimmedModel}`
      : null,
    trimmedModel,
  };
}

export function buildEmptyStateAdvancedControlsState({
  providerType,
  model,
  getProviderLabel,
  subagentEnabled,
  knowledgePackEnabled,
  accessMode,
  isGeneralTheme,
  showCreationModeSelector,
  hasAccessModeSetter,
  hasFileManagerToggle,
  hasKnowledgePackControl,
}: {
  providerType: string;
  model: string;
  getProviderLabel: (providerType: string) => string;
  subagentEnabled: boolean;
  knowledgePackEnabled: boolean;
  accessMode?: AgentAccessMode;
  isGeneralTheme: boolean;
  showCreationModeSelector: boolean;
  hasAccessModeSetter: boolean;
  hasFileManagerToggle: boolean;
  hasKnowledgePackControl: boolean;
}): EmptyStateAdvancedControlsState {
  const shouldShowThemeSpecificExtra = showCreationModeSelector;
  const shouldShowModelControls = true;
  const { currentModelSummary, trimmedModel } = resolveCurrentModelSummary({
    providerType,
    model,
    getProviderLabel,
  });
  const hasHighlightedAdvancedPreference =
    subagentEnabled ||
    knowledgePackEnabled ||
    accessMode === "read-only" ||
    accessMode === "full-access";
  const shouldShowAdvancedToggle =
    isGeneralTheme ||
    shouldShowModelControls ||
    hasAccessModeSetter ||
    shouldShowThemeSpecificExtra ||
    hasFileManagerToggle;

  return {
    currentModelSummary,
    trimmedModel,
    hasHighlightedAdvancedPreference,
    shouldShowAdvancedToggle,
    shouldShowLeftExtra: hasKnowledgePackControl || shouldShowAdvancedToggle,
  };
}
