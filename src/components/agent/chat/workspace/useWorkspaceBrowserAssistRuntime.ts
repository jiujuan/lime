import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import i18n from "i18next";
import { toast } from "sonner";
import { initLimeI18n } from "@/i18n/createI18n";
import type { LayoutMode } from "@/lib/workspace/workbenchContract";
import { executeBrowserSessionAction } from "@/lib/api/browserRuntime";
import {
  browserExecuteAction,
  siteRunAdapter,
  type SiteAdapterRunResult,
} from "@/lib/webview-api";
import type { Artifact } from "@/lib/artifact/types";
import type { AgentSiteSkillLaunchParams } from "@/types/page";
import type {
  BrowserAssistSessionState,
  Message,
  SiteSavedContentTarget,
} from "../types";
import { resolveSiteSavedContentTargetFromRunResult } from "../utils/siteToolResultSummary";
import {
  areBrowserAssistSessionStatesEqual,
  clearBrowserAssistSessionState,
  createBrowserAssistSessionState,
  extractBrowserAssistSessionFromArtifact,
  findLatestBrowserAssistSessionInMessages,
  loadBrowserAssistSessionState,
  mergeBrowserAssistSessionStates,
  resolveBrowserAssistSessionScopeKey,
  saveBrowserAssistSessionState,
} from "../utils/browserAssistSession";
import {
  extractExplicitUrlFromText,
  resolveBrowserAssistLaunchUrl,
} from "../utils/browserAssistIntent";
import {
  GENERAL_BROWSER_ASSIST_ARTIFACT_ID,
  asRecord,
  buildBrowserAssistArtifact,
  buildFailedBrowserAssistArtifact,
  buildPendingBrowserAssistArtifact,
  readFirstString,
  resolveBrowserAssistArtifactScopeKey,
} from "./browserAssistArtifact";
import {
  buildBrowserAssistControlSessionRef,
  resolveBrowserAssistNavigationControlPlan,
  resolveBrowserAssistObservationControlPlan,
  type BrowserAssistControlPlan,
} from "./workspaceBrowserAssistControl";

function normalizeBrowserAssistState(value: string | null | undefined): string {
  return value?.trim().toLowerCase() || "";
}

function isFailedBrowserAssistLaunchState(
  value: string | null | undefined,
): boolean {
  return normalizeBrowserAssistState(value) === "failed";
}

function normalizeBrowserAssistBackend(
  value: string | null | undefined,
): "lime_extension_bridge" | "cdp_direct" | undefined {
  if (value === "lime_extension_bridge" || value === "cdp_direct") {
    return value;
  }
  return undefined;
}

function getWorkspaceText(
  key: string,
  options?: Record<string, unknown>,
): string {
  const instance = i18n.isInitialized ? i18n : initLimeI18n();
  return String(instance.t(key as never, { ns: "workspace", ...options }));
}

function getBrowserAssistFallbackTitle(): string {
  return getWorkspaceText("workspace.browserAssistRenderer.titleFallback");
}

function getBrowserAssistAttachedLaunchHint(): string {
  return getWorkspaceText("workspace.browserAssistRenderer.launching.detail");
}

function buildAttachedSessionOnlyErrorMessage(
  targetLabel: string,
  error?: unknown,
): string {
  const detail =
    error instanceof Error
      ? error.message.trim()
      : typeof error === "string"
        ? error.trim()
        : "";
  return getWorkspaceText(
    detail
      ? "workspace.browserAssistRenderer.failed.attachedOnlyWithDetail"
      : "workspace.browserAssistRenderer.failed.attachedOnly",
    { target: targetLabel, detail },
  );
}

