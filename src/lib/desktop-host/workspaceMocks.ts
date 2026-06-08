export const workspaceMocks: Record<string, (args?: any) => any> = {
  get_or_create_default_project: () => ({
    id: "workspace-default",
    name: "默认工作区",
    workspace_type: "general",
    root_path: "/tmp/lime/workspaces/default",
    is_default: true,
    is_favorite: true,
    is_archived: false,
    created_at: Date.now(),
    updated_at: Date.now(),
    tags: [],
  }),
  workspace_get_projects_root: () => "/mock/workspace/projects",
};
