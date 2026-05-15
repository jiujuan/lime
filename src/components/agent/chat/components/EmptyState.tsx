import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styled, { keyframes } from "styled-components";
import { useTranslation } from "react-i18next";
import { getConfig } from "@/lib/api/appConfig";
import {
  getSkillCatalog,
  listSkillCatalogEntries,
  listSkillCatalogSceneEntries,
  subscribeSkillCatalogChanged,
  type SkillCatalogEntry,
  type SkillCatalogSceneEntry,
} from "@/lib/api/skillCatalog";
import type { CreationMode } from "./types";
import { toast } from "sonner";
import {
  buildRecommendationPrompt,
  getContextualRecommendations,
  isTeamRuntimeRecommendation,
} from "../utils/contextualRecommendations";
import {
  buildCuratedTaskLaunchPrompt,
  buildCuratedTaskTemplateCopy,
  findCuratedTaskTemplateById,
  listCuratedTaskTemplates,
  recordCuratedTaskTemplateUsage,
  replaceCuratedTaskLaunchPromptInInput,
  resolveCuratedTaskTemplateLaunchPrefill,
  subscribeCuratedTaskTemplateUsageChanged,
  type CuratedTaskInputValues,
  type CuratedTaskTemplateItem,
} from "../utils/curatedTaskTemplates";
import { subscribeCuratedTaskRecommendationSignalsChanged } from "../utils/curatedTaskRecommendationSignals";
import {
  extractCuratedTaskReferenceMemoryIds,
  mergeCuratedTaskReferenceEntries,
  normalizeCuratedTaskReferenceMemoryIds,
} from "../utils/curatedTaskReferenceSelection";
import type {
  CuratedTaskReferenceEntry,
  CuratedTaskReferenceSelection,
} from "../utils/curatedTaskReferenceSelection";
import { CuratedTaskLauncherDialog } from "./CuratedTaskLauncherDialog";
import { EmptyStateComposerPanel } from "./EmptyStateComposerPanel";
import { EmptyStateHero } from "./EmptyStateHero";
import { EmptyStateQuickActions } from "./EmptyStateQuickActions";
import {
  EMPTY_STATE_CONTENT_WRAPPER_CLASSNAME,
  EMPTY_STATE_PAGE_CONTAINER_CLASSNAME,
} from "./emptyStateSurfaceTokens";
import {
  buildSkillSelectionProps,
  type SkillSelectionSourceProps,
} from "../skill-selection/skillSelectionBindings";
import type { Character } from "@/lib/api/memory";
import type { WorkspaceSettings } from "@/types/workspace";
import type { MessageImage, MessagePathReference } from "../types";
import type { TeamDefinition } from "../utils/teamDefinitions";
import { isGeneralResearchTheme } from "../utils/generalAgentPrompt";
import type { AgentAccessMode } from "../hooks/agentChatStorage";
import {
  getClipboardImageCandidates,
  readImageAttachment,
} from "../utils/imageAttachments";
import {
  buildPathReferenceRequestMetadata,
  readCustomPathReferencesFromDataTransfer,
  readSystemPathReferencesFromFiles,
} from "../utils/pathReferences";
import { buildKnowledgeRequestMetadata } from "@/features/knowledge/agent/knowledgeMetadata";
import {
  resolveInputCapabilityDispatch,
  resolveInputCapabilitySelectionFromRoute,
  type InputCapabilitySelection,
} from "../skill-selection/inputCapabilitySelection";
import type { AgentInitialInputCapabilityParams } from "@/types/page";
import type { AgentI18nResource } from "@/i18n/agentResources";
import type {
  InputbarKnowledgePackOption,
  InputbarKnowledgePackSelection,
} from "./Inputbar/types";
import {
  listSlashEntryUsage,
  subscribeSlashEntryUsageChanged,
} from "../skill-selection/slashEntryUsage";
import {
  getSiteSkillAutoLaunchExample,
  hasAutoLaunchableSiteSkill,
} from "../service-skills/siteSkillExamplePrompts";
import { buildServiceSkillHomeCopy } from "../service-skills/homeCopy";
import { listFeaturedHomeServiceSkills } from "../service-skills/homeEntrySkills";
import type { RuntimeToolAvailability } from "../utils/runtimeToolAvailability";
import type { AgentTaskRuntimeCardModel } from "../utils/agentTaskRuntime";
import type { HandleSendOptions } from "../hooks/handleSendTypes";
import type { CreationReplaySurfaceModel } from "../utils/creationReplaySurface";
import {
  HomeStartSurface,
  type HomeSupplementalAction,
} from "../home/HomeStartSurface";
import { HomeSkillGallery } from "../home/HomeSkillGallery";
import {
  buildHomeGalleryItems,
  buildHomeGuideCards,
  buildHomeInputSuggestions,
  buildHomeSkillItems,
  buildHomeSkillSections,
  buildHomeStarterChips,
} from "../home/buildHomeSkillSurface";
import { buildHomeSurfaceCopy } from "../home/homeSurfaceCopy";
import { buildInputbarCoreCopy } from "./Inputbar/components/inputbarCoreCopy";
import { buildInputbarExecutionStrategyCopy } from "./Inputbar/inputbarWorkflowCopy";
import type {
  HomeGuideCard,
  HomeSkillSurfaceItem,
  HomeStarterChip,
} from "../home/homeSurfaceTypes";

type AgentI18nKey = keyof AgentI18nResource;

