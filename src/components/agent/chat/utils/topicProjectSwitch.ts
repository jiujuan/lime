import {
  isLockedProjectConflict,
  normalizeProjectId,
} from "./topicProjectResolution";

export interface TopicProjectSnapshot {
  id: string;
  isArchived?: boolean;
}

export interface ResolveTopicSwitchProjectOptions {
  lockedProjectId?: string | null;
  topicBoundProjectId?: string | null;
  lastProjectId?: string | null;
  loadProjectById: (projectId: string) => Promise<TopicProjectSnapshot | null>;
}

export type ResolveTopicSwitchProjectResult =
  | { status: "blocked"; reason: "locked_project_conflict" }
  | { status: "missing"; reason: "no_available_project" }
  | { status: "ok"; projectId: string };

function normalizeActiveProjectId(
  project: TopicProjectSnapshot | null | undefined,
): string | null {
  if (!project || project.isArchived) {
    return null;
  }
  return normalizeProjectId(project.id);
}

export async function resolveTopicSwitchProject({
  lockedProjectId,
  topicBoundProjectId,
  lastProjectId,
  loadProjectById,
}: ResolveTopicSwitchProjectOptions): Promise<ResolveTopicSwitchProjectResult> {
  const locked = normalizeProjectId(lockedProjectId);
  const topicBound = normalizeProjectId(topicBoundProjectId);

  if (locked) {
    if (isLockedProjectConflict(locked, topicBound)) {
      return { status: "blocked", reason: "locked_project_conflict" };
    }
    return { status: "ok", projectId: locked };
  }

  const candidateProjectIds = [
    normalizeProjectId(topicBoundProjectId),
    normalizeProjectId(lastProjectId),
  ].filter((projectId, index, list): projectId is string => {
    if (!projectId) {
      return false;
    }
    return list.indexOf(projectId) === index;
  });

  for (const candidateProjectId of candidateProjectIds) {
    const candidateProject = await loadProjectById(candidateProjectId);
    const normalizedCandidateId = normalizeActiveProjectId(candidateProject);
    if (normalizedCandidateId) {
      return {
        status: "ok",
        projectId: normalizedCandidateId,
      };
    }
  }

  return { status: "missing", reason: "no_available_project" };
}
