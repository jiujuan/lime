import type { Artifact } from "@/lib/artifact/types";
import type {
  AgentSiteSkillLaunchParams,
  BrowserRuntimePageParams,
} from "@/types/page";
import type { BrowserAssistSessionState } from "../types";
import { asRecord, readFirstString } from "./browserAssistArtifact";
import type { BrowserSessionRef } from "./workspaceBrowserSessionRef";

export interface ResolveBrowserRuntimeNavigationFromBrowserAssistParams {
  artifact?: Pick<Artifact, "meta"> | null;
  browserSessionRef?: Pick<
    BrowserSessionRef,
    "browserSessionId" | "profileKey"
  > | null;
  browserAssistSessionState?: Pick<
    BrowserAssistSessionState,
    "profileKey" | "sessionId" | "targetId"
  > | null;
  contentId?: string | null;
  generalBrowserAssistProfileKey: string;
  projectId?: string | null;
}

export interface ResolveBrowserRuntimeNavigationFromSiteSkillParams {
  contentId?: string | null;
  initialSiteSkillLaunch: AgentSiteSkillLaunchParams;
  projectId?: string | null;
  siteSkillExecutionState?: {
    profileKey?: string | null;
    targetId?: string | null;
  } | null;
}

export function resolveBrowserRuntimeNavigationFromBrowserAssist({
  artifact,
  browserSessionRef,
  browserAssistSessionState,
  contentId,
  generalBrowserAssistProfileKey,
  projectId,
}: ResolveBrowserRuntimeNavigationFromBrowserAssistParams): BrowserRuntimePageParams {
  const artifactMeta = artifact ? asRecord(artifact.meta) : null;

  return {
    projectId: projectId ?? undefined,
    contentId: contentId ?? undefined,
    initialProfileKey:
      readFirstString(artifactMeta ? [artifactMeta] : [], [
        "profileKey",
        "profile_key",
      ]) ||
      browserSessionRef?.profileKey ||
      browserAssistSessionState?.profileKey ||
      generalBrowserAssistProfileKey,
    initialSessionId:
      readFirstString(artifactMeta ? [artifactMeta] : [], [
        "sessionId",
        "session_id",
      ]) ||
      browserSessionRef?.browserSessionId ||
      browserAssistSessionState?.sessionId ||
      undefined,
    initialTargetId:
      readFirstString(artifactMeta ? [artifactMeta] : [], [
        "targetId",
        "target_id",
      ]) ||
      browserAssistSessionState?.targetId ||
      undefined,
  };
}

export function resolveBrowserRuntimeNavigationFromSiteSkill({
  contentId,
  initialSiteSkillLaunch,
  projectId,
  siteSkillExecutionState,
}: ResolveBrowserRuntimeNavigationFromSiteSkillParams): BrowserRuntimePageParams {
  return {
    projectId: projectId ?? undefined,
    contentId: contentId ?? undefined,
    initialProfileKey:
      siteSkillExecutionState?.profileKey || initialSiteSkillLaunch.profileKey,
    initialTargetId:
      siteSkillExecutionState?.targetId || initialSiteSkillLaunch.targetId,
    initialAdapterName: initialSiteSkillLaunch.adapterName,
    initialArgs: initialSiteSkillLaunch.args,
    initialAutoRun: false,
    initialRequireAttachedSession: true,
    initialSaveTitle: initialSiteSkillLaunch.saveTitle,
  };
}
