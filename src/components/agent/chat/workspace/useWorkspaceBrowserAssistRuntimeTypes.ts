import type { Dispatch, SetStateAction } from "react";
import type { Artifact } from "@/lib/artifact/types";
import type { LayoutMode } from "@/lib/workspace/workbenchContract";
import type { SiteAdapterRunResult } from "@/lib/webview-api";
import type { AgentSiteSkillLaunchParams } from "@/types/page";
import type {
  BrowserAssistSessionState,
  Message,
  SiteSavedContentTarget,
} from "../types";

export type EnsureBrowserAssistCanvasHandler = (
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

export interface UseWorkspaceBrowserAssistRuntimeParams {
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

export interface WorkspaceBrowserAssistRuntimeResult {
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

export type BrowserAssistSessionCommitter = (
  candidate: BrowserAssistSessionState | null,
) => void;
