import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BrowserAssistSessionState } from "../types";
import {
  areBrowserAssistSessionStatesEqual,
  clearBrowserAssistSessionState,
  extractBrowserAssistSessionFromArtifact,
  findLatestBrowserAssistSessionInMessages,
  loadBrowserAssistSessionState,
  mergeBrowserAssistSessionStates,
  resolveBrowserAssistSessionScopeKey,
  saveBrowserAssistSessionState,
} from "../utils/browserAssistSession";
import {
  GENERAL_BROWSER_ASSIST_ARTIFACT_ID,
  asRecord,
  buildBrowserAssistArtifact,
  buildFailedBrowserAssistArtifact,
  buildPendingBrowserAssistArtifact,
  readFirstString,
  resolveBrowserAssistArtifactScopeKey,
} from "./browserAssistArtifact";
import { useWorkspaceBrowserAssistCanvasActions } from "./useWorkspaceBrowserAssistCanvasActions";
import { useWorkspaceBrowserAssistSiteSkillRuntime } from "./useWorkspaceBrowserAssistSiteSkillRuntime";
import type {
  UseWorkspaceBrowserAssistRuntimeParams,
  WorkspaceBrowserAssistRuntimeResult,
} from "./useWorkspaceBrowserAssistRuntimeTypes";
import {
  buildAttachedSessionOnlyErrorMessage,
  getBrowserAssistAttachedLaunchHint,
  getBrowserAssistFallbackTitle,
  hasActiveBrowserAssistSession,
  isFailedBrowserAssistLaunchState,
  shouldAutoOpenPassiveBrowserAssist,
} from "./workspaceBrowserAssistRuntimeHelpers";

