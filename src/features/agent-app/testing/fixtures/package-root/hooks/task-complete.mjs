export default function taskCompleteHook(input = {}) {
  return {
    hook: "task-complete",
    pluginId: "content-factory-app",
    artifactKind:
      input.artifactKind ?? input.expectedArtifactKind ?? "content_factory.workspace_patch",
    requiredEvidence: [
      "workflowKey",
      "orchestration",
      "researchRounds",
      "articleDraft"
    ]
  };
}
