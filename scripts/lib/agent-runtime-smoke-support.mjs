const CHAT_COMPLETIONS_PATH = "/v1/chat/completions";

export function workspaceIdFromDefaultProject(workspace) {
  return String(
    workspace?.id || workspace?.workspace_id || workspace?.workspaceId || "",
  ).trim();
}

export function workspaceRootFromDefaultProject(workspace) {
  return String(
    workspace?.root_path || workspace?.rootPath || workspace?.path || "",
  ).trim();
}

export function fixtureChatRequests(fixtureRequests) {
  return fixtureRequests.filter(
    (request) => request.path === CHAT_COMPLETIONS_PATH,
  );
}

export function fixtureChatRequestCount(fixtureRequests) {
  return fixtureChatRequests(fixtureRequests).length;
}
