import { useMemo, type ReactNode } from "react";
import type { SiteSavedContentTarget } from "../types";
import { ServiceSkillExecutionCard } from "./ServiceSkillExecutionCard";
import type { SiteSkillExecutionState } from "./useWorkspaceBrowserAssistRuntime";

interface UseWorkspaceServiceSkillExecutionCardRuntimeParams {
  onOpenBrowserRuntime: () => void;
  onOpenResultFile: (relativePath: string) => void;
  onOpenSavedSiteContent: (target: SiteSavedContentTarget) => void;
  preferredResultFileTarget?: {
    relativePath: string;
    title?: string;
  } | null;
  state: SiteSkillExecutionState | null;
}

export function useWorkspaceServiceSkillExecutionCardRuntime({
  onOpenBrowserRuntime,
  onOpenResultFile,
  onOpenSavedSiteContent,
  preferredResultFileTarget,
  state,
}: UseWorkspaceServiceSkillExecutionCardRuntimeParams): {
  card: ReactNode;
} {
  const card = useMemo(
    () =>
      state ? (
        <ServiceSkillExecutionCard
          state={state}
          onOpenBrowserRuntime={
            state.phase === "blocked" ? onOpenBrowserRuntime : undefined
          }
          preferredResultFileTarget={preferredResultFileTarget}
          onOpenResultFile={onOpenResultFile}
          onOpenSavedSiteContent={onOpenSavedSiteContent}
        />
      ) : null,
    [
      onOpenBrowserRuntime,
      onOpenResultFile,
      onOpenSavedSiteContent,
      preferredResultFileTarget,
      state,
    ],
  );

  return {
    card,
  };
}
