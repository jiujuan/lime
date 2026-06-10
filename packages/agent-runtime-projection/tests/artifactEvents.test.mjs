import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentUiArtifactSnapshotEvent } from "../dist/index.js";

test("artifact snapshot helper builds completed artifact preview events", () => {
  const event = buildAgentUiArtifactSnapshotEvent(
    {
      artifactId: "artifact-1",
      filePath: ".lime/artifacts/report.md",
      content: "# 报告",
      metadata: {
        complete: true,
        kind: "markdown",
      },
    },
    {
      sessionId: "session-artifact",
      threadId: "thread-artifact",
      turnId: "turn-artifact",
      timestamp: "2026-06-10T00:00:00.000Z",
    },
  );

  assert.equal(event.sourceType, "artifact_snapshot");
  assert.equal(event.timestamp, "2026-06-10T00:00:00.000Z");
  assert.equal(event.sessionId, "session-artifact");
  assert.equal(event.type, "artifact.preview.ready");
  assert.equal(event.artifactId, "artifact-1");
  assert.equal(event.owner, "artifact");
  assert.equal(event.scope, "artifact");
  assert.equal(event.phase, "completed");
  assert.equal(event.surface, "artifact_workspace");
  assert.equal(event.persistence, "artifact_store");
  assert.deepEqual(event.payload, {
    filePath: ".lime/artifacts/report.md",
    contentLength: 4,
    complete: true,
    metadataKeys: ["complete", "kind"],
  });
  assert.deepEqual(event.refs, {
    artifactIds: ["artifact-1"],
    artifactPaths: [".lime/artifacts/report.md"],
  });
});

test("artifact snapshot helper builds producing artifact update events", () => {
  const event = buildAgentUiArtifactSnapshotEvent(
    {
      sourceType: "artifact_snapshot",
      artifactId: "artifact-2",
      filePath: ".lime/artifacts/draft.md",
      content: "草稿",
      metadata: {
        complete: false,
      },
    },
    {
      sessionId: "session-artifact",
    },
  );

  assert.equal(event.type, "artifact.updated");
  assert.equal(event.artifactId, "artifact-2");
  assert.equal(event.phase, "producing");
  assert.deepEqual(event.payload, {
    filePath: ".lime/artifacts/draft.md",
    contentLength: 2,
    complete: false,
    metadataKeys: ["complete"],
  });
  assert.deepEqual(event.refs, {
    artifactIds: ["artifact-2"],
    artifactPaths: [".lime/artifacts/draft.md"],
  });
});
