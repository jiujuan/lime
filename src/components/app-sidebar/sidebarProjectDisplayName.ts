import type { SidebarOpenedProjectSummary } from "@/components/app-sidebar/sidebarConversationGroups";

export function resolveProjectDisplayName(
  project: SidebarOpenedProjectSummary,
) {
  return project.name.trim() || project.id;
}
