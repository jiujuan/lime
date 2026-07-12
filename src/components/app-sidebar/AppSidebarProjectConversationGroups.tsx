import type { MouseEvent, ReactNode } from "react";
import styled from "styled-components";
import {
  ChevronRight,
  FolderOpen,
  MoreHorizontal,
  MessageSquarePlus,
} from "lucide-react";
import type { AgentSessionInfo } from "@/lib/api/agentRuntime";
import type { SidebarOpenedProjectSummary } from "@/components/app-sidebar/sidebarConversationGroups";
import { resolveProjectDisplayName } from "@/components/app-sidebar/sidebarProjectDisplayName";

interface SidebarProjectConversationSection {
  project: SidebarOpenedProjectSummary;
  sessions: AgentSessionInfo[];
}

interface AppSidebarProjectConversationGroupsProps {
  projectSections: SidebarProjectConversationSection[];
  collapsedProjectIds: ReadonlySet<string>;
  newProjectConversationLabel: string;
  projectMoreActionsLabel: string;
  formatNewProjectConversationForLabel: (projectName: string) => string;
  formatOpenProjectMenuLabel: (projectName: string) => string;
  renderConversationRow: (session: AgentSessionInfo) => ReactNode;
  onCreateConversation: (project: SidebarOpenedProjectSummary) => void;
  onToggleProjectCollapsed: (projectId: string) => void;
  onOpenProjectMenu: (
    event: MouseEvent<HTMLButtonElement>,
    project: SidebarOpenedProjectSummary,
  ) => void;
}

const ProjectGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const ProjectHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const ProjectButton = styled.button`
  min-height: 34px;
  min-width: 0;
  flex: 1;
  border: none;
  border-radius: 11px;
  background: transparent;
  color: var(--sidebar-foreground);
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 10px;
  cursor: pointer;
  text-align: left;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;

  &:hover {
    background: var(--sidebar-hover);
  }

  svg {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    color: var(--sidebar-muted);
  }
`;

const ProjectChevron = styled.span<{ $collapsed: boolean }>`
  width: 15px;
  height: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--sidebar-muted);
  transform: rotate(${({ $collapsed }) => ($collapsed ? "0deg" : "90deg")});
  transition:
    transform 0.16s ease,
    color 0.16s ease;
`;

const ProjectName = styled.span`
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 650;
`;

const ProjectMenuButton = styled.button`
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--sidebar-muted);
  cursor: pointer;
  opacity: 0.76;
  transition:
    background-color 0.16s ease,
    color 0.16s ease,
    opacity 0.16s ease;

  &:hover {
    background: var(--sidebar-hover);
    color: var(--sidebar-foreground);
    opacity: 1;
  }

  svg {
    width: 15px;
    height: 15px;
  }
`;

const ProjectConversationList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-left: 14px;
`;

export function AppSidebarProjectConversationGroups({
  projectSections,
  collapsedProjectIds,
  newProjectConversationLabel,
  projectMoreActionsLabel,
  formatNewProjectConversationForLabel,
  formatOpenProjectMenuLabel,
  renderConversationRow,
  onCreateConversation,
  onToggleProjectCollapsed,
  onOpenProjectMenu,
}: AppSidebarProjectConversationGroupsProps) {
  return (
    <>
      {projectSections.map((section) => {
        const projectName = resolveProjectDisplayName(section.project);
        const collapsed = collapsedProjectIds.has(section.project.id);

        return (
          <ProjectGroup
            key={section.project.id}
            data-testid="app-sidebar-project-conversation-group"
          >
            <ProjectHeader>
              <ProjectButton
                type="button"
                title={projectName}
                aria-expanded={!collapsed}
                onClick={() => onToggleProjectCollapsed(section.project.id)}
              >
                <ProjectChevron $collapsed={collapsed}>
                  <ChevronRight />
                </ProjectChevron>
                <FolderOpen />
                <ProjectName>{projectName}</ProjectName>
              </ProjectButton>
              <ProjectMenuButton
                type="button"
                aria-label={formatNewProjectConversationForLabel(projectName)}
                title={newProjectConversationLabel}
                data-testid="app-sidebar-project-new-conversation"
                onClick={() => onCreateConversation(section.project)}
              >
                <MessageSquarePlus />
              </ProjectMenuButton>
              <ProjectMenuButton
                type="button"
                aria-label={formatOpenProjectMenuLabel(projectName)}
                title={projectMoreActionsLabel}
                data-testid="app-sidebar-project-menu-button"
                onClick={(event) => onOpenProjectMenu(event, section.project)}
              >
                <MoreHorizontal />
              </ProjectMenuButton>
            </ProjectHeader>
            {!collapsed ? (
              <ProjectConversationList>
                {section.sessions.length > 0
                  ? section.sessions.map((session) =>
                      renderConversationRow(session),
                    )
                  : null}
              </ProjectConversationList>
            ) : null}
          </ProjectGroup>
        );
      })}
    </>
  );
}
