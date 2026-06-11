import type { AsterSessionInfo } from "@/lib/api/agentRuntime";

export interface SidebarOpenedProjectSummary {
  id: string;
  name: string;
  rootPath?: string | null;
}

export interface SidebarConversationProjectSection {
  project: SidebarOpenedProjectSummary;
  sessions: AsterSessionInfo[];
}

interface BuildSidebarConversationGroupsParams {
  sessions: AsterSessionInfo[];
  openedProjects: SidebarOpenedProjectSummary[];
}

interface SidebarConversationGroups {
  projectSections: SidebarConversationProjectSection[];
  standaloneSessions: AsterSessionInfo[];
}

function normalizeId(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizePathKey(value?: string | null): string | null {
  const normalized = value?.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized ? normalized : null;
}

function sessionBelongsToProject(
  session: AsterSessionInfo,
  project: SidebarOpenedProjectSummary,
): boolean {
  const projectId = normalizeId(project.id);
  if (projectId && normalizeId(session.workspace_id) === projectId) {
    return true;
  }

  const projectRootPath = normalizePathKey(project.rootPath);
  if (!projectRootPath || normalizeId(session.workspace_id)) {
    return false;
  }

  return normalizePathKey(session.working_dir) === projectRootPath;
}

function dedupeOpenedProjects(
  openedProjects: SidebarOpenedProjectSummary[],
): SidebarOpenedProjectSummary[] {
  const seen = new Set<string>();
  return openedProjects.filter((project) => {
    const projectId = normalizeId(project.id);
    if (!projectId || seen.has(projectId)) {
      return false;
    }
    seen.add(projectId);
    return true;
  });
}

export function buildSidebarConversationGroups({
  sessions,
  openedProjects,
}: BuildSidebarConversationGroupsParams): SidebarConversationGroups {
  const normalizedOpenedProjects = dedupeOpenedProjects(openedProjects);
  const openedProjectRootPaths = new Set(
    normalizedOpenedProjects
      .map((project) => normalizePathKey(project.rootPath))
      .filter((rootPath): rootPath is string => Boolean(rootPath)),
  );
  const scopedSessions = sessions.filter((session) => !session.archived_at);

  const projectSections = normalizedOpenedProjects.map((project) => {
    return {
      project,
      sessions: scopedSessions.filter((session) =>
        sessionBelongsToProject(session, project),
      ),
    };
  });

  const standaloneSessions = scopedSessions.filter((session) => {
    const workspaceId = normalizeId(session.workspace_id);
    if (workspaceId) {
      return false;
    }

    const workingDir = normalizePathKey(session.working_dir);
    return !workingDir || !openedProjectRootPaths.has(workingDir);
  });

  return {
    projectSections,
    standaloneSessions,
  };
}

export function flattenSidebarConversationGroups({
  projectSections,
  standaloneSessions,
}: SidebarConversationGroups): AsterSessionInfo[] {
  return [
    ...projectSections.flatMap((section) => section.sessions),
    ...standaloneSessions,
  ];
}
