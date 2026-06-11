import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Skill } from "@/lib/api/skills";
import type { InputbarKnowledgePackSelection } from "./Inputbar/types";
import type { ServiceSkillHomeItem } from "../service-skills/types";
import type {
  SelectInputCapabilityHandler,
  InputCapabilitySelection,
} from "../skill-selection/inputCapabilitySelection";
import {
  findCuratedTaskTemplateById,
  resolveCuratedTaskTemplateLaunchPrefill,
  type CuratedTaskInputValues,
  type CuratedTaskTemplateCopy,
  type CuratedTaskTemplateItem,
} from "../utils/curatedTaskTemplates";
import type { CuratedTaskReferenceEntry } from "../utils/curatedTaskReferenceSelection";
import type {
  HomeGuideCard,
  HomeSkillSurfaceItem,
  HomeStarterChip,
} from "../home/homeSurfaceTypes";
import {
  buildRecentSessionSupplementalAction,
  resolveGuideHelpLabel,
  resolveRecentSessionLinkModel,
} from "./EmptyStateViewModel";

interface UseEmptyStateHomeActionsParams {
  curatedTaskTemplateCopy: CuratedTaskTemplateCopy;
  effectiveDefaultCuratedTaskReferenceEntries: CuratedTaskReferenceEntry[];
  effectiveDefaultCuratedTaskReferenceMemoryIds: string[];
  handleCuratedTaskLauncherRequest: (
    template: CuratedTaskTemplateItem,
    initialInputValues?: CuratedTaskInputValues | null,
    initialReferenceMemoryIds?: string[] | null,
    initialReferenceEntries?: CuratedTaskReferenceEntry[] | null,
    prefillHint?: string | null,
  ) => void;
  handleSelectInputCapability: SelectInputCapabilityHandler;
  guideHelpContextLabel: string;
  guideHelpContextLabelWithStarter: (label: string) => string;
  homeServiceSkillItems: ServiceSkillHomeItem[];
  homeSkillItems: HomeSkillSurfaceItem[];
  homeStarterChips: HomeStarterChip[];
  isGeneralTheme: boolean;
  knowledgePackSelection?: InputbarKnowledgePackSelection | null;
  onOpenKnowledgeHub: () => void;
  onManageKnowledgePacks?: () => void;
  onResumeRecentSession?: () => void;
  onStartKnowledgeOrganize?: () => void;
  recentSessionActionLabel?: string;
  recentSessionDefaultActionLabel: string;
  recentSessionSummary?: string | null;
  recentSessionTitle?: string | null;
  serviceSkills?: ServiceSkillHomeItem[];
  setActiveCapability: (capability: InputCapabilitySelection | null) => void;
  setInput: (value: string) => void;
  skillSelectionSkills: Skill[];
}

export function useEmptyStateHomeActions({
  curatedTaskTemplateCopy,
  effectiveDefaultCuratedTaskReferenceEntries,
  effectiveDefaultCuratedTaskReferenceMemoryIds,
  handleCuratedTaskLauncherRequest,
  handleSelectInputCapability,
  guideHelpContextLabel,
  guideHelpContextLabelWithStarter,
  homeServiceSkillItems,
  homeSkillItems,
  homeStarterChips,
  isGeneralTheme,
  knowledgePackSelection,
  onOpenKnowledgeHub,
  onManageKnowledgePacks,
  onResumeRecentSession,
  onStartKnowledgeOrganize,
  recentSessionActionLabel,
  recentSessionDefaultActionLabel,
  recentSessionSummary,
  recentSessionTitle,
  serviceSkills,
  setActiveCapability,
  setInput,
  skillSelectionSkills,
}: UseEmptyStateHomeActionsParams) {
  const [guideHelpActive, setGuideHelpActive] = useState(false);

  useEffect(() => {
    if (!isGeneralTheme) {
      setGuideHelpActive(false);
    }
  }, [isGeneralTheme]);

  const guideHelpLabel = useMemo(
    () =>
      resolveGuideHelpLabel({
        starterChips: homeStarterChips,
        contextLabel: guideHelpContextLabel,
        contextLabelWithStarter: guideHelpContextLabelWithStarter,
      }),
    [
      guideHelpContextLabel,
      guideHelpContextLabelWithStarter,
      homeStarterChips,
    ],
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
        const skill = skillSelectionSkills.find(
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
      skillSelectionSkills,
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
          onOpenKnowledgeHub();
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
      onOpenKnowledgeHub,
      onStartKnowledgeOrganize,
      setActiveCapability,
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
    return resolveRecentSessionLinkModel({
      recentSessionTitle,
      recentSessionSummary,
      recentSessionActionLabel,
      defaultActionLabel: recentSessionDefaultActionLabel,
    }).recentSessionLinkLabel;
  }, [
    recentSessionActionLabel,
    recentSessionDefaultActionLabel,
    recentSessionSummary,
    recentSessionTitle,
  ]);
  const recentSessionLinkTitle = useMemo(
    () =>
      resolveRecentSessionLinkModel({
        recentSessionTitle,
        recentSessionSummary,
        recentSessionActionLabel,
        defaultActionLabel: recentSessionDefaultActionLabel,
      }).recentSessionLinkTitle,
    [
      recentSessionActionLabel,
      recentSessionDefaultActionLabel,
      recentSessionSummary,
      recentSessionTitle,
    ],
  );

  const homeSupplementalActions = useMemo(() => {
    const recentSessionAction = buildRecentSessionSupplementalAction({
      recentSessionTitle,
      recentSessionLinkLabel,
      recentSessionLinkTitle,
      hasResumeHandler: Boolean(onResumeRecentSession),
    });

    return recentSessionAction && onResumeRecentSession
      ? [
          {
            ...recentSessionAction,
            onSelect: onResumeRecentSession,
          },
        ]
      : [];
  }, [
    onResumeRecentSession,
    recentSessionLinkLabel,
    recentSessionLinkTitle,
    recentSessionTitle,
  ]);

  return {
    guideHelpActive,
    guideHelpLabel,
    handleSelectHomeGuideCard,
    handleSelectHomeSkillItem,
    handleSelectHomeStarterChip,
    homeSupplementalActions,
    setGuideHelpActive,
  };
}
