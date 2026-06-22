import { useEffect, type MutableRefObject } from "react";
import { toast } from "sonner";
import type { AgentPendingServiceSkillLaunchParams } from "@/types/page";
import type { ServiceSkillHomeItem } from "../service-skills/types";
import type { ServiceSkillSelectionOptions } from "./workspaceServiceSkillEntryActionsViewModel";

interface UseInitialPendingServiceSkillLaunchRuntimeParams {
  activeTheme: string;
  initialPendingServiceSkillLaunch?: AgentPendingServiceSkillLaunchParams;
  initialPendingServiceSkillLaunchSignature: string;
  handledSignatureRef: MutableRefObject<string>;
  dismissedSignatureRef: MutableRefObject<string>;
  serviceSkills: ServiceSkillHomeItem[];
  serviceSkillsError?: string | null;
  serviceSkillsLoading: boolean;
  onSelectServiceSkill: (
    skill: ServiceSkillHomeItem,
    options?: ServiceSkillSelectionOptions,
  ) => void;
}

export function useInitialPendingServiceSkillLaunchRuntime({
  activeTheme,
  initialPendingServiceSkillLaunch,
  initialPendingServiceSkillLaunchSignature,
  handledSignatureRef,
  dismissedSignatureRef,
  serviceSkills,
  serviceSkillsError,
  serviceSkillsLoading,
  onSelectServiceSkill,
}: UseInitialPendingServiceSkillLaunchRuntimeParams): void {
  useEffect(() => {
    if (!initialPendingServiceSkillLaunchSignature) {
      handledSignatureRef.current = "";
      dismissedSignatureRef.current = "";
      return;
    }

    if (
      dismissedSignatureRef.current ===
      initialPendingServiceSkillLaunchSignature
    ) {
      return;
    }

    if (
      activeTheme !== "general" ||
      serviceSkillsLoading ||
      serviceSkillsError
    ) {
      return;
    }

    if (
      handledSignatureRef.current === initialPendingServiceSkillLaunchSignature
    ) {
      return;
    }

    const skillId = initialPendingServiceSkillLaunch?.skillId?.trim();
    const skillKey = initialPendingServiceSkillLaunch?.skillKey?.trim();
    if (!skillId && !skillKey) {
      return;
    }

    const matchedSkill = serviceSkills.find(
      (skill) =>
        (skillId && skill.id === skillId) ||
        (skillKey && skill.skillKey === skillKey),
    );
    if (!matchedSkill) {
      if (serviceSkills.length === 0) {
        return;
      }

      handledSignatureRef.current = initialPendingServiceSkillLaunchSignature;
      toast.error(`未找到技能：${skillId ?? skillKey}`);
      return;
    }

    handledSignatureRef.current = initialPendingServiceSkillLaunchSignature;
    onSelectServiceSkill(matchedSkill, {
      requestKey: initialPendingServiceSkillLaunch?.requestKey,
      initialSlotValues: initialPendingServiceSkillLaunch?.initialSlotValues,
      prefillHint: initialPendingServiceSkillLaunch?.prefillHint,
      launchUserInput: initialPendingServiceSkillLaunch?.launchUserInput,
    });
  }, [
    activeTheme,
    dismissedSignatureRef,
    handledSignatureRef,
    initialPendingServiceSkillLaunch,
    initialPendingServiceSkillLaunchSignature,
    onSelectServiceSkill,
    serviceSkills,
    serviceSkillsError,
    serviceSkillsLoading,
  ]);
}
