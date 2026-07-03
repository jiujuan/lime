export default function promptSubmitHook(input = {}) {
  return {
    hook: "prompt-submit",
    pluginId: "content-factory-app",
    workflowKey: input.workflowKey ?? "content_article_workflow",
    policy: {
      articleBodySurface: "articleWorkspace",
      chatOutput: "artifactCardOnly",
      requireEvidence: true
    }
  };
}