const contentReveal = keyframes`
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.992);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

const PageContainer = styled.div.attrs({
  className: EMPTY_STATE_PAGE_CONTAINER_CLASSNAME,
})`
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-behavior: smooth;
  scroll-snap-type: y mandatory;
  isolation: isolate;
  background:
    radial-gradient(
      circle at 8% 12%,
      var(--lime-home-glow-primary, rgba(132, 204, 22, 0.08)),
      transparent 28%
    ),
    radial-gradient(
      circle at 76% 16%,
      var(--lime-home-glow-secondary, rgba(186, 230, 253, 0.16)),
      transparent 30%
    ),
    linear-gradient(
      180deg,
      var(--lime-home-bg-start, #f8fcf7) 0%,
      var(--lime-home-bg-mid, #f9fbf8) 42%,
      var(--lime-home-bg-end, #f5faf7) 100%
    );
`;

const ContentWrapper = styled.div.attrs({
  className: EMPTY_STATE_CONTENT_WRAPPER_CLASSNAME,
})`
  display: flex;
  flex: 0 0 auto;
  min-height: 100%;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  animation: ${contentReveal} 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
  padding: 0.45rem 0.25rem 4.7rem;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const ComposerGlowFrame = styled.div`
  position: relative;
  isolation: isolate;

  &::after {
    content: "";
    position: absolute;
    left: clamp(1.5rem, 9vw, 7rem);
    right: clamp(1.5rem, 9vw, 7rem);
    bottom: -1.1rem;
    z-index: 0;
    height: clamp(34px, 5vw, 58px);
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(187, 247, 208, 0.18) 16%,
      rgba(110, 231, 183, 0.36) 42%,
      rgba(45, 212, 191, 0.34) 58%,
      rgba(186, 230, 253, 0.18) 84%,
      transparent 100%
    );
    filter: blur(18px);
    opacity: 0.86;
    pointer-events: none;
  }

  > * {
    position: relative;
    z-index: 1;
  }
`;

const ScrollCue = styled.a`
  position: absolute;
  left: 50%;
  bottom: clamp(0.7rem, 1.9vh, 1.25rem);
  z-index: 0;
  display: grid;
  width: min(680px, calc(100% - 2rem));
  max-width: calc(100% - 2rem);
  grid-template-columns: minmax(64px, 1fr) auto minmax(64px, 1fr);
  align-items: center;
  justify-content: center;
  gap: 0.9rem;
  transform: translateX(-50%);
  padding: 0.35rem 0;
  color: var(--lime-brand-strong, rgb(47 83 60));
  font-size: 13px;
  font-weight: 760;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  pointer-events: none;
  transition:
    color 160ms ease,
    transform 160ms ease;

  &:hover {
    color: var(--lime-text, rgb(71 85 105));
    transform: translateX(-50%) translateY(-1px);
  }
`;

const ScrollCueLine = styled.span`
  display: block;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--lime-surface-border-strong, rgba(203, 213, 225, 0.82)) 18%,
    var(--lime-surface-border-strong, rgba(203, 213, 225, 0.82)) 82%,
    transparent 100%
  );
`;

const ScrollCueText = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  border-radius: 999px;
  border: 1px solid rgba(187, 247, 208, 0.86);
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.94),
      rgba(240, 253, 244, 0.88)
    ),
    var(--lime-surface, #fff);
  padding: 0.42rem 0.78rem;
  box-shadow:
    0 10px 28px rgba(15, 23, 42, 0.055),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
`;

const ScrollCueArrow = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  font-size: 14px;
  line-height: 1;
`;

const SecondScreenSection = styled.section`
  display: flex;
  flex: 0 0 auto;
  min-height: 100%;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  overscroll-behavior: auto;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  padding: clamp(3.5rem, 8vh, 6rem) 0.25rem clamp(3rem, 8vh, 5.5rem);
`;

const SecondScreenInner = styled.div`
  width: min(1180px, 100%);
  min-width: 0;
`;

interface EmptyStateProps extends SkillSelectionSourceProps {
  input: string;
  setInput: (value: string) => void;
  onSend: (
    value: string,
    executionStrategy?: "react" | "code_orchestrated" | "auto",
    images?: MessageImage[],
    sendOptions?: HandleSendOptions,
  ) => void;
  isLoading?: boolean;
  disabled?: boolean;
  /** 创作模式 */
  creationMode?: CreationMode;
  /** 创作模式变更回调 */
  onCreationModeChange?: (mode: CreationMode) => void;
  /** 当前激活的主题 */
  activeTheme?: string;
  /** 主题变更回调 */
  onThemeChange?: (theme: string) => void;
  /** 推荐标签点击回调 */
  onRecommendationClick?: (shortLabel: string, fullPrompt: string) => void;
  providerType: string;
  setProviderType: (type: string) => void;
  model: string;
  setModel: (model: string) => void;
  executionStrategy?: "react" | "code_orchestrated" | "auto";
  setExecutionStrategy?: (
    strategy: "react" | "code_orchestrated" | "auto",
  ) => void;
  accessMode?: AgentAccessMode;
  setAccessMode?: (mode: AgentAccessMode) => void;
  onManageProviders?: () => void;
  webSearchEnabled?: boolean;
  onWebSearchEnabledChange?: (enabled: boolean) => void;
  thinkingEnabled?: boolean;
  onThinkingEnabledChange?: (enabled: boolean) => void;
  subagentEnabled?: boolean;
  onSubagentEnabledChange?: (enabled: boolean) => void;
  selectedTeam?: TeamDefinition | null;
  onSelectTeam?: (team: TeamDefinition | null) => void;
  onEnableSuggestedTeam?: (suggestedPresetId?: string) => void;
  teamWorkspaceSettings?: WorkspaceSettings | null;
  onPersistCustomTeams?: (teams: TeamDefinition[]) => void | Promise<void>;
  hasCanvasContent?: boolean;
  hasContentId?: boolean;
  selectedText?: string;
  /** 角色列表（用于 @ 引用） */
  characters?: Character[];
  /** 启动浏览器协助 */
  onLaunchBrowserAssist?: () => void | Promise<void>;
  /** 浏览器协助启动中 */
  browserAssistLoading?: boolean;
  /** 最近会话标题 */
  recentSessionTitle?: string | null;
  /** 最近会话摘要 */
  recentSessionSummary?: string | null;
  /** 最近会话恢复动作文案 */
  recentSessionActionLabel?: string;
  /** 恢复最近一次会话上下文 */
  onResumeRecentSession?: () => void;
  /** 当前项目 ID */
  projectId?: string | null;
  /** 当前会话 ID */
  sessionId?: string | null;
  /** 当前 runtime tool surface */
  runtimeToolAvailability?: RuntimeToolAvailability | null;
  /** 当前执行态摘要 */
  runtimeTaskCard?: AgentTaskRuntimeCardModel | null;
  /** 进入首页时预选的输入框能力 */
  initialInputCapability?: AgentInitialInputCapabilityParams;
  /** 打开记忆工作台 */
  onOpenMemoryWorkbench?: () => void;
  /** 打开消息渠道 */
  onOpenChannels?: () => void;
  /** 打开浏览器连接器 */
  onOpenChromeRelay?: () => void;
  /** 当前带入的 creation replay 前台投影 */
  creationReplaySurface?: CreationReplaySurfaceModel | null;
  /** 当前结果模板默认带入的 memory 引用 id */
  defaultCuratedTaskReferenceMemoryIds?: string[];
  /** 当前结果模板默认带入的参考对象 */
  defaultCuratedTaskReferenceEntries?: CuratedTaskReferenceEntry[];
  /** 当前项目资料选择态 */
  knowledgePackSelection?: InputbarKnowledgePackSelection | null;
  /** 当前项目可选资料 */
  knowledgePackOptions?: InputbarKnowledgePackOption[];
  /** 启用 / 关闭当前项目资料 */
  onToggleKnowledgePack?: (enabled: boolean) => void;
  /** 切换当前项目资料 */
  onSelectKnowledgePack?: (packName: string) => void;
  /** 显式选择 / 取消一份协同资料 */
  onToggleKnowledgeCompanionPack?: (packName: string, enabled: boolean) => void;
  /** 从当前输入或会话沉淀项目资料 */
  onStartKnowledgeOrganize?: () => void;
  /** 打开项目资料管理 */
  onManageKnowledgePacks?: () => void;
  /** 输入框已添加的本地文件/文件夹引用 */
  pathReferences?: MessagePathReference[];
  onAddPathReferences?: (references: MessagePathReference[]) => void;
  onImportPathReferenceAsKnowledge?: (reference: MessagePathReference) => void;
  onRemovePathReference?: (id: string) => void;
  onClearPathReferences?: () => void;
  fileManagerOpen?: boolean;
  onToggleFileManager?: () => void;
}

const CREATION_THEMES: string[] = [];

const THEME_ICONS: Record<string, string> = {
  general: "✨",
};

function truncatePrompt(value: string, maxLength = 92) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trim()}…`;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  input,
  setInput,
  onSend,
  creationMode = "guided",
  onCreationModeChange,
  activeTheme = "general",
  onThemeChange,
  onRecommendationClick,
  providerType,
  setProviderType,
  model,
  setModel,
  executionStrategy = "react",
  setExecutionStrategy,
  accessMode,
  setAccessMode,
  onManageProviders,
  webSearchEnabled = false,
  onWebSearchEnabledChange,
  thinkingEnabled = false,
  onThinkingEnabledChange,
  subagentEnabled = false,
  onSubagentEnabledChange,
  selectedTeam = null,
  onSelectTeam,
  onEnableSuggestedTeam,
  teamWorkspaceSettings,
  onPersistCustomTeams,
  hasCanvasContent = false,
  hasContentId = false,
  selectedText = "",
  characters = [],
  skills,
  serviceSkills,
  serviceSkillGroups,
  isSkillsLoading,
  onSelectServiceSkill,
  onNavigateToSettings,
  onImportSkill,
  onRefreshSkills,
  onLaunchBrowserAssist,
  recentSessionTitle = null,
  recentSessionSummary = null,
  recentSessionActionLabel,
  onResumeRecentSession,
  projectId = null,
  sessionId = null,
  isLoading = false,
  disabled = false,
  initialInputCapability,
  creationReplaySurface = null,
  defaultCuratedTaskReferenceMemoryIds,
  defaultCuratedTaskReferenceEntries,
  knowledgePackSelection = null,
  knowledgePackOptions = [],
  onToggleKnowledgePack,
  onSelectKnowledgePack,
  onToggleKnowledgeCompanionPack,
  onStartKnowledgeOrganize,
  onManageKnowledgePacks,
  pathReferences = [],
  onAddPathReferences,
  onImportPathReferenceAsKnowledge,
  onRemovePathReference,
  onClearPathReferences,
  fileManagerOpen = false,
  onToggleFileManager,
}) => {
  const { t } = useTranslation("agent");
  const translateAgentCopyKey = useCallback(
    (key: string, values?: Record<string, number | string>) =>
      t(key as AgentI18nKey, values ?? {}),
    [t],
  );
  const curatedTaskTemplateCopy = useMemo(
    () => buildCuratedTaskTemplateCopy(translateAgentCopyKey),
    [translateAgentCopyKey],
  );
  const serviceSkillHomeCopy = useMemo(
    () => buildServiceSkillHomeCopy(translateAgentCopyKey),
    [translateAgentCopyKey],
  );
  const homeSurfaceCopy = useMemo(
    () => buildHomeSurfaceCopy(translateAgentCopyKey),
    [translateAgentCopyKey],
  );
  const inputbarCoreCopy = useMemo(
    () => buildInputbarCoreCopy(translateAgentCopyKey),
    [translateAgentCopyKey],
  );
  const executionStrategyCopy = useMemo(
    () => buildInputbarExecutionStrategyCopy(translateAgentCopyKey),
    [translateAgentCopyKey],
  );
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const handledInitialInputCapabilitySignatureRef = useRef("");
  const [activeCapability, setActiveCapability] =
    useState<InputCapabilitySelection | null>(null);
  const [knowledgeHubOpenRequestKey, setKnowledgeHubOpenRequestKey] =
    useState(0);
  const activeCuratedTaskCapability =
    activeCapability?.kind === "curated_task" ? activeCapability : null;
  const activeCuratedTask = activeCuratedTaskCapability?.task ?? null;
  const activeCuratedTaskLaunchInputValues =
    activeCuratedTaskCapability?.launchInputValues;
  const activeCuratedTaskReferenceMemoryIds =
    activeCuratedTaskCapability?.referenceMemoryIds;
  const activeCuratedTaskReferenceEntries =
    activeCuratedTaskCapability?.referenceEntries;
  const effectiveDefaultCuratedTaskReferenceMemoryIds = useMemo(
    () =>
      defaultCuratedTaskReferenceMemoryIds ??
      creationReplaySurface?.defaultReferenceMemoryIds ??
      [],
    [
      creationReplaySurface?.defaultReferenceMemoryIds,
      defaultCuratedTaskReferenceMemoryIds,
    ],
  );
  const effectiveDefaultCuratedTaskReferenceEntries = useMemo(
    () =>
      defaultCuratedTaskReferenceEntries ??
      creationReplaySurface?.defaultReferenceEntries ??
      [],
    [
      creationReplaySurface?.defaultReferenceEntries,
      defaultCuratedTaskReferenceEntries,
    ],
  );
  const currentSkill =
    activeCapability?.kind === "installed_skill"
      ? activeCapability.skill
      : null;
  const activeBuiltinCommandKey =
    activeCapability?.kind === "builtin_command"
      ? activeCapability.command.key
      : null;
  const clearSelectedSkill = useCallback(() => {
    setActiveCapability(null);
  }, []);
  const initialInputCapabilitySignature = useMemo(() => {
    const route = initialInputCapability?.capabilityRoute;
    if (!route) {
      return "";
    }

    return JSON.stringify({
      requestKey: initialInputCapability.requestKey ?? 0,
      route,
    });
  }, [initialInputCapability]);

  useEffect(() => {
    if (!initialInputCapabilitySignature) {
      handledInitialInputCapabilitySignatureRef.current = "";
      return;
    }

    if (
      handledInitialInputCapabilitySignatureRef.current ===
      initialInputCapabilitySignature
    ) {
      return;
    }

    const route = initialInputCapability?.capabilityRoute;
    if (!route) {
      return;
    }

    handledInitialInputCapabilitySignatureRef.current =
      initialInputCapabilitySignature;
    const resolvedCapability = resolveInputCapabilitySelectionFromRoute({
      route,
      skills,
    });

    if (
      route.kind === "curated_task" &&
      !input.trim() &&
      route.prompt.trim().length > 0
    ) {
      setInput(route.prompt);
    }

    setActiveCapability(resolvedCapability);
  }, [
    initialInputCapability,
    initialInputCapabilitySignature,
    input,
    setInput,
    skills,
  ]);
  const handleSelectInputCapability = useCallback(
    (capability: InputCapabilitySelection) => {
      if (capability.kind === "service_skill") {
        setActiveCapability(null);
        onSelectServiceSkill?.(capability.skill);
        return;
      }
      if (capability.kind === "builtin_command") {
        if (capability.command.key === "knowledge_pack") {
          if (!knowledgePackSelection && !onStartKnowledgeOrganize) {
            onManageKnowledgePacks?.();
          } else {
            setKnowledgeHubOpenRequestKey((current) => current + 1);
          }
          setActiveCapability(null);
          return;
        }

        if (capability.command.key === "knowledge_settle") {
          onStartKnowledgeOrganize?.();
          setActiveCapability(null);
          return;
        }
      }
      setActiveCapability(capability);
    },
    [
      knowledgePackSelection,
      onManageKnowledgePacks,
      onSelectServiceSkill,
      onStartKnowledgeOrganize,
    ],
  );
  useEffect(() => {
    if (activeBuiltinCommandKey !== "knowledge_pack") {
      return;
    }
    setActiveCapability(null);
    if (!knowledgePackSelection && !onStartKnowledgeOrganize) {
      onManageKnowledgePacks?.();
      return;
    }
    setKnowledgeHubOpenRequestKey((current) => current + 1);
  }, [
    activeBuiltinCommandKey,
    knowledgePackSelection,
    onManageKnowledgePacks,
    onStartKnowledgeOrganize,
  ]);
  const skillSelection = buildSkillSelectionProps({
    skills,
    serviceSkills,
    serviceSkillGroups,
    isSkillsLoading,
    activeSkill: currentSkill,
    onSelectInputCapability: handleSelectInputCapability,
    onClearSkill: clearSelectedSkill,
    onNavigateToSettings,
    onImportSkill,
    onRefreshSkills,
  });
  const hasAutoLaunchSiteSkill = hasAutoLaunchableSiteSkill(serviceSkills);
  const siteSkillAutoLaunchExample =
    getSiteSkillAutoLaunchExample(serviceSkills);

  const [
    appendSelectedTextToRecommendation,
    setAppendSelectedTextToRecommendation,
  ] = useState(true);
  const [curatedTaskTemplatesVersion, setCuratedTaskTemplatesVersion] =
    useState(0);
  const [
    curatedTaskRecommendationSignalsVersion,
    setCuratedTaskRecommendationSignalsVersion,
  ] = useState(0);
  const [slashEntryUsageVersion, setSlashEntryUsageVersion] = useState(0);
  const [curatedTaskLauncherTask, setCuratedTaskLauncherTask] =
    useState<CuratedTaskTemplateItem | null>(null);
  const [
    curatedTaskLauncherInitialInputValues,
    setCuratedTaskLauncherInitialInputValues,
  ] = useState<CuratedTaskInputValues | null>(null);
  const [
    curatedTaskLauncherInitialReferenceMemoryIds,
    setCuratedTaskLauncherInitialReferenceMemoryIds,
  ] = useState<string[] | null>(null);
  const [
    curatedTaskLauncherInitialReferenceEntries,
    setCuratedTaskLauncherInitialReferenceEntries,
  ] = useState<CuratedTaskReferenceEntry[] | null>(null);
  const [curatedTaskLauncherPrefillHint, setCuratedTaskLauncherPrefillHint] =
    useState<string | null>(null);

  useEffect(() => {
    const loadConfigPreferences = async () => {
      try {
        const loadedConfig = await getConfig();
        setAppendSelectedTextToRecommendation(
          loadedConfig.chat_appearance
            ?.append_selected_text_to_recommendation ?? true,
        );
      } catch (e) {
        console.error("加载入口配置失败:", e);
      }
    };
    void loadConfigPreferences();

    const handleConfigChange = () => {
      void loadConfigPreferences();
    };
    window.addEventListener(
      "chat-appearance-config-changed",
      handleConfigChange,
    );

    return () => {
      window.removeEventListener(
        "chat-appearance-config-changed",
        handleConfigChange,
      );
    };
  }, []);

  useEffect(() => {
    return subscribeCuratedTaskTemplateUsageChanged(() => {
      setCuratedTaskTemplatesVersion((previous) => previous + 1);
    });
  }, []);

  useEffect(() => {
    return subscribeCuratedTaskRecommendationSignalsChanged(() => {
      setCuratedTaskRecommendationSignalsVersion((previous) => previous + 1);
    });
  }, []);

  useEffect(() => {
    return subscribeSlashEntryUsageChanged(() => {
      setSlashEntryUsageVersion((previous) => previous + 1);
    });
  }, []);

  // 使用外部传入的 activeTheme，如果有 onThemeChange 则使用受控模式
  const handleThemeChange = useCallback(
    (theme: string) => {
      if (onThemeChange) {
        onThemeChange(theme === "general" ? theme : "general");
      }
    },
    [onThemeChange],
  );

  // 判断当前主题是否需要显示创作模式选择器
  const showCreationModeSelector = CREATION_THEMES.includes(activeTheme);

  const [pendingImages, setPendingImages] = useState<MessageImage[]>([]);
  const isGeneralTheme = isGeneralResearchTheme(activeTheme);
  const isComposerBusy = isLoading || disabled;

  const recommendationSelectedText = appendSelectedTextToRecommendation
    ? selectedText
    : "";

  const currentRecommendations = useMemo(() => {
    return getContextualRecommendations({
      activeTheme,
      input,
      creationMode,
      hasCanvasContent,
      hasContentId,
      selectedText: recommendationSelectedText,
      subagentEnabled,
    });
  }, [
    activeTheme,
    input,
    creationMode,
    hasCanvasContent,
    hasContentId,
    recommendationSelectedText,
    subagentEnabled,
  ]);

  const curatedTaskTemplates = useMemo(() => {
    void curatedTaskTemplatesVersion;
    void curatedTaskRecommendationSignalsVersion;
    return listCuratedTaskTemplates(curatedTaskTemplateCopy);
  }, [
    curatedTaskRecommendationSignalsVersion,
    curatedTaskTemplateCopy,
    curatedTaskTemplatesVersion,
  ]);

  const selectedTextPreview = useMemo(() => {
    const normalized = (recommendationSelectedText || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!normalized) {
      return "";
    }

    return normalized.length > 56
      ? `${normalized.slice(0, 56).trim()}…`
      : normalized;
  }, [recommendationSelectedText]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      void readImageAttachment(file)
        .then((image) => {
          setPendingImages((prev) => [...prev, image]);
        })
        .catch(() => {
          toast.error(
            homeSurfaceCopy.toast.imageReadFailed(
              file.name || homeSurfaceCopy.toast.unnamedImage,
            ),
          );
        });
    });

    e.target.value = "";
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = getClipboardImageCandidates(event.clipboardData);
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    imageFiles.forEach(({ file, mediaType }, index) => {
      void readImageAttachment(file, mediaType)
        .then((image) => {
          setPendingImages((prev) => [...prev, image]);
          if (index === 0) {
            toast.success(homeSurfaceCopy.toast.imagePasted);
          }
        })
        .catch(() => {
          toast.error(
            homeSurfaceCopy.toast.imageReadFailed(
              file.name || homeSurfaceCopy.toast.unnamedImage,
            ),
          );
        });
    });
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: React.DragEvent) => {
    const customReferences = readCustomPathReferencesFromDataTransfer(
      event.dataTransfer,
    );
    if (customReferences.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      onAddPathReferences?.(customReferences);
      return;
    }

    const files = event.dataTransfer.files;
    const systemReferences =
      files && files.length > 0 ? readSystemPathReferencesFromFiles(files) : [];
    if (systemReferences.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      onAddPathReferences?.(systemReferences);
      return;
    }

    const imageFiles = getClipboardImageCandidates(event.dataTransfer);
    if (imageFiles.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      imageFiles.forEach(({ file, mediaType }, index) => {
        void readImageAttachment(file, mediaType)
          .then((image) => {
            setPendingImages((prev) => [...prev, image]);
            if (index === 0) {
              toast.success(homeSurfaceCopy.toast.imageAdded);
            }
          })
          .catch(() => {
            toast.error(
              homeSurfaceCopy.toast.imageReadFailed(
                file.name || homeSurfaceCopy.toast.unnamedImage,
              ),
            );
          });
      });
      return;
    }

    if (files && files.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      toast.error(homeSurfaceCopy.toast.systemPathDropUnsupported);
    }
  };

  const handleRemoveImage = (index: number) => {
    setPendingImages((prev) =>
      prev.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  const handleSend = (inputOverride = input) => {
    const hasPathReferences = pathReferences.length > 0;
    if (
      isComposerBusy ||
      (!inputOverride.trim() &&
        pendingImages.length === 0 &&
        !hasPathReferences)
    ) {
      return;
    }
    const imagesToSend = pendingImages.length > 0 ? pendingImages : undefined;
    const capabilityDispatch = resolveInputCapabilityDispatch(
      activeCapability,
      inputOverride,
    );
    const baseRequestMetadata = buildPathReferenceRequestMetadata(
      capabilityDispatch.requestMetadata,
      pathReferences,
    );
    const requestMetadata =
      knowledgePackSelection?.enabled &&
      knowledgePackSelection.packName.trim() &&
      knowledgePackSelection.workingDir.trim()
        ? {
            ...(baseRequestMetadata || {}),
            ...buildKnowledgeRequestMetadata({
              workingDir: knowledgePackSelection.workingDir.trim(),
              packName: knowledgePackSelection.packName.trim(),
              packs: knowledgePackSelection.companionPacks,
              source: "inputbar",
            }),
          }
        : baseRequestMetadata;
    const effectiveInput = inputOverride.trim()
      ? inputOverride
      : hasPathReferences
        ? homeSurfaceCopy.composerPathReferenceFallbackPrompt
        : inputOverride;
    const sendOptions =
      capabilityDispatch.capabilityRoute ||
      capabilityDispatch.displayContent ||
      requestMetadata
        ? {
            ...(capabilityDispatch.capabilityRoute
              ? { capabilityRoute: capabilityDispatch.capabilityRoute }
              : {}),
            ...(capabilityDispatch.displayContent
              ? { displayContent: capabilityDispatch.displayContent }
              : {}),
            ...(requestMetadata ? { requestMetadata } : {}),
          }
        : undefined;

    if (sendOptions) {
      onSend(effectiveInput, executionStrategy, imagesToSend, sendOptions);
    } else {
      onSend(effectiveInput, executionStrategy, imagesToSend);
    }
    setPendingImages([]);
    onClearPathReferences?.();
    clearSelectedSkill?.();
  };

  // Dynamic Placeholder
  const getPlaceholder = () => {
    return hasAutoLaunchSiteSkill
      ? homeSurfaceCopy.composerAutoLaunchPlaceholder(
          siteSkillAutoLaunchExample,
        )
      : homeSurfaceCopy.composerPlaceholder;
  };

  const handleApplyRecommendation = useCallback(
    (shortLabel: string, fullPrompt: string) => {
      const looksLikeTeamRuntimePrompt =
        activeTheme === "general" &&
        isTeamRuntimeRecommendation(shortLabel, fullPrompt);
      if (looksLikeTeamRuntimePrompt) {
        onSubagentEnabledChange?.(true);
      }

      const promptWithSelection = buildRecommendationPrompt(
        fullPrompt,
        selectedText,
        appendSelectedTextToRecommendation,
      );
      if (onRecommendationClick) {
        onRecommendationClick(shortLabel, promptWithSelection);
        return;
      }
      setInput(promptWithSelection);
    },
    [
      activeTheme,
      appendSelectedTextToRecommendation,
      onRecommendationClick,
      onSubagentEnabledChange,
      selectedText,
      setInput,
    ],
  );

  const handleCuratedTaskLauncherRequest = useCallback(
    (
      template: CuratedTaskTemplateItem,
      initialInputValues?: CuratedTaskInputValues | null,
      initialReferenceMemoryIds?: string[] | null,
      initialReferenceEntries?: CuratedTaskReferenceEntry[] | null,
      prefillHint?: string | null,
    ) => {
      const mergedReferenceEntries = mergeCuratedTaskReferenceEntries([
        ...(initialReferenceEntries ?? []),
        ...effectiveDefaultCuratedTaskReferenceEntries,
      ]);
      const mergedReferenceMemoryIds =
        normalizeCuratedTaskReferenceMemoryIds([
          ...(initialReferenceMemoryIds ?? []),
          ...(extractCuratedTaskReferenceMemoryIds(mergedReferenceEntries) ??
            []),
          ...effectiveDefaultCuratedTaskReferenceMemoryIds,
        ]) ?? null;
      setCuratedTaskLauncherTask(template);
      setCuratedTaskLauncherInitialInputValues(initialInputValues ?? null);
      setCuratedTaskLauncherInitialReferenceMemoryIds(mergedReferenceMemoryIds);
      setCuratedTaskLauncherInitialReferenceEntries(mergedReferenceEntries);
      setCuratedTaskLauncherPrefillHint(prefillHint ?? null);
    },
    [
      effectiveDefaultCuratedTaskReferenceEntries,
      effectiveDefaultCuratedTaskReferenceMemoryIds,
    ],
  );

  const handleCuratedTaskLauncherOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setCuratedTaskLauncherTask(null);
      setCuratedTaskLauncherInitialInputValues(null);
      setCuratedTaskLauncherInitialReferenceMemoryIds(null);
      setCuratedTaskLauncherInitialReferenceEntries(null);
      setCuratedTaskLauncherPrefillHint(null);
    }
  }, []);
  const handleApplyLauncherReviewSuggestion = useCallback(
    (
      template: CuratedTaskTemplateItem,
      options: {
        inputValues: CuratedTaskInputValues;
        referenceSelection: CuratedTaskReferenceSelection;
      },
    ) => {
      setCuratedTaskLauncherTask(template);
      setCuratedTaskLauncherInitialInputValues(options.inputValues);
      setCuratedTaskLauncherInitialReferenceMemoryIds(
        options.referenceSelection.referenceMemoryIds,
      );
      setCuratedTaskLauncherInitialReferenceEntries(
        options.referenceSelection.referenceEntries,
      );
      setCuratedTaskLauncherPrefillHint(
        homeSurfaceCopy.curatedTaskReviewSuggestionPrefillHint,
      );
    },
    [homeSurfaceCopy.curatedTaskReviewSuggestionPrefillHint],
  );

  const handleApplyCuratedTaskTemplate = useCallback(
    (
      template: CuratedTaskTemplateItem,
      inputValues: CuratedTaskInputValues,
      referenceSelection: CuratedTaskReferenceSelection,
    ) => {
      recordCuratedTaskTemplateUsage({
        templateId: template.id,
        launchInputValues: inputValues,
        referenceMemoryIds: referenceSelection.referenceMemoryIds,
        referenceEntries: referenceSelection.referenceEntries,
      });
      setCuratedTaskTemplatesVersion((previous) => previous + 1);
      setCuratedTaskLauncherTask(null);
      setCuratedTaskLauncherInitialInputValues(null);
      setCuratedTaskLauncherInitialReferenceMemoryIds(null);
      setCuratedTaskLauncherInitialReferenceEntries(null);
      setCuratedTaskLauncherPrefillHint(null);

      if (template.shouldEnableWebSearch && !webSearchEnabled) {
        onWebSearchEnabledChange?.(true);
      }

      if (template.shouldEnableTeamMode && !subagentEnabled) {
        onSubagentEnabledChange?.(true);
      }

      if (template.themeTarget) {
        handleThemeChange(template.themeTarget);
      }

      if (template.shouldLaunchBrowserAssist) {
        void onLaunchBrowserAssist?.();
      }

      const resolvedTemplate =
        findCuratedTaskTemplateById(template.id, curatedTaskTemplateCopy) ??
        template;
      const launchPrompt = buildCuratedTaskLaunchPrompt({
        task: resolvedTemplate,
        inputValues,
        referenceEntries: referenceSelection.referenceEntries,
      });
      const nextPrompt = buildRecommendationPrompt(
        launchPrompt,
        selectedText,
        appendSelectedTextToRecommendation,
      );
      const promptWithSelection = replaceCuratedTaskLaunchPromptInInput({
        currentInput: input,
        previousPrompt:
          activeCuratedTask?.id === template.id
            ? activeCuratedTask.prompt
            : null,
        nextPrompt,
      });
      setActiveCapability({
        kind: "curated_task",
        task: {
          ...resolvedTemplate,
          prompt: nextPrompt,
        },
        launchInputValues: inputValues,
        referenceMemoryIds: referenceSelection.referenceMemoryIds,
        referenceEntries: referenceSelection.referenceEntries,
      });
      setInput(promptWithSelection);
    },
    [
      activeCuratedTask,
      appendSelectedTextToRecommendation,
      curatedTaskTemplateCopy,
      handleThemeChange,
      input,
      onLaunchBrowserAssist,
      onSubagentEnabledChange,
      onWebSearchEnabledChange,
      selectedText,
      setInput,
      subagentEnabled,
      webSearchEnabled,
    ],
  );

  const quickActionItems = useMemo(
    () =>
      currentRecommendations.slice(0, 4).map(([shortLabel, fullPrompt]) => ({
        key: `${activeTheme}-${shortLabel}`,
        title: shortLabel,
        description: truncatePrompt(fullPrompt),
        badge: homeSurfaceCopy.quickActions.badge(
          THEME_ICONS[activeTheme] || "✨",
        ),
        prompt: fullPrompt,
      })),
    [activeTheme, currentRecommendations, homeSurfaceCopy.quickActions],
  );

  const quickStartPresets = homeSurfaceCopy.quickActions.presets;

  const [homeCatalogEntries, setHomeCatalogEntries] = useState<
    SkillCatalogEntry[]
  >([]);
  const [homeCatalogSceneEntries, setHomeCatalogSceneEntries] = useState<
    SkillCatalogSceneEntry[]
  >([]);
  const [guideHelpActive, setGuideHelpActive] = useState(false);

  useEffect(() => {
    if (!isGeneralTheme) {
      setGuideHelpActive(false);
    }
  }, [isGeneralTheme]);

  useEffect(() => {
    let cancelled = false;
    const loadCatalogScenes = async () => {
      try {
        const catalog = await getSkillCatalog();
        if (cancelled) {
          return;
        }
        const entries = listSkillCatalogEntries(catalog).filter((entry) =>
          (entry.surfaceScopes ?? []).includes("home"),
        );
        setHomeCatalogEntries(entries);
        setHomeCatalogSceneEntries(
          listSkillCatalogSceneEntries(catalog).filter((entry) =>
            (entry.surfaceScopes ?? []).includes("home"),
          ),
        );
      } catch {
        if (!cancelled) {
          setHomeCatalogEntries([]);
          setHomeCatalogSceneEntries([]);
        }
      }
    };

    void loadCatalogScenes();
    const unsubscribe = subscribeSkillCatalogChanged(() => {
      void loadCatalogScenes();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const homeServiceSkillItems = useMemo(
    () => listFeaturedHomeServiceSkills(serviceSkills ?? [], { limit: 6 }),
    [serviceSkills],
  );
  const homeStarterChips = useMemo(
    () => buildHomeStarterChips(homeCatalogEntries, homeSurfaceCopy),
    [homeCatalogEntries, homeSurfaceCopy],
  );
  const homeInputSuggestions = useMemo(
    () => buildHomeInputSuggestions(homeCatalogEntries, homeSurfaceCopy),
    [homeCatalogEntries, homeSurfaceCopy],
  );
  const homeGuideCards = useMemo(
    () => buildHomeGuideCards(homeCatalogEntries, homeSurfaceCopy),
    [homeCatalogEntries, homeSurfaceCopy],
  );
  const guideHelpStarterLabel = useMemo(
    () =>
      homeStarterChips.find((chip) => chip.launchKind === "toggle_guide")
        ?.label,
    [homeStarterChips],
  );
  const guideHelpLabel = guideHelpStarterLabel
    ? homeSurfaceCopy.guideHelpContextLabelWithStarter(guideHelpStarterLabel)
    : homeSurfaceCopy.guideHelpContextLabel;

  const homeSkillItems = useMemo(() => {
    void slashEntryUsageVersion;
    return buildHomeSkillItems({
      curatedTasks: curatedTaskTemplates,
      serviceSkillHomeCopy,
      catalogSceneEntries: homeCatalogSceneEntries,
      serviceSkills: homeServiceSkillItems,
      installedSkills: skillSelection.skills ?? [],
      slashEntryUsage: listSlashEntryUsage(),
    });
  }, [
    curatedTaskTemplates,
    homeCatalogSceneEntries,
    homeServiceSkillItems,
    serviceSkillHomeCopy,
    skillSelection.skills,
    slashEntryUsageVersion,
  ]);

  const homeSkillSections = useMemo(
    () => buildHomeSkillSections(homeSkillItems, homeSurfaceCopy),
    [homeSkillItems, homeSurfaceCopy],
  );
  const homeGalleryItems = useMemo(
    () => buildHomeGalleryItems(homeSkillItems, "all"),
    [homeSkillItems],
  );

  const handleSelectHomeSkillItem = useCallback(
    (item: HomeSkillSurfaceItem) => {
      if (item.launchKind === "curated_task_launcher") {
        const template = findCuratedTaskTemplateById(
          item.id,
          curatedTaskTemplateCopy,
        );
        if (!template) {
          return;
        }
        const prefill = resolveCuratedTaskTemplateLaunchPrefill(template);
        handleCuratedTaskLauncherRequest(
          template,
          prefill?.inputValues ?? null,
          prefill?.referenceMemoryIds ??
            effectiveDefaultCuratedTaskReferenceMemoryIds,
          prefill?.referenceEntries ??
            effectiveDefaultCuratedTaskReferenceEntries,
          prefill?.hint,
        );
        return;
      }

      if (item.launchKind === "service_skill") {
        const skill = homeServiceSkillItems.find(
          (candidate) => candidate.id === item.id,
        );
        if (skill) {
          handleSelectInputCapability({ kind: "service_skill", skill });
        }
        return;
      }

      if (item.launchKind === "installed_skill") {
        const skill = (skillSelection.skills ?? []).find(
          (candidate) => candidate.key === item.id,
        );
        if (skill) {
          handleSelectInputCapability({ kind: "installed_skill", skill });
          if (item.isRecent && item.summary.trim()) {
            setInput(item.summary);
          }
        }
        return;
      }

      if (item.launchKind === "skill_catalog_scene") {
        const launchPrompt =
          item.launchPrompt?.trim() ||
          item.placeholder?.trim() ||
          item.summary.trim();
        if (launchPrompt) {
          setInput(launchPrompt);
        }
        if (item.linkedSkillId) {
          const skill = (serviceSkills ?? []).find(
            (candidate) => candidate.id === item.linkedSkillId,
          );
          if (skill) {
            handleSelectInputCapability({ kind: "service_skill", skill });
          }
        }
      }
    },
    [
      curatedTaskTemplateCopy,
      effectiveDefaultCuratedTaskReferenceEntries,
      effectiveDefaultCuratedTaskReferenceMemoryIds,
      handleCuratedTaskLauncherRequest,
      handleSelectInputCapability,
      homeServiceSkillItems,
      serviceSkills,
      setInput,
      skillSelection.skills,
    ],
  );

  const handleSelectHomeStarterChip = useCallback(
    (chip: HomeStarterChip) => {
      if (chip.launchKind === "prefill_prompt") {
        setGuideHelpActive(false);
        const prompt = chip.prompt?.trim();
        if (prompt) {
          setInput(prompt);
        }
        return;
      }
      if (chip.launchKind === "open_knowledge_hub") {
        setGuideHelpActive(false);
        if (!knowledgePackSelection && !onStartKnowledgeOrganize) {
          onManageKnowledgePacks?.();
        } else {
          setKnowledgeHubOpenRequestKey((current) => current + 1);
        }
        return;
      }

      const targetItem = chip.targetItemId
        ? homeSkillItems.find((item) => item.id === chip.targetItemId)
        : null;
      if (targetItem) {
        if (targetItem.launchKind === "curated_task_launcher") {
          const template = findCuratedTaskTemplateById(
            targetItem.id,
            curatedTaskTemplateCopy,
          );
          if (!template) {
            return;
          }
          const prefill = resolveCuratedTaskTemplateLaunchPrefill(template);
          setGuideHelpActive(false);
          setActiveCapability({
            kind: "curated_task",
            task: template,
            launchInputValues: prefill?.inputValues,
            referenceMemoryIds:
              prefill?.referenceMemoryIds ??
              effectiveDefaultCuratedTaskReferenceMemoryIds,
            referenceEntries:
              prefill?.referenceEntries ??
              effectiveDefaultCuratedTaskReferenceEntries,
          });
          if (prefill?.hint) {
            toast.info(prefill.hint);
          }
          return;
        }
        setGuideHelpActive(false);
        handleSelectHomeSkillItem(targetItem);
      }
    },
    [
      curatedTaskTemplateCopy,
      effectiveDefaultCuratedTaskReferenceEntries,
      effectiveDefaultCuratedTaskReferenceMemoryIds,
      handleSelectHomeSkillItem,
      homeSkillItems,
      knowledgePackSelection,
      onManageKnowledgePacks,
      onStartKnowledgeOrganize,
      setInput,
    ],
  );

  const handleSelectHomeGuideCard = useCallback(
    (card: HomeGuideCard) => {
      setGuideHelpActive(true);
      const prompt = card.prompt.trim();
      if (prompt) {
        setInput(prompt);
      }
    },
    [setInput],
  );

  const recentSessionLinkLabel = useMemo(() => {
    const normalizedTitle = truncatePrompt(recentSessionTitle || "", 18);
    const effectiveRecentSessionActionLabel =
      recentSessionActionLabel ??
      homeSurfaceCopy.chrome.recentSessionDefaultActionLabel;
    if (!normalizedTitle) {
      return effectiveRecentSessionActionLabel;
    }
    return `${effectiveRecentSessionActionLabel} · ${normalizedTitle}`;
  }, [
    homeSurfaceCopy.chrome.recentSessionDefaultActionLabel,
    recentSessionActionLabel,
    recentSessionTitle,
  ]);
  const recentSessionLinkTitle = useMemo(
    () =>
      [recentSessionTitle, recentSessionSummary]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .join(" · "),
    [recentSessionSummary, recentSessionTitle],
  );

  const homeSupplementalActions = useMemo<HomeSupplementalAction[]>(() => {
    const actions: HomeSupplementalAction[] = [];

    if (recentSessionTitle && onResumeRecentSession) {
      actions.push({
        id: "recent-session",
        label: recentSessionLinkLabel,
        title: recentSessionLinkTitle || undefined,
        testId: "entry-recent-session-resume",
        onSelect: onResumeRecentSession,
      });
    }

    return actions;
  }, [
    onResumeRecentSession,
    recentSessionLinkLabel,
    recentSessionLinkTitle,
    recentSessionTitle,
  ]);

  const composerPanel = (
    <ComposerGlowFrame>
      <EmptyStateComposerPanel
        input={input}
        placeholder={
          guideHelpActive
            ? homeSurfaceCopy.guideHelpPlaceholder
            : getPlaceholder()
        }
        onSend={handleSend}
        activeTheme={activeTheme}
        providerType={providerType}
        setProviderType={setProviderType}
        model={model}
        setModel={setModel}
        executionStrategy={executionStrategy}
        setExecutionStrategy={setExecutionStrategy}
        accessMode={accessMode}
        setAccessMode={setAccessMode}
        onManageProviders={onManageProviders}
        isLoading={isComposerBusy}
        disabled={isComposerBusy}
        isGeneralTheme={isGeneralTheme}
        characters={characters}
        skillSelection={skillSelection}
        activeCapability={activeCapability}
        onSelectInputCapability={handleSelectInputCapability}
        onClearInputCapability={clearSelectedSkill}
        onEditCuratedTask={
          activeCuratedTask
            ? () =>
                handleCuratedTaskLauncherRequest(
                  activeCuratedTask,
                  activeCuratedTaskLaunchInputValues,
                  activeCuratedTaskReferenceMemoryIds ||
                    effectiveDefaultCuratedTaskReferenceMemoryIds,
                  activeCuratedTaskReferenceEntries ||
                    effectiveDefaultCuratedTaskReferenceEntries,
                )
            : undefined
        }
        onApplyCuratedTaskReviewSuggestion={
          activeCuratedTask
            ? (task) =>
                handleCuratedTaskLauncherRequest(
                  task,
                  activeCuratedTaskLaunchInputValues,
                  activeCuratedTaskReferenceMemoryIds ||
                    effectiveDefaultCuratedTaskReferenceMemoryIds,
                  activeCuratedTaskReferenceEntries ||
                    effectiveDefaultCuratedTaskReferenceEntries,
                  homeSurfaceCopy.curatedTaskReviewSuggestionPrefillHint,
                )
            : undefined
        }
        creationReplaySurface={creationReplaySurface}
        projectId={projectId}
        sessionId={sessionId}
        defaultCuratedTaskReferenceMemoryIds={
          effectiveDefaultCuratedTaskReferenceMemoryIds
        }
        defaultCuratedTaskReferenceEntries={
          effectiveDefaultCuratedTaskReferenceEntries
        }
        knowledgePackSelection={knowledgePackSelection}
        knowledgePackOptions={knowledgePackOptions}
        knowledgeHubOpenRequestKey={knowledgeHubOpenRequestKey}
        onToggleKnowledgePack={onToggleKnowledgePack}
        onSelectKnowledgePack={onSelectKnowledgePack}
        onToggleKnowledgeCompanionPack={onToggleKnowledgeCompanionPack}
        onStartKnowledgeOrganize={onStartKnowledgeOrganize}
        onManageKnowledgePacks={onManageKnowledgePacks}
        copy={homeSurfaceCopy.composer}
        inputbarCopy={inputbarCoreCopy}
        executionStrategyCopy={executionStrategyCopy}
        showCreationModeSelector={showCreationModeSelector}
        creationMode={creationMode}
        onCreationModeChange={onCreationModeChange}
        thinkingEnabled={thinkingEnabled}
        onThinkingEnabledChange={onThinkingEnabledChange}
        subagentEnabled={subagentEnabled}
        onSubagentEnabledChange={onSubagentEnabledChange}
        selectedTeam={selectedTeam}
        onSelectTeam={onSelectTeam}
        teamWorkspaceSettings={teamWorkspaceSettings}
        onPersistCustomTeams={onPersistCustomTeams}
        onEnableSuggestedTeam={onEnableSuggestedTeam}
        webSearchEnabled={webSearchEnabled}
        onWebSearchEnabledChange={onWebSearchEnabledChange}
        pendingImages={pendingImages}
        onFileSelect={handleFileSelect}
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onRemoveImage={handleRemoveImage}
        pathReferences={pathReferences}
        onImportPathReferenceAsKnowledge={onImportPathReferenceAsKnowledge}
        onRemovePathReference={onRemovePathReference}
        fileManagerOpen={fileManagerOpen}
        onToggleFileManager={onToggleFileManager}
        inputSuggestions={
          hasAutoLaunchSiteSkill || guideHelpActive ? [] : homeInputSuggestions
        }
        guideHelpActive={guideHelpActive}
        guideHelpLabel={guideHelpLabel}
        onClearGuideHelp={() => setGuideHelpActive(false)}
      />
    </ComposerGlowFrame>
  );

  const defaultQuickActionsPanel = (
    <EmptyStateQuickActions
      title={homeSurfaceCopy.quickActions.title}
      description={homeSurfaceCopy.quickActions.description}
      selectedTextPreview={selectedTextPreview}
      presets={quickStartPresets}
      items={quickActionItems}
      embedded
      onPresetAction={(item) =>
        handleApplyRecommendation(item.label, item.prompt)
      }
      onAction={(item) => handleApplyRecommendation(item.title, item.prompt)}
    />
  );

  const homeStartSurfacePanel = (
    <HomeStartSurface
      starterChips={homeStarterChips}
      copy={homeSurfaceCopy.chrome}
      guideCards={homeGuideCards}
      guideOpen={guideHelpActive}
      sections={homeSkillSections}
      supplementalActions={homeSupplementalActions}
      onGuideOpenChange={setGuideHelpActive}
      onSelectStarterChip={handleSelectHomeStarterChip}
      onSelectGuideCard={handleSelectHomeGuideCard}
      onSelectSkillItem={handleSelectHomeSkillItem}
    />
  );
  const handleSecondScreenWheel = useCallback(
    (event: React.WheelEvent<HTMLElement>) => {
      if (event.deltaY >= 0 || event.currentTarget.scrollTop > 1) {
        return;
      }

      event.preventDefault();
      pageContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    },
    [],
  );

  return (
    <PageContainer ref={pageContainerRef}>
      <ContentWrapper>
        <EmptyStateHero
          eyebrow={homeSurfaceCopy.hero.eyebrow}
          title=""
          slogan={homeSurfaceCopy.hero.slogan}
          description={homeSurfaceCopy.hero.description}
          supportingDescription={homeSurfaceCopy.hero.supportingDescription}
          cards={[]}
          prioritySlot={composerPanel}
          supportingSlot={
            isGeneralTheme ? homeStartSurfacePanel : defaultQuickActionsPanel
          }
        />
        {isGeneralTheme && homeGalleryItems.length > 0 ? (
          <ScrollCue
            href="#home-skill-gallery-screen"
            data-testid="home-scroll-cue"
            aria-label={homeSurfaceCopy.chrome.scrollCueLabel}
          >
            <ScrollCueLine aria-hidden />
            <ScrollCueText>
              {homeSurfaceCopy.chrome.scrollCueLabel}
              <ScrollCueArrow aria-hidden>↓</ScrollCueArrow>
            </ScrollCueText>
            <ScrollCueLine aria-hidden />
          </ScrollCue>
        ) : null}
      </ContentWrapper>
      {isGeneralTheme && homeGalleryItems.length > 0 ? (
        <SecondScreenSection
          id="home-skill-gallery-screen"
          aria-label={homeSurfaceCopy.chrome.secondScreenLabel}
          data-testid="home-second-screen"
          onWheel={handleSecondScreenWheel}
        >
          <SecondScreenInner>
            <HomeSkillGallery
              items={homeGalleryItems}
              copy={homeSurfaceCopy.chrome}
              onSelectItem={handleSelectHomeSkillItem}
            />
          </SecondScreenInner>
        </SecondScreenSection>
      ) : null}
      <CuratedTaskLauncherDialog
        open={Boolean(curatedTaskLauncherTask)}
        task={curatedTaskLauncherTask}
        projectId={projectId}
        sessionId={sessionId}
        initialInputValues={curatedTaskLauncherInitialInputValues}
        initialReferenceMemoryIds={curatedTaskLauncherInitialReferenceMemoryIds}
        initialReferenceEntries={curatedTaskLauncherInitialReferenceEntries}
        prefillHint={curatedTaskLauncherPrefillHint}
        onOpenChange={handleCuratedTaskLauncherOpenChange}
        onApplyReviewSuggestion={handleApplyLauncherReviewSuggestion}
        onConfirm={handleApplyCuratedTaskTemplate}
      />
    </PageContainer>
  );
};