function resolveBrowserActionPageSnapshot(
  resultData: unknown,
  fallbackUrl: string,
  fallbackTitle: string,
) {
  const normalizedResultData = asRecord(resultData);
  const pageInfo =
    asRecord(normalizedResultData?.page_info) ||
    asRecord(normalizedResultData?.pageInfo);

  return {
    url:
      readFirstString(
        [pageInfo, normalizedResultData],
        ["url", "target_url", "targetUrl"],
      ) || fallbackUrl,
    title:
      readFirstString(
        [pageInfo, normalizedResultData],
        ["title", "target_title", "targetTitle"],
      ) || fallbackTitle,
  };
}

async function executeBrowserAssistControlPlan(
  plan: BrowserAssistControlPlan,
) {
  if (plan.channel === "app_server_browser_session") {
    if (!plan.sessionId) {
      throw new Error("Browser session ref 缺少 sessionId");
    }
    const result = await executeBrowserSessionAction({
      sessionId: plan.sessionId,
      action: plan.action,
      args: plan.args,
    });
    return {
      data: result.result,
      sessionId: result.sessionId,
      targetId: undefined,
      transportKind: "cdp_frames",
    };
  }

  if (!plan.profileKey) {
    throw new Error("Browser session ref 缺少 profileKey");
  }
  const result = await browserExecuteAction({
    profile_key: plan.profileKey,
    backend: "lime_extension_bridge",
    action: plan.action,
    args: plan.args,
    timeout_ms: 20000,
  });
  if (!result.success) {
    throw new Error(result.error || "浏览器控制失败");
  }
  return {
    data: result.data,
    sessionId: result.session_id,
    targetId: result.target_id,
    transportKind: "existing_session",
  };
}

function hasActiveBrowserAssistSession(
  sessionState: BrowserAssistSessionState | null,
): boolean {
  if (!sessionState) {
    return false;
  }

  if (!sessionState.sessionId && !sessionState.profileKey) {
    return false;
  }

  const lifecycleState = normalizeBrowserAssistState(
    sessionState.lifecycleState,
  );
  return !["failed", "closed", "terminated"].includes(lifecycleState || "");
}

function shouldAutoOpenPassiveBrowserAssist(
  artifact: Artifact | null,
  launching: boolean,
): boolean {
  if (launching) {
    return true;
  }

  if (!artifact) {
    return false;
  }

  const meta = asRecord(artifact.meta);
  const launchState = readFirstString(meta ? [meta] : [], [
    "launchState",
    "launch_state",
  ]);

  return (
    artifact.status === "pending" ||
    normalizeBrowserAssistState(launchState) === "launching"
  );
}

type EnsureBrowserAssistCanvasHandler = (
  sourceText: string,
  options?: {
    silent?: boolean;
    navigationMode?: "none" | "explicit-url" | "best-effort";
  },
) => Promise<boolean>;

export interface SiteSkillExecutionState {
  phase: "running" | "success" | "error" | "blocked";
  adapterName: string;
  skillTitle?: string;
  profileKey?: string;
  targetId?: string;
  sourceUrl?: string;
  message: string;
  reportHint?: string;
  result?: SiteAdapterRunResult;
}

interface UseWorkspaceBrowserAssistRuntimeParams {
  activeTheme: string;
  projectId?: string | null;
  sessionId?: string | null;
  contentId?: string | null;
  input: string;
  initialUserPrompt?: string;
  openBrowserAssistOnMount: boolean;
  initialSiteSkillLaunch?: AgentSiteSkillLaunchParams;
  siteSkillLaunchNonce?: number;
  artifacts: Artifact[];
  messages: Message[];
  setLayoutMode: Dispatch<SetStateAction<LayoutMode>>;
  upsertGeneralArtifact: (artifact: Artifact) => void;
  generalBrowserAssistProfileKey: string;
  onBrowserWorkbenchOpenRequest?: (url: string | null) => void;
}

