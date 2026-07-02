/**
 * 应用页面分发层
 *
 * 负责根据当前页面类型渲染对应主内容，避免主入口继续膨胀。
 */

import { lazy, useCallback } from "react";
import styled from "styled-components";
import type {
  AgentPageParams,
  AgentAppPageParams,
  AgentAppsPageParams,
  AutomationPageParams,
  BrowserRuntimePageParams,
  KnowledgePageParams,
  Page,
  PageParams,
  PluginsPageParams,
  ResourcesPageParams,
  SettingsPageParams,
  SkillsPageParams,
} from "@/types/page";
import type { AgentAppRightSurfaceLaunchTarget } from "@/features/agent-app/ui/agentAppRightSurfaceLaunch";
import { AutomationPage } from "./automation";
import { ImConfigPage } from "./channels/ImConfigPage";
import { SettingsPageV2 } from "./settings-v2";

const PageWrapper = styled.div<{ $isActive: boolean }>`
  flex: 1;
  padding: 24px;
  overflow: auto;
  display: ${(props) => (props.$isActive ? "block" : "none")};
`;

const columnPageStyle = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
} as const;

const loadResourcesPage = () =>
  import("./resources").then((module) => ({
    default: module.ResourcesPage,
  }));
const loadSkillsWorkspacePage = () =>
  import("./skills").then((module) => ({
    default: module.SkillsWorkspacePage,
  }));
const loadPluginMarketplacePage = () =>
  import("@/features/plugin").then((module) => ({
    default: module.PluginMarketplacePage,
  }));
const loadKnowledgePage = () =>
  import("@/features/knowledge").then((module) => ({
    default: module.KnowledgePage,
  }));
const loadAgentAppLabPage = () =>
  import("@/features/agent-app").then((module) => ({
    default: module.AgentAppLabPage,
  }));
const loadAgentAppsPage = () =>
  import("@/features/agent-app").then((module) => ({
    default: module.AgentAppsPage,
  }));

const loadAgentAppRuntimePage = () =>
  import("@/features/agent-app").then((module) => ({
    default: module.AgentAppRuntimePage,
  }));
const loadExpertPlazaPage = () =>
  import("./experts").then((module) => ({
    default: module.ExpertPlazaPage,
  }));
const loadBrowserRuntimeWorkspace = () =>
  import("@/features/browser-runtime").then((module) => ({
    default: module.BrowserRuntimeWorkspace,
  }));
const loadAgentChatPage = () =>
  import("./agent/chat").then((module) => ({
    default: module.AgentChatPage,
  }));

const ResourcesPage = lazy(loadResourcesPage);
const SkillsWorkspacePage = lazy(loadSkillsWorkspacePage);
const PluginMarketplacePage = lazy(loadPluginMarketplacePage);
const KnowledgePage = lazy(loadKnowledgePage);
const AgentAppLabPage = lazy(loadAgentAppLabPage);
const AgentAppsPage = lazy(loadAgentAppsPage);
const AgentAppRuntimePage = lazy(loadAgentAppRuntimePage);
const ExpertPlazaPage = lazy(loadExpertPlazaPage);
const BrowserRuntimeWorkspace = lazy(loadBrowserRuntimeWorkspace);
const AgentChatPage = lazy(loadAgentChatPage);

interface AppPageContentProps {
  currentPage: Page;
  pageParams: PageParams;
  requestedPage?: Page;
  requestedPageParams?: PageParams;
  onNavigate: (page: Page, params?: PageParams) => void;
  onAgentHasMessagesChange: (hasMessages: boolean) => void;
  onAgentSessionChange?: (sessionId: string | null) => void;
  onAgentStreamingChange?: (isStreaming: boolean) => void;
  activeAgentSessionTarget?: AgentAppRightSurfaceLaunchTarget | null;
  agentSessionTargets?: AgentAppRightSurfaceLaunchTarget[] | null;
  onAgentSessionTargetChange?: (
    target: AgentAppRightSurfaceLaunchTarget | null,
  ) => void;
}

