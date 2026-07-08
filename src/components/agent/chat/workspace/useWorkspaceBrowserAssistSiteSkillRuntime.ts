import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { siteRunAdapter } from "@/lib/webview-api";
import type { AgentSiteSkillLaunchParams } from "@/types/page";
import { resolveSiteSavedContentTargetFromRunResult } from "../utils/siteToolResultSummary";
import { createBrowserAssistSessionState } from "../utils/browserAssistSession";
import {
  getBrowserAssistFallbackTitle,
  normalizeBrowserAssistBackend,
} from "./workspaceBrowserAssistRuntimeHelpers";
import type {
  BrowserAssistSessionCommitter,
  SiteSkillExecutionState,
} from "./useWorkspaceBrowserAssistRuntimeTypes";

interface UseWorkspaceBrowserAssistSiteSkillRuntimeParams {
  activeTheme: string;
  projectId?: string | null;
  contentId?: string | null;
  initialSiteSkillLaunch?: AgentSiteSkillLaunchParams;
  siteSkillLaunchNonce?: number;
  commitBrowserAssistSessionState: BrowserAssistSessionCommitter;
}

export function useWorkspaceBrowserAssistSiteSkillRuntime({
  activeTheme,
  projectId,
  contentId,
  initialSiteSkillLaunch,
  siteSkillLaunchNonce,
  commitBrowserAssistSessionState,
}: UseWorkspaceBrowserAssistSiteSkillRuntimeParams) {
  const [siteSkillExecutionState, setSiteSkillExecutionState] =
    useState<SiteSkillExecutionState | null>(null);
  const initialSiteSkillLaunchHandledSignatureRef = useRef("");

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
        // 站点技能执行不驱动浏览器画布的“启动中”状态。
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

  return {
    siteSkillExecutionState,
    siteSkillSavedContentTarget,
  };
}
