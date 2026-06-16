import type { AsterSessionInfo } from "@/lib/api/agentRuntime";

export interface SidebarOpenedProjectSummary {
  id: string;
  name: string;
  rootPath?: string | null;
  isFavorite?: boolean;
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

function normalizePath(value?: string | null): string | null {
  const normalized = value?.trim().replace(/[\\/]+$/u, "");
  return normalized ? normalized : null;
}

function sessionBelongsToProject(
  session: AsterSessionInfo,
  project: SidebarOpenedProjectSummary,
): boolean {
  const projectRoot = normalizePath(project.rootPath);
  const sessionCwd = normalizePath(session.working_dir);
  return Boolean(projectRoot && sessionCwd && projectRoot === sessionCwd);
}

function dedupeOpenedProjects(
  openedProjects: SidebarOpenedProjectSummary[],
): SidebarOpenedProjectSummary[] {
  const seen = new Set<string>();
  return openedProjects.filter((project) => {
    const projectKey = normalizePath(project.rootPath) ?? normalizeId(project.id);
    if (!projectKey || seen.has(projectKey)) {
      return false;
    }
    seen.add(projectKey);
    return true;
  });
}

export function buildSidebarConversationGroups({
  sessions,
  openedProjects,
}: BuildSidebarConversationGroupsParams): SidebarConversationGroups {
  const normalizedOpenedProjects = dedupeOpenedProjects(openedProjects);
  const scopedSessions = sessions.filter((session) => !session.archived_at);

  const projectSections = normalizedOpenedProjects.map((project) => {
    return {
      project,
      sessions: scopedSessions.filter((session) =>
        sessionBelongsToProject(session, project),
      ),
    };
  });

  const projectSessionIds = new Set(
    projectSections.flatMap((section) =>
      section.sessions.map((session) => session.id),
    ),
  );
  const standaloneSessions = scopedSessions.filter(
    (session) =>
      !normalizePath(session.working_dir) &&
      !normalizeId(session.workspace_id) &&
      !projectSessionIds.has(session.id),
  );

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