export function AppPageContent({
  currentPage,
  pageParams,
  requestedPage,
  requestedPageParams,
  onNavigate,
  onAgentHasMessagesChange,
  onAgentSessionChange,
  onAgentStreamingChange,
  activeAgentSessionTarget,
  agentSessionTargets,
  onAgentSessionTargetChange,
}: AppPageContentProps) {
  const activePage = requestedPage ?? currentPage;
  const activePageParams = requestedPageParams ?? pageParams;
  const agentSessionWorkspaceId =
    activePage === "agent"
      ? ((activePageParams as AgentPageParams).projectId ?? null)
      : null;
  const handleAgentSessionChange = useCallback(
    (sessionId: string | null) => {
      const normalizedSessionId = sessionId?.trim();
      onAgentSessionChange?.(normalizedSessionId || null);
      onAgentSessionTargetChange?.(
        normalizedSessionId
          ? {
              sessionId: normalizedSessionId,
              workspaceId: agentSessionWorkspaceId,
            }
          : null,
      );
    },
    [agentSessionWorkspaceId, onAgentSessionChange, onAgentSessionTargetChange],
  );

  if (activePage === "automation") {
    return (
      <div style={columnPageStyle}>
        <AutomationPage
          onNavigate={onNavigate}
          pageParams={activePageParams as AutomationPageParams}
        />
      </div>
    );
  }

  if (activePage === "channels") {
    return (
      <div style={columnPageStyle}>
        <div className="flex-1 overflow-auto px-6 py-6">
          <div className="mx-auto w-full max-w-[1440px]">
            <ImConfigPage />
          </div>
        </div>
      </div>
    );
  }

  if (activePage === "agent") {
    const agentPageParams = activePageParams as AgentPageParams;

    return (
      <div style={columnPageStyle}>
        <AgentChatPage
          onNavigate={onNavigate}
          projectId={agentPageParams.projectId}
          contentId={agentPageParams.contentId}
          initialSessionId={agentPageParams.initialSessionId}
          initialSceneAppExecutionSummary={
            agentPageParams.initialSceneAppExecutionSummary
          }
          initialRequestMetadata={agentPageParams.initialRequestMetadata}
          initialAutoSendRequestMetadata={
            agentPageParams.initialAutoSendRequestMetadata
          }
          autoRunInitialPromptOnMount={
            agentPageParams.autoRunInitialPromptOnMount
          }
          initialUserPrompt={agentPageParams.initialUserPrompt}
          initialUserImages={agentPageParams.initialUserImages}
          initialCreationMode={agentPageParams.initialCreationMode}
          initialSessionName={agentPageParams.initialSessionName}
          entryBannerMessage={agentPageParams.entryBannerMessage}
          immersiveHome={agentPageParams.immersiveHome}
          openBrowserAssistOnMount={agentPageParams.openBrowserAssistOnMount}
          initialSiteSkillLaunch={agentPageParams.initialSiteSkillLaunch}
          initialPendingServiceSkillLaunch={
            agentPageParams.initialPendingServiceSkillLaunch
          }
          initialInputCapability={agentPageParams.initialInputCapability}
          preferHomeForInitialInputCapability={
            agentPageParams.preferHomeForInitialInputCapability
          }
          initialKnowledgePackSelection={
            agentPageParams.initialKnowledgePackSelection
          }
          initialProjectFileOpenTarget={
            agentPageParams.initialProjectFileOpenTarget
          }
          theme={agentPageParams.theme}
          lockTheme={agentPageParams.lockTheme}
          fromResources={agentPageParams.fromResources}
          agentEntry={agentPageParams.agentEntry}
          showChatPanel={
            agentPageParams.agentEntry !== "new-task" &&
            !agentPageParams.immersiveHome
          }
          newChatAt={agentPageParams.newChatAt}
          expertAgentLaunch={agentPageParams.expertAgentLaunch}
          onHasMessagesChange={onAgentHasMessagesChange}
          onSessionChange={handleAgentSessionChange}
          onAgentStreamingChange={onAgentStreamingChange}
        />
      </div>
    );
  }

  if (activePage === "resources") {
    return (
      <div style={columnPageStyle}>
        <ResourcesPage
          onNavigate={onNavigate}
          pageParams={activePageParams as ResourcesPageParams}
        />
      </div>
    );
  }

  if (activePage === "browser-runtime") {
    const browserRuntimeParams = activePageParams as BrowserRuntimePageParams;

    return (
      <PageWrapper $isActive={true}>
        <BrowserRuntimeWorkspace
          active={true}
          onNavigate={onNavigate}
          initialProfileKey={browserRuntimeParams.initialProfileKey}
          initialSessionId={browserRuntimeParams.initialSessionId}
          initialTargetId={browserRuntimeParams.initialTargetId}
          currentProjectId={browserRuntimeParams.projectId}
          currentContentId={browserRuntimeParams.contentId}
          initialAdapterName={browserRuntimeParams.initialAdapterName}
          initialArgs={browserRuntimeParams.initialArgs}
          initialAutoRun={browserRuntimeParams.initialAutoRun}
          initialRequireAttachedSession={
            browserRuntimeParams.initialRequireAttachedSession
          }
          initialSaveTitle={browserRuntimeParams.initialSaveTitle}
        />
      </PageWrapper>
    );
  }

  if (activePage === "skills") {
    return (
      <div style={columnPageStyle}>
        <SkillsWorkspacePage
          onNavigate={onNavigate}
          pageParams={activePageParams as SkillsPageParams}
        />
      </div>
    );
  }

  if (activePage === "plugins") {
    return (
      <div style={columnPageStyle}>
        <PluginMarketplacePage
          onNavigate={onNavigate}
          pageParams={activePageParams as PluginsPageParams}
        />
      </div>
    );
  }

  if (activePage === "agent-app-lab") {
    return (
      <div style={columnPageStyle}>
        <AgentAppLabPage />
      </div>
    );
  }

  if (activePage === "agent-app") {
    return (
      <div style={columnPageStyle}>
        <AgentAppRuntimePage
          pageParams={activePageParams as AgentAppPageParams}
        />
      </div>
    );
  }

  if (activePage === "agent-apps") {
    return (
      <div style={columnPageStyle}>
        <AgentAppsPage
          onNavigate={onNavigate}
          pageParams={activePageParams as AgentAppsPageParams}
          rightSurfaceTarget={activeAgentSessionTarget}
          rightSurfaceTargets={agentSessionTargets}
        />
      </div>
    );
  }

  if (activePage === "experts") {
    return (
      <div style={columnPageStyle}>
        <ExpertPlazaPage onNavigate={onNavigate} />
      </div>
    );
  }

  if (activePage === "knowledge") {
    return (
      <div style={{ ...columnPageStyle, overflow: "hidden" }}>
        <KnowledgePage
          onNavigate={onNavigate}
          pageParams={activePageParams as KnowledgePageParams}
        />
      </div>
    );
  }

  if (activePage === "settings") {
    return (
      <div style={columnPageStyle}>
        <SettingsPageV2
          onNavigate={onNavigate}
          initialTab={(activePageParams as SettingsPageParams).tab}
          initialProviderView={
            (activePageParams as SettingsPageParams).providerView
          }
          initialProviderFocus={
            (activePageParams as SettingsPageParams).providerFocus
          }
          initialExecutionPolicyFocus={
            (activePageParams as SettingsPageParams).executionPolicyFocus
          }
        />
      </div>
    );
  }

  return null;
}
