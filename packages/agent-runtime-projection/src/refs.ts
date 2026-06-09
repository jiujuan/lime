import type { AgentUiProjectionRefs } from "@limecloud/agent-ui-contracts";

import { readRecord, readStringArray } from "./normalization.js";

export function extractArtifactRefs(metadata: unknown): AgentUiProjectionRefs {
  const record = readRecord(metadata);
  if (!record) {
    return {};
  }

  const artifactIds = [
    ...readStringArray(record.artifact_id),
    ...readStringArray(record.artifactId),
    ...readStringArray(record.artifact_ids),
    ...readStringArray(record.artifactIds),
  ];
  const artifactPaths = [
    ...readStringArray(record.artifact_path),
    ...readStringArray(record.artifactPath),
    ...readStringArray(record.artifact_paths),
    ...readStringArray(record.artifactPaths),
    ...readStringArray(record.file_path),
    ...readStringArray(record.filePath),
  ];

  return {
    ...(artifactIds.length > 0
      ? { artifactIds: [...new Set(artifactIds)] }
      : {}),
    ...(artifactPaths.length > 0
      ? { artifactPaths: [...new Set(artifactPaths)] }
      : {}),
  };
}
