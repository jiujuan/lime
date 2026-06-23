import type { AgentSiteSkillLaunchParams } from "@/types/page";
import type { BrowserAssistSessionState } from "../types";
import { GENERAL_BROWSER_ASSIST_PROFILE_KEY } from "./agentChatWorkspaceHelpers";
import { asRecord, readFirstString } from "./browserAssistArtifact";

type BrowserAssistPreferredBackend = "lime_extension_bridge" | "cdp_direct";

export interface ResolveWorkspaceBrowserAssistRequestParams {
  mappedTheme: string;
  initialAutoSendRequestMetadata?: Record<string, unknown> | null;
  initialSiteSkillLaunch?: AgentSiteSkillLaunchParams;
  browserAssistSessionState?: Pick<
    BrowserAssistSessionState,
    "profileKey" | "transportKind"
  > | null;
}

export interface WorkspaceBrowserAssistRequest {
  browserAssistRequestProfileKey?: string;
  browserAssistRequestPreferredBackend?: BrowserAssistPreferredBackend;
  browserAssistRequestAutoLaunch: boolean;
  shouldPreferExistingSessionBridgeForClaw: boolean;
}

function resolveInitialHarnessBrowserAssist(
  metadata?: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  const harness = asRecord(asRecord(metadata)?.harness);
  return harness ? (asRecord(harness.browser_assist) ?? undefined) : undefined;
}

function resolveInitialHarnessPreferredBackend(
  browserAssist?: Record<string, unknown>,
): BrowserAssistPreferredBackend | undefined {
  const value = readFirstString(browserAssist ? [browserAssist] : [], [
    "preferred_backend",
    "preferredBackend",
  ]);
  return value === "lime_extension_bridge" || value === "cdp_direct"
    ? value
    : undefined;
}

function resolveInitialHarnessAutoLaunch(
  browserAssist?: Record<string, unknown>,
): boolean | undefined {
  const rawValue = browserAssist?.auto_launch ?? browserAssist?.autoLaunch;
  return typeof rawValue === "boolean" ? rawValue : undefined;
}

export function resolveWorkspaceBrowserAssistRequest({
  mappedTheme,
  initialAutoSendRequestMetadata,
  initialSiteSkillLaunch,
  browserAssistSessionState,
}: ResolveWorkspaceBrowserAssistRequestParams): WorkspaceBrowserAssistRequest {
  const initialHarnessBrowserAssist = resolveInitialHarnessBrowserAssist(
    initialAutoSendRequestMetadata,
  );
  const initialHarnessPreferredBackend = resolveInitialHarnessPreferredBackend(
    initialHarnessBrowserAssist,
  );
  const initialHarnessAutoLaunch = resolveInitialHarnessAutoLaunch(
    initialHarnessBrowserAssist,
  );

  const browserAssistRequestProfileKey =
    mappedTheme === "general"
      ? browserAssistSessionState?.profileKey?.trim() ||
        initialSiteSkillLaunch?.profileKey?.trim() ||
        GENERAL_BROWSER_ASSIST_PROFILE_KEY
      : undefined;

  const shouldPreferExistingSessionBridgeForClaw =
    mappedTheme === "general" &&
    (browserAssistSessionState?.transportKind === "existing_session" ||
      initialHarnessPreferredBackend === "lime_extension_bridge" ||
      initialHarnessAutoLaunch === false ||
      Boolean(initialSiteSkillLaunch?.profileKey?.trim()) ||
      Boolean(initialSiteSkillLaunch?.requireAttachedSession) ||
      initialSiteSkillLaunch?.preferredBackend === "lime_extension_bridge" ||
      initialSiteSkillLaunch?.autoLaunch === false);

  return {
    browserAssistRequestProfileKey,
    shouldPreferExistingSessionBridgeForClaw,
    browserAssistRequestPreferredBackend:
      initialSiteSkillLaunch?.preferredBackend ||
      initialHarnessPreferredBackend ||
      (shouldPreferExistingSessionBridgeForClaw
        ? "lime_extension_bridge"
        : undefined),
    browserAssistRequestAutoLaunch:
      initialSiteSkillLaunch?.autoLaunch ??
      initialHarnessAutoLaunch ??
      (shouldPreferExistingSessionBridgeForClaw ? false : true),
  };
}