export function useWorkspaceBrowserAssistRuntime({
  activeTheme,
  projectId,
  sessionId,
  contentId,
  input,
  initialUserPrompt,
  openBrowserAssistOnMount,
  initialSiteSkillLaunch,
  siteSkillLaunchNonce,
  artifacts,
  messages,
  upsertGeneralArtifact,
  generalBrowserAssistProfileKey,
  onBrowserWorkbenchOpenRequest,
}: UseWorkspaceBrowserAssistRuntimeParams): WorkspaceBrowserAssistRuntimeResult {
  const [browserAssistSessionState, setBrowserAssistSessionState] =
    useState<BrowserAssistSessionState | null>(null);
  const openBrowserAssistOnMountHandledRef = useRef(false);
  const autoOpenedBrowserAssistSessionIdRef = useRef<string>("");
  const autoLaunchingBrowserAssistKeyRef = useRef<string>("");
  const browserAssistLaunchRequestIdRef = useRef(0);
  const browserAssistAutoOpenDismissedScopeRef = useRef<string | null>(null);
  const browserAssistScopeTrackerRef = useRef<string | null>(null);

  const currentBrowserAssistScopeKey = useMemo(
    () =>
      activeTheme === "general"
        ? resolveBrowserAssistSessionScopeKey(projectId, sessionId)
        : null,
    [activeTheme, projectId, sessionId],
  );

  const browserAssistArtifact = useMemo(
    () =>
      artifacts.find(
        (artifact) =>
          artifact.id === GENERAL_BROWSER_ASSIST_ARTIFACT_ID &&
          artifact.type === "browser_assist" &&
          resolveBrowserAssistArtifactScopeKey(artifact) ===
            currentBrowserAssistScopeKey,
      ) || null,
    [artifacts, currentBrowserAssistScopeKey],
  );

  const latestBrowserAssistSessionFromMessages = useMemo(
    () => findLatestBrowserAssistSessionInMessages(messages),
    [messages],
  );

  const browserAssistSessionFromArtifact = useMemo(
    () => extractBrowserAssistSessionFromArtifact(browserAssistArtifact),
    [browserAssistArtifact],
  );

  const browserAssistStorageKey = useMemo(
    () =>
      activeTheme === "general"
        ? `${projectId || "global"}:${sessionId || "active"}`
        : null,
    [activeTheme, projectId, sessionId],
  );

  const canAutoRestoreDetachedBrowserAssistSession = useMemo(() => {
    if (activeTheme !== "general") {
      return false;
    }

    return Boolean(
      openBrowserAssistOnMount ||
      initialSiteSkillLaunch ||
      browserAssistArtifact ||
      latestBrowserAssistSessionFromMessages,
    );
  }, [
    activeTheme,
    browserAssistArtifact,
    initialSiteSkillLaunch,
    latestBrowserAssistSessionFromMessages,
    openBrowserAssistOnMount,
  ]);

  const isBrowserAssistReady = useMemo(
    () => hasActiveBrowserAssistSession(browserAssistSessionState),
    [browserAssistSessionState],
  );

  const openBrowserAssistCanvas = useCallback(
    (_artifactId = GENERAL_BROWSER_ASSIST_ARTIFACT_ID) => {
      browserAssistAutoOpenDismissedScopeRef.current = null;
    },
    [],
  );

  const autoOpenBrowserAssistCanvas = useCallback(
    (_artifactId = GENERAL_BROWSER_ASSIST_ARTIFACT_ID) => {
      if (
        activeTheme === "general" &&
        browserAssistAutoOpenDismissedScopeRef.current
      ) {
        return false;
      }

      return true;
    },
    [activeTheme],
  );

  const suppressBrowserAssistCanvasAutoOpen = useCallback(() => {
    if (activeTheme !== "general") {
      return;
    }

    browserAssistAutoOpenDismissedScopeRef.current = "__dismissed__";
  }, [activeTheme]);

  const suppressGeneralCanvasArtifactAutoOpen = useCallback(() => {}, []);

  useEffect(() => {
    if (activeTheme !== "general") {
      browserAssistScopeTrackerRef.current = null;
      browserAssistAutoOpenDismissedScopeRef.current = null;
      return;
    }

    if (!currentBrowserAssistScopeKey) {
      return;
    }

    if (
      browserAssistScopeTrackerRef.current &&
      browserAssistScopeTrackerRef.current !== currentBrowserAssistScopeKey
    ) {
      browserAssistAutoOpenDismissedScopeRef.current = null;
    }

    browserAssistScopeTrackerRef.current = currentBrowserAssistScopeKey;
  }, [activeTheme, currentBrowserAssistScopeKey]);

  const commitBrowserAssistSessionState = useCallback(
    (candidate: BrowserAssistSessionState | null) => {
      if (activeTheme !== "general" || !candidate) {
        return;
      }

      setBrowserAssistSessionState((current) => {
        const next = mergeBrowserAssistSessionStates(current, candidate);
        return areBrowserAssistSessionStatesEqual(current, next)
          ? current
          : next;
      });
    },
    [activeTheme],
  );

  const { siteSkillExecutionState, siteSkillSavedContentTarget } =
    useWorkspaceBrowserAssistSiteSkillRuntime({
      activeTheme,
      projectId,
      contentId,
      initialSiteSkillLaunch,
      siteSkillLaunchNonce,
      commitBrowserAssistSessionState,
    });

  useEffect(() => {
    if (activeTheme !== "general") {
      setBrowserAssistSessionState(null);
      return;
    }

    setBrowserAssistSessionState(
      loadBrowserAssistSessionState(projectId, sessionId),
    );
  }, [activeTheme, browserAssistStorageKey, projectId, sessionId]);

  useEffect(() => {
    if (activeTheme !== "general") {
      return;
    }

    commitBrowserAssistSessionState(browserAssistSessionFromArtifact);
  }, [
    activeTheme,
    browserAssistSessionFromArtifact,
    commitBrowserAssistSessionState,
  ]);

  useEffect(() => {
    if (activeTheme !== "general") {
      return;
    }

    commitBrowserAssistSessionState(latestBrowserAssistSessionFromMessages);
  }, [
    activeTheme,
    commitBrowserAssistSessionState,
    latestBrowserAssistSessionFromMessages,
  ]);

  useEffect(() => {
    if (activeTheme !== "general") {
      return;
    }

    if (browserAssistSessionState) {
      saveBrowserAssistSessionState(
        projectId,
        sessionId,
        browserAssistSessionState,
      );
      return;
    }

    clearBrowserAssistSessionState(projectId, sessionId);
  }, [
    activeTheme,
    browserAssistSessionState,
    browserAssistStorageKey,
    projectId,
    sessionId,
  ]);

  const {
    browserAssistLaunching,
    attachExistingSessionBrowserAssist,
    ensureBrowserAssistCanvas,
    handleOpenBrowserAssistInCanvas,
  } = useWorkspaceBrowserAssistCanvasActions({
    activeTheme,
    projectId,
    sessionId,
    input,
    browserAssistArtifact,
    browserAssistSessionState,
    currentBrowserAssistScopeKey,
    generalBrowserAssistProfileKey,
    autoLaunchingBrowserAssistKeyRef,
    commitBrowserAssistSessionState,
    openBrowserAssistCanvas,
    upsertGeneralArtifact,
    onBrowserWorkbenchOpenRequest,
  });

  useEffect(() => {
    if (
      !openBrowserAssistOnMount ||
      openBrowserAssistOnMountHandledRef.current
    ) {
      return;
    }

    openBrowserAssistOnMountHandledRef.current = true;
    void ensureBrowserAssistCanvas(initialUserPrompt || "", {
      navigationMode: "best-effort",
    });
  }, [ensureBrowserAssistCanvas, initialUserPrompt, openBrowserAssistOnMount]);

  useEffect(() => {
    if (activeTheme !== "general") {
      autoOpenedBrowserAssistSessionIdRef.current = "";
      autoLaunchingBrowserAssistKeyRef.current = "";
      browserAssistLaunchRequestIdRef.current += 1;
      return;
    }

    if (
      !browserAssistSessionState?.sessionId &&
      !browserAssistSessionState?.profileKey
    ) {
      return;
    }

    const artifactMeta = asRecord(browserAssistArtifact?.meta);
    const currentSessionId = readFirstString(
      artifactMeta ? [artifactMeta] : [],
      ["sessionId", "session_id"],
    );
    const currentProfileKey = readFirstString(
      artifactMeta ? [artifactMeta] : [],
      ["profileKey", "profile_key"],
    );
    const currentUrl = readFirstString(artifactMeta ? [artifactMeta] : [], [
      "url",
      "launchUrl",
    ]);
    const currentTargetId = readFirstString(
      artifactMeta ? [artifactMeta] : [],
      ["targetId", "target_id"],
    );
    const currentTransportKind = readFirstString(
      artifactMeta ? [artifactMeta] : [],
      ["transportKind", "transport_kind"],
    );
    const currentLifecycleState = readFirstString(
      artifactMeta ? [artifactMeta] : [],
      ["lifecycleState", "lifecycle_state"],
    );
    const currentControlMode = readFirstString(
      artifactMeta ? [artifactMeta] : [],
      ["controlMode", "control_mode"],
    );
    const currentTitle = browserAssistArtifact?.title?.trim();

    const nextArtifact = buildBrowserAssistArtifact({
      scopeKey:
        currentBrowserAssistScopeKey ||
        resolveBrowserAssistSessionScopeKey(projectId, sessionId),
      profileKey:
        browserAssistSessionState.profileKey ||
        currentProfileKey ||
        generalBrowserAssistProfileKey,
      browserSessionId:
        browserAssistSessionState.sessionId || currentSessionId || "",
      url:
        browserAssistSessionState.url || currentUrl || "https://www.google.com",
      title:
        browserAssistSessionState.title ||
        currentTitle ||
        getBrowserAssistFallbackTitle(),
      targetId: browserAssistSessionState.targetId || currentTargetId,
      transportKind:
        browserAssistSessionState.transportKind || currentTransportKind,
      lifecycleState:
        browserAssistSessionState.lifecycleState || currentLifecycleState,
      controlMode: browserAssistSessionState.controlMode || currentControlMode,
    });

    const nextMeta = asRecord(nextArtifact.meta);
    const nextSessionId = readFirstString(nextMeta ? [nextMeta] : [], [
      "sessionId",
      "session_id",
    ]);
    const nextProfileKey = readFirstString(nextMeta ? [nextMeta] : [], [
      "profileKey",
      "profile_key",
    ]);
    const nextUrl = readFirstString(nextMeta ? [nextMeta] : [], [
      "url",
      "launchUrl",
    ]);
    const nextTargetId = readFirstString(nextMeta ? [nextMeta] : [], [
      "targetId",
      "target_id",
    ]);
    const nextTransportKind = readFirstString(nextMeta ? [nextMeta] : [], [
      "transportKind",
      "transport_kind",
    ]);
    const nextLifecycleState = readFirstString(nextMeta ? [nextMeta] : [], [
      "lifecycleState",
      "lifecycle_state",
    ]);
    const nextControlMode = readFirstString(nextMeta ? [nextMeta] : [], [
      "controlMode",
      "control_mode",
    ]);
    const currentScopeKey = resolveBrowserAssistArtifactScopeKey(
      browserAssistArtifact,
    );
    const nextScopeKey = resolveBrowserAssistArtifactScopeKey(nextArtifact);

    const shouldUpsertArtifact =
      !browserAssistArtifact ||
      currentScopeKey !== nextScopeKey ||
      currentSessionId !== nextSessionId ||
      currentProfileKey !== nextProfileKey ||
      currentUrl !== nextUrl ||
      currentTargetId !== nextTargetId ||
      currentTransportKind !== nextTransportKind ||
      currentLifecycleState !== nextLifecycleState ||
      currentControlMode !== nextControlMode ||
      currentTitle !== nextArtifact.title;

    if (shouldUpsertArtifact) {
      upsertGeneralArtifact(nextArtifact);
    }

    const autoOpenKey =
      browserAssistSessionState.sessionId ||
      `${
        browserAssistSessionState.profileKey || generalBrowserAssistProfileKey
      }:${browserAssistSessionState.url || currentUrl || "pending"}`;
    if (
      shouldAutoOpenPassiveBrowserAssist(
        nextArtifact,
        browserAssistLaunching,
      ) &&
      autoOpenedBrowserAssistSessionIdRef.current !== autoOpenKey
    ) {
      autoOpenedBrowserAssistSessionIdRef.current = autoOpenKey;
      autoOpenBrowserAssistCanvas(nextArtifact.id);
    }
  }, [
    activeTheme,
    autoOpenBrowserAssistCanvas,
    browserAssistLaunching,
    browserAssistArtifact,
    browserAssistSessionState,
    currentBrowserAssistScopeKey,
    generalBrowserAssistProfileKey,
    projectId,
    sessionId,
    upsertGeneralArtifact,
  ]);

  useEffect(() => {
    if (activeTheme !== "general") {
      autoLaunchingBrowserAssistKeyRef.current = "";
      browserAssistLaunchRequestIdRef.current += 1;
      return;
    }

    if (
      !browserAssistSessionState?.sessionId &&
      !browserAssistSessionState?.profileKey
    ) {
      return;
    }

    const nextSessionId = browserAssistSessionState.sessionId || "";
    const nextProfileKey =
      browserAssistSessionState.profileKey || generalBrowserAssistProfileKey;
    const nextUrl = browserAssistSessionState.url || "https://www.google.com";
    const nextTitle =
      browserAssistSessionState.title || getBrowserAssistFallbackTitle();
    const artifactMeta = asRecord(browserAssistArtifact?.meta);
    const currentArtifactProfileKey = readFirstString(
      artifactMeta ? [artifactMeta] : [],
      ["profileKey", "profile_key"],
    );
    const currentArtifactUrl = readFirstString(
      artifactMeta ? [artifactMeta] : [],
      ["url", "launchUrl"],
    );
    const currentArtifactLaunchState = readFirstString(
      artifactMeta ? [artifactMeta] : [],
      ["launchState", "launch_state"],
    );

    if (nextSessionId || !nextProfileKey || !nextUrl) {
      return;
    }

    if (!canAutoRestoreDetachedBrowserAssistSession) {
      return;
    }

    const isSameFailedLaunchArtifact =
      isFailedBrowserAssistLaunchState(currentArtifactLaunchState) &&
      currentArtifactProfileKey === nextProfileKey &&
      currentArtifactUrl === nextUrl;
    if (isSameFailedLaunchArtifact) {
      return;
    }

    const launchKey = `${nextProfileKey}:${nextUrl}`;
    if (autoLaunchingBrowserAssistKeyRef.current === launchKey) {
      return;
    }
    autoLaunchingBrowserAssistKeyRef.current = launchKey;
    const browserAssistScopeKey =
      currentBrowserAssistScopeKey ||
      resolveBrowserAssistSessionScopeKey(projectId, sessionId);
    upsertGeneralArtifact(
      buildPendingBrowserAssistArtifact({
        scopeKey: browserAssistScopeKey,
        profileKey: nextProfileKey,
        url: nextUrl,
        title: nextTitle,
        launchHint: getBrowserAssistAttachedLaunchHint(),
      }),
    );
    autoOpenBrowserAssistCanvas(GENERAL_BROWSER_ASSIST_ARTIFACT_ID);
    const launchRequestId = browserAssistLaunchRequestIdRef.current + 1;
    browserAssistLaunchRequestIdRef.current = launchRequestId;
    void (async () => {
      let attachedSessionError: unknown = null;
      try {
        if (
          await attachExistingSessionBrowserAssist({
            profileKey: nextProfileKey,
            url: nextUrl,
            fallbackTitle: nextTitle,
            silent: true,
          })
        ) {
          return;
        }
      } catch (error) {
        attachedSessionError = error;
      }

      if (browserAssistLaunchRequestIdRef.current === launchRequestId) {
        const errorMessage = buildAttachedSessionOnlyErrorMessage(
          nextTitle,
          attachedSessionError,
        );
        upsertGeneralArtifact(
          buildFailedBrowserAssistArtifact({
            scopeKey: browserAssistScopeKey,
            profileKey: nextProfileKey,
            url: nextUrl,
            title: nextTitle,
            error: errorMessage,
          }),
        );
        autoLaunchingBrowserAssistKeyRef.current = "";
      }
    })();
  }, [
    activeTheme,
    autoOpenBrowserAssistCanvas,
    browserAssistArtifact,
    browserAssistSessionState,
    canAutoRestoreDetachedBrowserAssistSession,
    currentBrowserAssistScopeKey,
    generalBrowserAssistProfileKey,
    attachExistingSessionBrowserAssist,
    projectId,
    sessionId,
    upsertGeneralArtifact,
  ]);

  return {
    browserAssistLaunching,
    browserAssistSessionState,
    siteSkillExecutionState,
    siteSkillSavedContentTarget,
    isBrowserAssistReady,
    currentBrowserAssistScopeKey,
    ensureBrowserAssistCanvas,
    handleOpenBrowserAssistInCanvas,
    suppressBrowserAssistCanvasAutoOpen,
    suppressGeneralCanvasArtifactAutoOpen,
  };
}