interface WorkspaceBrowserAssistRuntimeResult {
  browserAssistLaunching: boolean;
  browserAssistSessionState: BrowserAssistSessionState | null;
  siteSkillExecutionState: SiteSkillExecutionState | null;
  siteSkillSavedContentTarget: SiteSavedContentTarget | null;
  isBrowserAssistReady: boolean;
  currentBrowserAssistScopeKey: string | null;
  ensureBrowserAssistCanvas: EnsureBrowserAssistCanvasHandler;
  handleOpenBrowserAssistInCanvas: () => Promise<void>;
  suppressBrowserAssistCanvasAutoOpen: () => void;
  suppressGeneralCanvasArtifactAutoOpen: () => void;
}

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
  const [browserAssistLaunching, setBrowserAssistLaunching] = useState(false);
  const [siteSkillExecutionState, setSiteSkillExecutionState] =
    useState<SiteSkillExecutionState | null>(null);
  const [browserAssistSessionState, setBrowserAssistSessionState] =
    useState<BrowserAssistSessionState | null>(null);
  const openBrowserAssistOnMountHandledRef = useRef(false);
  const initialSiteSkillLaunchHandledSignatureRef = useRef("");
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
  const siteSkillSavedContentTarget = useMemo(
    () =>
      resolveSiteSavedContentTargetFromRunResult(
        siteSkillExecutionState?.result || null,
      ),
    [siteSkillExecutionState?.result],
  );

  const initialSiteSkillLaunchSignature = useMemo(() => {
    if (!initialSiteSkillLaunch?.adapterName?.trim()) {
      return "";
    }

    return JSON.stringify({
      adapterName: initialSiteSkillLaunch.adapterName,
      profileKey: initialSiteSkillLaunch.profileKey?.trim() || null,
      targetId: initialSiteSkillLaunch.targetId?.trim() || null,
      args: initialSiteSkillLaunch.args ?? null,
      autoRun: initialSiteSkillLaunch.autoRun ?? null,
      requireAttachedSession:
        initialSiteSkillLaunch.requireAttachedSession ?? null,
      preferredBackend:
        normalizeBrowserAssistBackend(
          initialSiteSkillLaunch.preferredBackend,
        ) ?? null,
      autoLaunch: initialSiteSkillLaunch.autoLaunch ?? null,
      saveTitle: initialSiteSkillLaunch.saveTitle?.trim() || null,
      skillTitle: initialSiteSkillLaunch.skillTitle?.trim() || null,
      projectId: projectId?.trim() || null,
      contentId: contentId?.trim() || null,
      launchNonce: siteSkillLaunchNonce ?? null,
    });
  }, [contentId, initialSiteSkillLaunch, projectId, siteSkillLaunchNonce]);
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

  useEffect(() => {
    if (activeTheme !== "general") {
      initialSiteSkillLaunchHandledSignatureRef.current = "";
      setSiteSkillExecutionState(null);
      return;
    }

    if (!initialSiteSkillLaunchSignature || !initialSiteSkillLaunch) {
      return;
    }

    if (
      initialSiteSkillLaunchHandledSignatureRef.current ===
      initialSiteSkillLaunchSignature
    ) {
      return;
    }

    initialSiteSkillLaunchHandledSignatureRef.current =
      initialSiteSkillLaunchSignature;

    let cancelled = false;
    const toastId = toast.loading(
      `正在执行站点技能：${initialSiteSkillLaunch.adapterName}`,
    );

    void (async () => {
      try {
        setSiteSkillExecutionState({
          phase: "running",
          adapterName: initialSiteSkillLaunch.adapterName,
          skillTitle:
            initialSiteSkillLaunch.skillTitle ||
            initialSiteSkillLaunch.adapterName,
          profileKey: initialSiteSkillLaunch.profileKey,
          targetId: initialSiteSkillLaunch.targetId,
          message: `正在通过已附着的浏览器会话执行 ${initialSiteSkillLaunch.skillTitle || initialSiteSkillLaunch.adapterName}。`,
        });
        const result = await siteRunAdapter({
          adapter_name: initialSiteSkillLaunch.adapterName,
          args: initialSiteSkillLaunch.args,
          profile_key: initialSiteSkillLaunch.profileKey?.trim() || undefined,
          target_id: initialSiteSkillLaunch.targetId?.trim() || undefined,
          content_id: contentId?.trim() || undefined,
          project_id: projectId?.trim() || undefined,
          save_title: initialSiteSkillLaunch.saveTitle?.trim() || undefined,
          require_attached_session:
            initialSiteSkillLaunch.requireAttachedSession ?? false,
          skill_title: initialSiteSkillLaunch.skillTitle?.trim() || undefined,
        });

        if (cancelled) {
          return;
        }

        commitBrowserAssistSessionState(
          createBrowserAssistSessionState({
            sessionId: result.session_id,
            profileKey: result.profile_key,
            url: result.source_url?.trim() || result.entry_url?.trim(),
            title: result.adapter || getBrowserAssistFallbackTitle(),
            targetId: result.target_id,
            source: "runtime_launch",
            updatedAt: Date.now(),
          }),
        );

        if (!result.ok) {
          const failureMessage =
            result.error_message || result.error_code || "站点技能执行失败";
          setSiteSkillExecutionState({
            phase:
              result.error_code === "attached_session_required"
                ? "blocked"
                : "error",
            adapterName: initialSiteSkillLaunch.adapterName,
            skillTitle:
              initialSiteSkillLaunch.skillTitle ||
              initialSiteSkillLaunch.adapterName,
            profileKey: result.profile_key,
            targetId: result.target_id,
            sourceUrl: result.source_url,
            message: failureMessage,
            reportHint: result.report_hint,
            result,
          });
          toast.error(`站点技能执行失败：${failureMessage}`, {
            id: toastId,
          });
          return;
        }

        const hasMarkdownBundleOutput = Boolean(
          result.saved_content?.markdown_relative_path?.trim(),
        );
        const successMessage = result.saved_content
          ? result.saved_by === "explicit_content" ||
            result.saved_by === "context_content"
            ? hasMarkdownBundleOutput
              ? "站点技能已完成，Markdown 已写回当前主稿并同步保存图片资源"
              : "站点技能已完成，结果已写回当前主稿"
            : hasMarkdownBundleOutput
              ? "站点技能已完成，Markdown 与图片已保存到项目资源"
              : "站点技能已完成，结果已保存到项目资源"
          : `站点技能已完成`;

        setSiteSkillExecutionState({
          phase: "success",
          adapterName: initialSiteSkillLaunch.adapterName,
          skillTitle:
            initialSiteSkillLaunch.skillTitle ||
            initialSiteSkillLaunch.adapterName,
          profileKey: result.profile_key,
          targetId: result.target_id,
          sourceUrl: result.source_url,
          message: successMessage,
          reportHint: result.save_error_message || result.report_hint,
          result,
        });

        if (result.save_error_message) {
          toast.error(
            `${successMessage}，但自动保存失败：${result.save_error_message}`,
            { id: toastId },
          );
          return;
        }

        toast.success(successMessage, { id: toastId });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setSiteSkillExecutionState({
          phase: "error",
          adapterName: initialSiteSkillLaunch.adapterName,
          skillTitle:
            initialSiteSkillLaunch.skillTitle ||
            initialSiteSkillLaunch.adapterName,
          profileKey: initialSiteSkillLaunch.profileKey,
          targetId: initialSiteSkillLaunch.targetId,
          message: error instanceof Error ? error.message : String(error),
        });
        toast.error(
          `站点技能执行失败：${
            error instanceof Error ? error.message : String(error)
          }`,
          { id: toastId },
        );
      } finally {
        // 站点技能执行不应驱动浏览器画布的“启动中”状态。
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeTheme,
    commitBrowserAssistSessionState,
    contentId,
    initialSiteSkillLaunch,
    initialSiteSkillLaunchSignature,
    projectId,
  ]);

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
    commitBrowserAssistSessionState,
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
