import { useCallback, useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import { browserExecuteAction } from "@/lib/webview-api";
import type { Artifact } from "@/lib/artifact/types";
import type { BrowserAssistSessionState } from "../types";
import {
  createBrowserAssistSessionState,
  resolveBrowserAssistSessionScopeKey,
} from "../utils/browserAssistSession";
import {
  extractExplicitUrlFromText,
  resolveBrowserAssistLaunchUrl,
} from "../utils/browserAssistIntent";
import {
  GENERAL_BROWSER_ASSIST_ARTIFACT_ID,
  asRecord,
  buildFailedBrowserAssistArtifact,
  buildPendingBrowserAssistArtifact,
  readFirstString,
} from "./browserAssistArtifact";
import {
  buildBrowserAssistControlSessionRef,
  resolveBrowserAssistNavigationControlPlan,
  resolveBrowserAssistObservationControlPlan,
} from "./workspaceBrowserAssistControl";
import {
  buildAttachedSessionOnlyErrorMessage,
  executeBrowserAssistControlPlan,
  getBrowserAssistAttachedLaunchHint,
  getBrowserAssistFallbackTitle,
  isFailedBrowserAssistLaunchState,
  normalizeBrowserAssistState,
  resolveBrowserActionPageSnapshot,
} from "./workspaceBrowserAssistRuntimeHelpers";
import type {
  BrowserAssistSessionCommitter,
  EnsureBrowserAssistCanvasHandler,
} from "./useWorkspaceBrowserAssistRuntimeTypes";

interface UseWorkspaceBrowserAssistCanvasActionsParams {
  activeTheme: string;
  projectId?: string | null;
  sessionId?: string | null;
  input: string;
  browserAssistArtifact: Artifact | null;
  browserAssistSessionState: BrowserAssistSessionState | null;
  currentBrowserAssistScopeKey: string | null;
  generalBrowserAssistProfileKey: string;
  autoLaunchingBrowserAssistKeyRef: MutableRefObject<string>;
  commitBrowserAssistSessionState: BrowserAssistSessionCommitter;
  openBrowserAssistCanvas: (artifactId?: string) => void;
  upsertGeneralArtifact: (artifact: Artifact) => void;
  onBrowserWorkbenchOpenRequest?: (url: string | null) => void;
}

export function useWorkspaceBrowserAssistCanvasActions({
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
}: UseWorkspaceBrowserAssistCanvasActionsParams) {
  const [browserAssistLaunching, setBrowserAssistLaunching] = useState(false);

  const attachExistingSessionBrowserAssist = useCallback(
    async (params: {
      profileKey: string;
      url: string;
      fallbackTitle: string;
      silent?: boolean;
    }) => {
      const { profileKey, url, fallbackTitle, silent } = params;
      const result = await browserExecuteAction({
        profile_key: profileKey,
        backend: "lime_extension_bridge",
        action: "navigate",
        args: {
          url,
          wait_for_page_info: true,
        },
        timeout_ms: 20000,
      });

      if (!result.success) {
        throw new Error(result.error || "附着当前 Chrome 导航失败");
      }

      const { url: nextUrl, title: nextTitle } =
        resolveBrowserActionPageSnapshot(result.data, url, fallbackTitle);

      commitBrowserAssistSessionState(
        createBrowserAssistSessionState({
          sessionId: result.session_id || undefined,
          profileKey,
          url: nextUrl,
          title: nextTitle,
          targetId: result.target_id || undefined,
          transportKind: "existing_session",
          lifecycleState: "live",
          source: "runtime_launch",
          updatedAt: Date.now(),
        }),
      );
      openBrowserAssistCanvas(GENERAL_BROWSER_ASSIST_ARTIFACT_ID);

      if (!silent) {
        toast.success(`已附着当前 Chrome：${nextTitle}`);
      }
      return true;
    },
    [commitBrowserAssistSessionState, openBrowserAssistCanvas],
  );

  const navigateBrowserAssistCanvasToUrl = useCallback(
    async (url: string, options?: { silent?: boolean }): Promise<boolean> => {
      if (activeTheme !== "general" || !url.trim()) {
        return false;
      }

      const artifactMeta = asRecord(browserAssistArtifact?.meta);
      const profileKey =
        browserAssistSessionState?.profileKey ||
        readFirstString(artifactMeta ? [artifactMeta] : [], [
          "profileKey",
          "profile_key",
        ]) ||
        generalBrowserAssistProfileKey;
      const currentSessionId =
        browserAssistSessionState?.sessionId ||
        readFirstString(artifactMeta ? [artifactMeta] : [], [
          "sessionId",
          "session_id",
        ]) ||
        undefined;
      const currentUrl =
        browserAssistSessionState?.url ||
        readFirstString(artifactMeta ? [artifactMeta] : [], [
          "url",
          "launchUrl",
        ]) ||
        "";
      const fallbackTitle =
        browserAssistSessionState?.title ||
        browserAssistArtifact?.title?.trim() ||
        getBrowserAssistFallbackTitle();
      const transportKind = normalizeBrowserAssistState(
        browserAssistSessionState?.transportKind ||
          readFirstString(artifactMeta ? [artifactMeta] : [], [
            "transportKind",
            "transport_kind",
          ]),
      );
      const currentTargetId =
        browserAssistSessionState?.targetId ||
        readFirstString(artifactMeta ? [artifactMeta] : [], [
          "targetId",
          "target_id",
        ]) ||
        undefined;
      const currentSessionRef = buildBrowserAssistControlSessionRef({
        sessionId: currentSessionId,
        profileKey,
        url: currentUrl,
        title: fallbackTitle,
        targetId: currentTargetId,
        transportKind,
      });

      if (currentUrl === url) {
        openBrowserAssistCanvas(GENERAL_BROWSER_ASSIST_ARTIFACT_ID);
        return true;
      }

      setBrowserAssistLaunching(true);

      try {
        const currentSessionPlan = resolveBrowserAssistNavigationControlPlan(
          currentSessionRef,
          url,
        );
        if (currentSessionPlan) {
          const actionResult =
            await executeBrowserAssistControlPlan(currentSessionPlan);
          const { url: nextUrl, title: nextTitle } =
            resolveBrowserActionPageSnapshot(
              actionResult.data,
              url,
              fallbackTitle,
            );

          commitBrowserAssistSessionState(
            createBrowserAssistSessionState({
              sessionId:
                actionResult.sessionId ||
                currentSessionRef.browserSessionId ||
                undefined,
              profileKey: currentSessionRef.profileKey || profileKey,
              url: nextUrl,
              title: nextTitle,
              targetId: actionResult.targetId || currentTargetId,
              transportKind:
                actionResult.transportKind ||
                browserAssistSessionState?.transportKind,
              lifecycleState:
                browserAssistSessionState?.lifecycleState || "live",
              controlMode: browserAssistSessionState?.controlMode,
              source: "runtime_launch",
              updatedAt: Date.now(),
            }),
          );
          openBrowserAssistCanvas(GENERAL_BROWSER_ASSIST_ARTIFACT_ID);

          if (!options?.silent) {
            toast.success(`已切换浏览器页面：${nextTitle}`);
          }
          return true;
        }

        const attempts =
          transportKind === "existing_session"
            ? [
                {
                  backend: "lime_extension_bridge" as const,
                  args: {
                    url,
                    wait_for_page_info: true,
                  },
                  transportKind: "existing_session",
                },
              ]
            : !currentSessionId
              ? [
                  {
                    backend: "lime_extension_bridge" as const,
                    args: {
                      url,
                      wait_for_page_info: true,
                    },
                    transportKind: "existing_session",
                  },
                  {
                    backend: "cdp_direct" as const,
                    args: {
                      action: "goto",
                      url,
                      wait_for_page_info: true,
                    },
                    transportKind: browserAssistSessionState?.transportKind,
                  },
                ]
              : [
                  {
                    backend: "cdp_direct" as const,
                    args: {
                      action: "goto",
                      url,
                      wait_for_page_info: true,
                    },
                    transportKind: browserAssistSessionState?.transportKind,
                  },
                ];

        let result: Awaited<ReturnType<typeof browserExecuteAction>> | null =
          null;
        let resolvedTransportKind = browserAssistSessionState?.transportKind;
        let lastError: unknown = null;

        for (const attempt of attempts) {
          try {
            const nextResult = await browserExecuteAction({
              profile_key: profileKey,
              backend: attempt.backend,
              action: "navigate",
              args: attempt.args,
              timeout_ms: 20000,
            });
            if (!nextResult.success) {
              throw new Error(nextResult.error || "浏览器导航失败");
            }
            result = nextResult;
            resolvedTransportKind = attempt.transportKind;
            break;
          } catch (error) {
            lastError = error;
          }
        }

        if (!result) {
          throw lastError instanceof Error
            ? lastError
            : new Error("浏览器导航失败");
        }

        const { url: nextUrl, title: nextTitle } =
          resolveBrowserActionPageSnapshot(result.data, url, fallbackTitle);

        commitBrowserAssistSessionState(
          createBrowserAssistSessionState({
            sessionId:
              result.session_id ||
              browserAssistSessionState?.sessionId ||
              undefined,
            profileKey,
            url: nextUrl,
            title: nextTitle,
            targetId: result.target_id || currentTargetId,
            transportKind: resolvedTransportKind,
            lifecycleState: browserAssistSessionState?.lifecycleState || "live",
            controlMode: browserAssistSessionState?.controlMode,
            source: "runtime_launch",
            updatedAt: Date.now(),
          }),
        );
        openBrowserAssistCanvas(GENERAL_BROWSER_ASSIST_ARTIFACT_ID);

        if (!options?.silent) {
          toast.success(`已切换浏览器页面：${nextTitle}`);
        }
        return true;
      } catch (error) {
        if (!options?.silent) {
          toast.error(
            `切换浏览器页面失败: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        return false;
      } finally {
        setBrowserAssistLaunching(false);
      }
    },
    [
      activeTheme,
      browserAssistArtifact,
      browserAssistSessionState,
      commitBrowserAssistSessionState,
      generalBrowserAssistProfileKey,
      openBrowserAssistCanvas,
    ],
  );

  const observeBrowserAssistCanvasSession = useCallback(
    async (options?: { silent?: boolean }): Promise<boolean> => {
      if (activeTheme !== "general") {
        return false;
      }

      const artifactMeta = asRecord(browserAssistArtifact?.meta);
      const profileKey =
        browserAssistSessionState?.profileKey ||
        readFirstString(artifactMeta ? [artifactMeta] : [], [
          "profileKey",
          "profile_key",
        ]) ||
        generalBrowserAssistProfileKey;
      const currentSessionId =
        browserAssistSessionState?.sessionId ||
        readFirstString(artifactMeta ? [artifactMeta] : [], [
          "sessionId",
          "session_id",
        ]) ||
        undefined;
      const currentUrl =
        browserAssistSessionState?.url ||
        readFirstString(artifactMeta ? [artifactMeta] : [], [
          "url",
          "launchUrl",
        ]) ||
        "";
      const currentTitle =
        browserAssistSessionState?.title ||
        browserAssistArtifact?.title?.trim() ||
        getBrowserAssistFallbackTitle();
      const currentTargetId =
        browserAssistSessionState?.targetId ||
        readFirstString(artifactMeta ? [artifactMeta] : [], [
          "targetId",
          "target_id",
        ]) ||
        undefined;
      const transportKind =
        browserAssistSessionState?.transportKind ||
        readFirstString(artifactMeta ? [artifactMeta] : [], [
          "transportKind",
          "transport_kind",
        ]);
      const sessionRef = buildBrowserAssistControlSessionRef({
        sessionId: currentSessionId,
        profileKey,
        url: currentUrl,
        title: currentTitle,
        targetId: currentTargetId,
        transportKind,
      });
      const plan = resolveBrowserAssistObservationControlPlan(sessionRef);
      if (!plan) {
        return false;
      }

      try {
        const actionResult = await executeBrowserAssistControlPlan(plan);
        const { url: nextUrl, title: nextTitle } =
          resolveBrowserActionPageSnapshot(
            actionResult.data,
            currentUrl || sessionRef.launchUrl || "https://www.google.com",
            currentTitle,
          );
        commitBrowserAssistSessionState(
          createBrowserAssistSessionState({
            sessionId:
              actionResult.sessionId ||
              sessionRef.browserSessionId ||
              undefined,
            profileKey: sessionRef.profileKey || profileKey,
            url: nextUrl,
            title: nextTitle,
            targetId: actionResult.targetId || currentTargetId,
            transportKind:
              actionResult.transportKind ||
              browserAssistSessionState?.transportKind,
            lifecycleState: browserAssistSessionState?.lifecycleState || "live",
            controlMode: browserAssistSessionState?.controlMode,
            source: "runtime_launch",
            updatedAt: Date.now(),
          }),
        );
        return true;
      } catch (error) {
        if (!options?.silent) {
          toast.error(
            `读取浏览器页面失败: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        return false;
      }
    },
    [
      activeTheme,
      browserAssistArtifact,
      browserAssistSessionState,
      commitBrowserAssistSessionState,
      generalBrowserAssistProfileKey,
    ],
  );

  const ensureBrowserAssistCanvas =
    useCallback<EnsureBrowserAssistCanvasHandler>(
      async (
        sourceText: string,
        options?: {
          silent?: boolean;
          navigationMode?: "none" | "explicit-url" | "best-effort";
        },
      ): Promise<boolean> => {
        if (activeTheme !== "general") {
          return false;
        }

        const navigationMode = options?.navigationMode || "best-effort";
        const targetUrl =
          navigationMode === "explicit-url"
            ? extractExplicitUrlFromText(sourceText)
            : navigationMode === "best-effort"
              ? resolveBrowserAssistLaunchUrl(sourceText)
              : null;
        onBrowserWorkbenchOpenRequest?.(targetUrl);
        const artifactMeta = asRecord(browserAssistArtifact?.meta);
        const artifactSessionId = readFirstString(
          artifactMeta ? [artifactMeta] : [],
          ["sessionId", "session_id"],
        );
        const artifactProfileKey = readFirstString(
          artifactMeta ? [artifactMeta] : [],
          ["profileKey", "profile_key"],
        );
        const artifactLaunchState = readFirstString(
          artifactMeta ? [artifactMeta] : [],
          ["launchState", "launch_state"],
        );
        const hasFailedLaunchContext =
          !browserAssistSessionState?.sessionId &&
          !artifactSessionId &&
          isFailedBrowserAssistLaunchState(artifactLaunchState);
        const hasSessionContext = Boolean(
          !hasFailedLaunchContext &&
          (browserAssistSessionState?.sessionId ||
            browserAssistSessionState?.profileKey ||
            artifactSessionId ||
            artifactProfileKey ||
            browserAssistArtifact),
        );

        if (hasSessionContext) {
          openBrowserAssistCanvas(GENERAL_BROWSER_ASSIST_ARTIFACT_ID);
          if (!targetUrl) {
            void observeBrowserAssistCanvasSession({ silent: true });
            return true;
          }
          return navigateBrowserAssistCanvasToUrl(targetUrl, options);
        }

        if (!targetUrl) {
          return false;
        }

        const browserAssistScopeKey =
          currentBrowserAssistScopeKey ||
          resolveBrowserAssistSessionScopeKey(projectId, sessionId);
        const launchKey = `${generalBrowserAssistProfileKey}:${targetUrl}`;
        const browserAssistTitle = getBrowserAssistFallbackTitle();
        if (autoLaunchingBrowserAssistKeyRef.current === launchKey) {
          openBrowserAssistCanvas(GENERAL_BROWSER_ASSIST_ARTIFACT_ID);
          return true;
        }
        autoLaunchingBrowserAssistKeyRef.current = launchKey;
        upsertGeneralArtifact(
          buildPendingBrowserAssistArtifact({
            scopeKey: browserAssistScopeKey,
            profileKey: generalBrowserAssistProfileKey,
            url: targetUrl,
            title: browserAssistTitle,
            launchHint: getBrowserAssistAttachedLaunchHint(),
          }),
        );
        openBrowserAssistCanvas(GENERAL_BROWSER_ASSIST_ARTIFACT_ID);

        let attachedSessionError: unknown = null;
        try {
          if (
            await attachExistingSessionBrowserAssist({
              profileKey: generalBrowserAssistProfileKey,
              url: targetUrl,
              fallbackTitle: browserAssistTitle,
              silent: options?.silent,
            })
          ) {
            return true;
          }
        } catch (error) {
          attachedSessionError = error;
        }

        const errorMessage = buildAttachedSessionOnlyErrorMessage(
          browserAssistTitle,
          attachedSessionError,
        );
        upsertGeneralArtifact(
          buildFailedBrowserAssistArtifact({
            scopeKey: browserAssistScopeKey,
            profileKey: generalBrowserAssistProfileKey,
            url: targetUrl,
            title: browserAssistTitle,
            error: errorMessage,
          }),
        );
        autoLaunchingBrowserAssistKeyRef.current = "";
        if (!options?.silent) {
          toast.error(errorMessage);
        }
        return false;
      },
      [
        activeTheme,
        autoLaunchingBrowserAssistKeyRef,
        browserAssistArtifact,
        browserAssistSessionState?.profileKey,
        browserAssistSessionState?.sessionId,
        currentBrowserAssistScopeKey,
        generalBrowserAssistProfileKey,
        attachExistingSessionBrowserAssist,
        navigateBrowserAssistCanvasToUrl,
        observeBrowserAssistCanvasSession,
        onBrowserWorkbenchOpenRequest,
        openBrowserAssistCanvas,
        projectId,
        sessionId,
        upsertGeneralArtifact,
      ],
    );

  const handleOpenBrowserAssistInCanvas = useCallback(async () => {
    await ensureBrowserAssistCanvas(input, {
      navigationMode: "best-effort",
    });
  }, [ensureBrowserAssistCanvas, input]);

  return {
    browserAssistLaunching,
    attachExistingSessionBrowserAssist,
    ensureBrowserAssistCanvas,
    handleOpenBrowserAssistInCanvas,
  };
}
